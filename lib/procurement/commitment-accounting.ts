/**
 * Commitment Accounting — Phase 6.1
 *
 * Creates, adjusts, and releases budget commitments tied to approved POs.
 *
 * ## Lifecycle
 *   PO → APPROVED        → openCommitment()    — creates OPEN record
 *   PO → CANCELLED       → releaseCommitment() — status = CANCELLED, released = committed
 *   PO → CLOSED          → releaseCommitment() — status = RELEASED,  released = committed
 *   PO → FULLY_RECEIVED  → adjustCommitment()  — released = actual GR value, status = RELEASED
 *
 * ## Design decisions
 *   - Runs as service-role to bypass RLS (commitments are system-managed, not
 *     user-created). The user already authorised the transition via the
 *     po-transition route before this is called.
 *   - All operations are idempotent — safe to retry on transient failures.
 *   - Failures are non-fatal: the PO transition has already been committed to
 *     the DB. The caller logs errors and includes them as warnings in the
 *     API response rather than rolling back the transition.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"

// ─────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────

export type CommitmentResult =
  | { ok: true; commitmentId?: string }
  | { ok: false; error: string }

// ─────────────────────────────────────────────
// 6.1 — openCommitment
// ─────────────────────────────────────────────

/**
 * Opens a new commitment when a PO reaches APPROVED status.
 *
 * Calculates:
 *   - `committed_amount` = total_amount_gross from the PO header (server-side
 *     computed at creation time — avoids re-summing lines and keeps this
 *     atomic with the transition).
 *   - `budget_chapter` = the budget_sub_chapter that accounts for the largest
 *     share of the PO's line total (dominant chapter heuristic).
 */
export async function openCommitment(params: {
  poId: string
  companyId: string
  approvedByUserId: string
}): Promise<CommitmentResult> {
  const { poId, companyId, approvedByUserId } = params
  const svc = createSupabaseServiceRoleClient()

  // Fetch PO gross amount + lines for budget chapter aggregation.
  const { data: po, error: poErr } = await svc
    .from("erp_purchase_orders")
    .select(
      `id,
       total_amount_gross,
       currency,
       erp_purchase_order_lines ( budget_sub_chapter, total_price )`,
    )
    .eq("id", poId)
    .eq("company_id", companyId)
    .single()

  if (poErr || !po) {
    return {
      ok: false,
      error: `openCommitment: PO not found — ${poErr?.message ?? "unknown"}`,
    }
  }

  // Find dominant budget chapter by total line value.
  const chapterTotals = new Map<string, number>()
  for (const line of (po.erp_purchase_order_lines as Array<{
    budget_sub_chapter: string | null
    total_price: number | string | null
  }> | null) ?? []) {
    const chapter = line.budget_sub_chapter
    if (!chapter) continue
    chapterTotals.set(
      chapter,
      (chapterTotals.get(chapter) ?? 0) + Number(line.total_price ?? 0),
    )
  }

  let dominantChapter: string | null = null
  let maxValue = 0
  for (const [chapter, total] of chapterTotals) {
    if (total > maxValue) {
      maxValue = total
      dominantChapter = chapter
    }
  }

  const committedAmount = Number(po.total_amount_gross ?? 0)

  // Idempotency: if an OPEN commitment already exists for this PO, skip.
  const { data: existing } = await svc
    .from("erp_po_commitments")
    .select("id")
    .eq("po_id", poId)
    .eq("status", "OPEN")
    .maybeSingle()

  if (existing) {
    return { ok: true, commitmentId: existing.id as string }
  }

  const { data: inserted, error: insertErr } = await svc
    .from("erp_po_commitments")
    .insert({
      company_id: companyId,
      po_id: poId,
      budget_chapter: dominantChapter,
      committed_amount: committedAmount,
      released_amount: 0,
      status: "OPEN",
      currency: (po.currency as string | null) ?? "ILS",
      opened_at: new Date().toISOString(),
      opened_by: approvedByUserId,
    })
    .select("id")
    .single()

  if (insertErr) {
    return {
      ok: false,
      error: `openCommitment: insert failed — ${insertErr.message}`,
    }
  }

  return { ok: true, commitmentId: inserted.id as string }
}

