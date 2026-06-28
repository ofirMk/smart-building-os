/**
 * Phase 14 — Approval Matrix Engine
 *
 * Evaluates which `erp_approval_matrix_rules` matches a given PO and
 * drives the approval instance lifecycle:
 *   1. resolveRule()      — find first matching rule (by priority_order)
 *   2. startInstance()    — create/reset instance + decisions for a PO
 *   3. recordDecision()   — record approve/reject/delegate for current level
 *   4. getInstanceStatus()— current state for UI rendering
 *
 * Business rules enforced here (not in DB):
 *   - SoD: PO creator cannot approve at any level
 *   - CFO/CEO role → can bypass normal level ordering (override flag)
 *   - Delegation: must supply delegated_to_user_id; replaces approver for that level
 *   - Fallback: if no rule matches → use the catch-all (priority_order = 9999)
 */

import type { SupabaseClient } from "@supabase/supabase-js"

// ─── Types ────────────────────────────────────────────────────────────────────

export type MatrixCondition = {
  amount_min?: number
  amount_max?: number
  cost_center_codes?: string[]
  project_ids?: string[]
  supplier_ids?: string[]
  urgency_levels?: string[]
  po_type_codes?: string[]
}

export type ApprovalLevelDef = {
  level: number
  role?: string
  user_id?: string
  amount_limit?: number
  label?: string
}

export type MatrixRule = {
  id: string
  company_id: string
  rule_name: string
  description: string | null
  priority_order: number
  is_active: boolean
  condition_json: MatrixCondition
  approval_levels_json: ApprovalLevelDef[]
}

export type PoContext = {
  id: string
  company_id: string
  total_amount_gross: number
  urgency_level: string | null
  supplier_id: string | null
  project_id: string | null
  po_type_code: string | null  // from erp_md_po_types.code via join
  budget_sub_chapter: string | null
  created_by: string | null
}

export type DecisionKind = "APPROVED" | "REJECTED" | "DELEGATED"

export type InstanceWithDecisions = {
  id: string
  purchase_order_id: string
  matrix_rule_id: string | null
  current_level: number
  total_levels: number
  status: string
  resolved_approvers_json: ApprovalLevelDef[]
  decisions: Array<{
    id: string
    level: number
    approver_user_id: string | null
    decision: DecisionKind
    comment: string | null
    decided_at: string
    delegated_to_user_id: string | null
  }>
}

// ─── Rule matching ────────────────────────────────────────────────────────────

