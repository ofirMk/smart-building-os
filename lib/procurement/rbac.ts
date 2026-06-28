/**
 * Procurement RBAC & SoD — Phase 6.2
 *
 * ## Segregation of Duties (SoD)
 *   The user who created a PO cannot be the one who approves it.
 *   Enforced for the APPROVE transition only.
 *
 * ## Role-Based Access Control (RBAC)
 *   Granular procurement roles are stored in
 *   `erp_user_company_memberships.procurement_roles text[]`.
 *
 *   Valid role values:
 *     PROCUREMENT_APPROVER  — can execute APPROVE, REVERT
 *     PROCUREMENT_MANAGER   — can execute APPROVE, REVERT, CLOSE, REOPEN, RESTORE
 *     CFO                   — can execute all financial transitions (APPROVE, CLOSE, CANCEL)
 *     REQUESTER             — can SUBMIT / REVERT own POs only
 *
 *   The base membership `role = 'admin'` implicitly grants all procurement roles.
 *
 * ## Usage in po-transition/route.ts
 *   1. Fetch user roles:  `getUserProcurementRoles(supabase, userId, companyId)`
 *   2. Check RBAC:        `assertRbacAllowed(transition, userRoles)`
 *   3. Check SoD:         `await assertSoD({ supabase, poId, companyId, approvingUserId, transition })`
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import type { POTransition } from "./po-state-machine"

// ─────────────────────────────────────────────
// Role definitions
// ─────────────────────────────────────────────

export type ProcurementRole =
  | "PROCUREMENT_APPROVER"
  | "PROCUREMENT_MANAGER"
  | "CFO"
  | "REQUESTER"

/**
 * Transitions that require at least one of the listed procurement roles.
 * Transitions NOT in this map are open to all authenticated company members.
 */
const ROLE_REQUIRED_TRANSITIONS: Partial<Record<POTransition, ProcurementRole[]>> = {
  APPROVE:  ["PROCUREMENT_APPROVER", "PROCUREMENT_MANAGER", "CFO"],
  CLOSE:    ["PROCUREMENT_MANAGER", "CFO"],
  REOPEN:   ["PROCUREMENT_MANAGER", "CFO"],
  RESTORE:  ["PROCUREMENT_MANAGER", "CFO"],
  CANCEL:   ["PROCUREMENT_APPROVER", "PROCUREMENT_MANAGER", "CFO"],
}

// ─────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────

export type RbacResult =
  | { ok: true }
  | { ok: false; code: string; message: string }

// ─────────────────────────────────────────────
// 6.2 — getUserProcurementRoles
// ─────────────────────────────────────────────

/**
 * Returns the effective procurement roles for a user within a company.
 *
 * - 'admin' base role → all procurement roles (implicit admin grant).
 * - Any other base role → reads `procurement_roles[]` column.
 * - If the membership row does not exist → empty array (caller will get 403
 *   from RBAC check if the transition requires a role).
 */
export async function getUserProcurementRoles(
  supabase: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<ProcurementRole[]> {
  const { data } = await supabase
    .from("erp_user_company_memberships")
    .select("role, procurement_roles")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .eq("is_active", true)
    .maybeSingle()

  if (!data) return []

  // 'admin' base role grants all procurement roles.
  if ((data.role as string) === "admin") {
    return ["PROCUREMENT_APPROVER", "PROCUREMENT_MANAGER", "CFO", "REQUESTER"]
  }

  return ((data.procurement_roles as string[] | null) ?? []) as ProcurementRole[]
}

// ─────────────────────────────────────────────
// 6.2 — assertRbacAllowed (pure, no I/O)
// ─────────────────────────────────────────────

/**
 * Pure check: does the user hold a role that allows this transition?
 *
 * Returns ok=true if no role is required for this transition, or if the
 * user holds at least one of the required roles.
 */
export function assertRbacAllowed(
  transition: POTransition,
  userRoles: ProcurementRole[],
): RbacResult {
  const required = ROLE_REQUIRED_TRANSITIONS[transition]
  if (!required) return { ok: true } // no role requirement

  const hasRole = userRoles.some((r) => required.includes(r))
  if (!hasRole) {
    const requiredStr = required.join(", ")
    return {
      ok: false,
      code: "RBAC_INSUFFICIENT_ROLE",
      message: `אין לך הרשאה לבצע את הפעולה "${transition}". נדרשת לפחות אחת מהרשאות הרכש הבאות: ${requiredStr}.`,
    }
  }

  return { ok: true }
}

// ─────────────────────────────────────────────
// 6.2 — assertSoD (Segregation of Duties)
// ─────────────────────────────────────────────

/**
 * Enforces Segregation of Duties: the approver cannot be the creator of the PO.
 *
 * Only applies to the APPROVE transition. All other transitions return ok=true
 * immediately without a DB query.
 *
 * Uses the user's (RLS-scoped) Supabase client so a malicious poId that
 * belongs to a different company returns null cleanly (treated as ok=true —
 * the main route handler will surface the 404).
 */
export async function assertSoD(params: {
  supabase: SupabaseClient
  poId: string
  companyId: string
  approvingUserId: string
  transition: POTransition
}): Promise<RbacResult> {
  const { supabase, poId, companyId, approvingUserId, transition } = params

  // SoD only applies to APPROVE.
  if (transition !== "APPROVE") return { ok: true }

  const { data: po } = await supabase
    .from("erp_purchase_orders")
    .select("created_by")
    .eq("id", poId)
    .eq("company_id", companyId)
    .maybeSingle()

  // If the PO doesn't exist we skip — the main handler returns 404.
  if (!po) return { ok: true }

  // Allow null created_by (POs created before Phase 6 migration).
  if (!po.created_by) return { ok: true }

  if ((po.created_by as string) === approvingUserId) {
    return {
      ok: false,
      code: "SOD_VIOLATION",
      message:
        "עקרון הפרדת תפקידים (SoD): לא ניתן לאשר הזמנת רכש שיצרת בעצמך. " +
        "נדרש אישור ממשתמש אחר בעל הרשאת PROCUREMENT_APPROVER, PROCUREMENT_MANAGER, או CFO.",
    }
  }

  return { ok: true }
}