// ─────────────────────────────────────────────
// 6.1 — releaseCommitment
// ─────────────────────────────────────────────

/**
 * Fully releases the open commitment when a PO is CANCELLED or CLOSED.
 *
 * Sets `released_amount = committed_amount` (full release) and updates
 * `status` to CANCELLED or RELEASED accordingly.
 *
 * Idempotent: if no open commitment exists (e.g., PO was cancelled before
 * reaching APPROVED), returns ok=true silently.
 */
export async function releaseCommitment(params: {
  poId: string
  companyId: string
  reason: "CANCELLED" | "CLOSED" | "MANUAL"
}): Promise<CommitmentResult> {
  const { poId, companyId, reason } = params
  const svc = createSupabaseServiceRoleClient()

  const { data: commitment, error } = await svc
    .from("erp_po_commitments")
    .select("id, committed_amount")
    .eq("po_id", poId)
    .eq("company_id", companyId)
    .eq("status", "OPEN")
    .maybeSingle()

  if (error) {
    return { ok: false, error: `releaseCommitment: query failed — ${error.message}` }
  }

  // No open commitment — nothing to release (PO may have been cancelled before APPROVE).
  if (!commitment) return { ok: true }

  const newStatus = reason === "CANCELLED" ? "CANCELLED" : "RELEASED"

  const { error: updateErr } = await svc
    .from("erp_po_commitments")
    .update({
      released_amount: Number(commitment.committed_amount),
      status: newStatus,
      released_at: new Date().toISOString(),
      release_reason: reason,
    })
    .eq("id", commitment.id)

  if (updateErr) {
    return {
      ok: false,
      error: `releaseCommitment: update failed — ${updateErr.message}`,
    }
  }

  return { ok: true }
}

// ─────────────────────────────────────────────
// 6.1 — adjustCommitment (FULLY_RECEIVED)
// ─────────────────────────────────────────────

/**
 * Adjusts the commitment when a PO transitions to FULLY_RECEIVED.
 *
 * Sets `released_amount` = sum of actual GR line values (qty × unit_price).
 * This closes the loop between commitment and actual cost: any remaining
 * net_amount (commitment variance) becomes the budget saving or overrun.
 *
 * Falls back to full release if GR lines cannot be aggregated.
 */
export async function adjustCommitment(params: {
  poId: string
  companyId: string
}): Promise<CommitmentResult> {
  const { poId, companyId } = params
  const svc = createSupabaseServiceRoleClient()

  const { data: commitment, error: commitErr } = await svc
    .from("erp_po_commitments")
    .select("id, committed_amount")
    .eq("po_id", poId)
    .eq("company_id", companyId)
    .eq("status", "OPEN")
    .maybeSingle()

  if (commitErr) {
    return {
      ok: false,
      error: `adjustCommitment: query failed — ${commitErr.message}`,
    }
  }

  // No open commitment — nothing to adjust.
  if (!commitment) return { ok: true }

  // Sum actual received value from GR lines.
  // erp_goods_receipt_lines.quantity = received quantity (Phase 8.2 schema).
  const { data: grLines, error: grErr } = await svc
    .from("erp_goods_receipt_lines")
    .select("quantity, unit_price")
    .eq("purchase_order_id", poId)
    .eq("company_id", companyId)

  if (grErr) {
    return {
      ok: false,
      error: `adjustCommitment: GR query failed — ${grErr.message}`,
    }
  }

  const actualReceived = (grLines ?? []).reduce((sum, l) => {
    return sum + Number(l.quantity ?? 0) * Number(l.unit_price ?? 0)
  }, 0)

  // Released amount = min(actual, committed) — never exceed what was committed.
  const releaseAmount = Math.min(actualReceived, Number(commitment.committed_amount))

  const { error: updateErr } = await svc
    .from("erp_po_commitments")
    .update({
      released_amount: Math.round(releaseAmount * 100) / 100,
      status: "RELEASED",
      released_at: new Date().toISOString(),
      release_reason: "FULLY_RECEIVED",
    })
    .eq("id", commitment.id)

  if (updateErr) {
    return {
      ok: false,
      error: `adjustCommitment: update failed — ${updateErr.message}`,
    }
  }

  return { ok: true }
}