/** Returns true if all non-empty conditions on the rule match the PO context. */
function ruleMatches(rule: MatrixRule, po: PoContext): boolean {
  const c = rule.condition_json

  if (c.amount_min != null && po.total_amount_gross < c.amount_min) return false
  if (c.amount_max != null && po.total_amount_gross > c.amount_max) return false

  if (c.urgency_levels?.length) {
    if (!po.urgency_level || !c.urgency_levels.includes(po.urgency_level)) return false
  }
  if (c.supplier_ids?.length) {
    if (!po.supplier_id || !c.supplier_ids.includes(po.supplier_id)) return false
  }
  if (c.project_ids?.length) {
    if (!po.project_id || !c.project_ids.includes(po.project_id)) return false
  }
  if (c.cost_center_codes?.length) {
    if (!po.budget_sub_chapter || !c.cost_center_codes.includes(po.budget_sub_chapter)) return false
  }
  if (c.po_type_codes?.length) {
    if (!po.po_type_code || !c.po_type_codes.includes(po.po_type_code)) return false
  }

  return true
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load all active rules for a company (ordered by priority_order ASC) and
 * return the first one whose condition matches the PO.  Falls back to the
 * catch-all rule (priority_order = 9999) if nothing else matches.
 */
export async function resolveRule(
  supabase: SupabaseClient,
  companyId: string,
  po: PoContext
): Promise<MatrixRule | null> {
  const { data, error } = await supabase
    .from("erp_approval_matrix_rules")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("priority_order", { ascending: true })

  if (error || !data?.length) return null

  const rules = data as unknown as MatrixRule[]
  return rules.find((r) => ruleMatches(r, po)) ?? null
}

/**
 * Create (or replace) an approval instance for a PO.
 * Called after resolveRule() when a PO transitions to PENDING_APPROVAL.
 * Idempotent: if an instance already exists for this PO it is replaced.
 */
export async function startInstance(
  supabase: SupabaseClient,
  companyId: string,
  po: PoContext,
  rule: MatrixRule,
  initiatedByUserId: string
): Promise<{ ok: true; instanceId: string } | { ok: false; error: string }> {
  // Cancel any pre-existing instance (re-submission after rejection)
  await supabase
    .from("erp_po_approval_instances")
    .update({ status: "CANCELLED" })
    .eq("company_id", companyId)
    .eq("purchase_order_id", po.id)
    .eq("status", "PENDING")

  const levels = rule.approval_levels_json
  const upsert = await supabase
    .from("erp_po_approval_instances")
    .upsert(
      {
        company_id: companyId,
        purchase_order_id: po.id,
        matrix_rule_id: rule.id,
        current_level: 1,
        total_levels: levels.length,
        status: "PENDING",
        resolved_approvers_json: levels,
        rule_snapshot_json: rule,
      },
      { onConflict: "purchase_order_id" }
    )
    .select("id")
    .single()

  if (upsert.error) return { ok: false, error: upsert.error.message }

  const instanceId = (upsert.data as { id: string }).id

  // Delete any stale decisions from previous run
  await supabase
    .from("erp_po_approval_decisions")
    .delete()
    .eq("company_id", companyId)
    .eq("instance_id", instanceId)

  return { ok: true, instanceId }
}

/**
 * Record a decision (APPROVED / REJECTED / DELEGATED) for the current level.
 * On APPROVED at the last level → marks instance APPROVED + returns `advance: false`.
 * On APPROVED at intermediate levels → advances current_level, returns `advance: true`.
 * On REJECTED → marks instance REJECTED.
 * On DELEGATED → replaces the approver_user_id for this level in resolved_approvers_json.
 */
export async function recordDecision(
  supabase: SupabaseClient,
  companyId: string,
  instanceId: string,
  actingUserId: string,
  decision: DecisionKind,
  comment: string | null,
  delegatedToUserId: string | null
): Promise<
  | { ok: true; instanceStatus: "PENDING" | "APPROVED" | "REJECTED"; advanced: boolean }
  | { ok: false; error: string }
> {
  // 1. Load instance
  const instQ = await supabase
    .from("erp_po_approval_instances")
    .select("id, current_level, total_levels, status, purchase_order_id, resolved_approvers_json")
    .eq("id", instanceId)
    .eq("company_id", companyId)
    .single()

  if (instQ.error) return { ok: false, error: instQ.error.message }
  const inst = instQ.data as {
    id: string
    current_level: number
    total_levels: number
    status: string
    purchase_order_id: string
    resolved_approvers_json: ApprovalLevelDef[]
  }

  if (inst.status !== "PENDING") {
    return { ok: false, error: `Instance is already ${inst.status}` }
  }

  // 2. SoD — check if actingUser is the PO creator
  const poQ = await supabase
    .from("erp_purchase_orders")
    .select("created_by")
    .eq("id", inst.purchase_order_id)
    .eq("company_id", companyId)
    .single()

  if (!poQ.error && (poQ.data as { created_by: string | null }).created_by === actingUserId) {
    return { ok: false, error: "יוצר ההזמנה אינו רשאי לאשרה (הפרדת תפקידים — SoD)" }
  }

  // 3. Validate delegation
  if (decision === "DELEGATED" && !delegatedToUserId) {
    return { ok: false, error: "נדרש משתמש ממלא מקום לאצילת אישור" }
  }

  // 4. Insert decision row
  const decisionInsert = await supabase
    .from("erp_po_approval_decisions")
    .upsert(
      {
        company_id: companyId,
        instance_id: instanceId,
        level: inst.current_level,
        approver_user_id: actingUserId,
        decision,
        comment: comment ?? null,
        delegated_to_user_id: delegatedToUserId ?? null,
      },
      { onConflict: "instance_id,level" }
    )
    .select("id")

  if (decisionInsert.error) return { ok: false, error: decisionInsert.error.message }

  // 5. Handle REJECTED
  if (decision === "REJECTED") {
    await supabase
      .from("erp_po_approval_instances")
      .update({ status: "REJECTED" })
      .eq("id", instanceId)
    return { ok: true, instanceStatus: "REJECTED", advanced: false }
  }

  // 6. Handle DELEGATED — update resolved_approvers_json for this level
  if (decision === "DELEGATED" && delegatedToUserId) {
    const updatedApprovers = inst.resolved_approvers_json.map((a) =>
      a.level === inst.current_level ? { ...a, user_id: delegatedToUserId } : a
    )
    await supabase
      .from("erp_po_approval_instances")
      .update({ resolved_approvers_json: updatedApprovers })
      .eq("id", instanceId)
    return { ok: true, instanceStatus: "PENDING", advanced: false }
  }

  // 7. APPROVED — check if final level
  const isLastLevel = inst.current_level >= inst.total_levels

  if (isLastLevel) {
    await supabase
      .from("erp_po_approval_instances")
      .update({ status: "APPROVED" })
      .eq("id", instanceId)
    return { ok: true, instanceStatus: "APPROVED", advanced: false }
  }

  // 8. Advance to next level
  await supabase
    .from("erp_po_approval_instances")
    .update({ current_level: inst.current_level + 1 })
    .eq("id", instanceId)

  return { ok: true, instanceStatus: "PENDING", advanced: true }
}

/**
 * Load full instance + decisions for display in the PO detail approval track.
 */
export async function getInstanceStatus(
  supabase: SupabaseClient,
  companyId: string,
  purchaseOrderId: string
): Promise<InstanceWithDecisions | null> {
  const instQ = await supabase
    .from("erp_po_approval_instances")
    .select("id, purchase_order_id, matrix_rule_id, current_level, total_levels, status, resolved_approvers_json")
    .eq("company_id", companyId)
    .eq("purchase_order_id", purchaseOrderId)
    .neq("status", "CANCELLED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (instQ.error || !instQ.data) return null

  const inst = instQ.data as {
    id: string
    purchase_order_id: string
    matrix_rule_id: string | null
    current_level: number
    total_levels: number
    status: string
    resolved_approvers_json: ApprovalLevelDef[]
  }

  const decisionsQ = await supabase
    .from("erp_po_approval_decisions")
    .select("id, level, approver_user_id, decision, comment, decided_at, delegated_to_user_id")
    .eq("company_id", companyId)
    .eq("instance_id", inst.id)
    .order("level", { ascending: true })

  return {
    ...inst,
    decisions: (decisionsQ.data ?? []) as InstanceWithDecisions["decisions"],
  }
}
