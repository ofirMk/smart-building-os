/**
 * POST /api/procurement/po-transition
 *
 * Executes a single state-machine transition on an `erp_purchase_orders` row.
 *
 * ## Auth / tenant isolation
 *   Delegates entirely to `requireProcurementApiContext`:
 *     • Valid Supabase session (401 if missing).
 *     • Active company cookie present (400 if missing).
 *     • Verified `erp_user_company_memberships` row for the session user +
 *       active company (403 if absent or inactive).
 *   The Supabase client returned is the *user* client — subject to RLS — so
 *   a malicious `poId` that belongs to a different company will 404 cleanly.
 *
 * ## Request body
 *   ```json
 *   {
 *     "poId":      "<uuid>",
 *     "transition": "SUBMIT | REVERT | ISSUE | CLOSE | CANCEL",
 *     "notes":     "<string | null>  (optional, appended to PO notes)"
 *   }
 *   ```
 *
 * ## Responses
 *   200 — transition applied.
 *   400 — body validation failed.
 *   401 — no session.
 *   403 — user not a member of the active company.
 *   404 — PO not found (or belongs to a different company).
 *   409 — transition not legal from the PO's current status.
 *   500 — unexpected DB error.
 *
 * ## Optimistic lock
 *   The current status is always READ from the DB — never trusted from the
 *   caller. `applyPOTransition` then passes it as a WHERE clause predicate so
 *   a concurrent transition will silently result in a 0-row update, which the
 *   DB propagates as an error that surfaces as a 409 to the caller.
 */

import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { apiErrorResponse, unknownApiErrorResponse } from "@/lib/api/api-error"
import { requireProcurementApiContext } from "@/lib/erp/procurement-api"
import {
  applyPOTransition,
  fetchPOStatus,
  getAvailableTransitions,
  type POStatus,
  type POTransition,
} from "@/lib/procurement/po-state-machine"
import {
  openCommitment,
  releaseCommitment,
  adjustCommitment,
} from "@/lib/procurement/commitment-accounting"
import {
  getUserProcurementRoles,
  assertRbacAllowed,
  assertSoD,
} from "@/lib/procurement/rbac"
import {
  checkFiscalPeriodOpen,
  checkBudgetChapterThreshold,
} from "@/lib/procurement/fiscal-period"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────

const PO_TRANSITIONS = [
  "SUBMIT",
  "APPROVE",
  "REVERT",
  "PROFORMA",
  "SEND",
  "CONFIRM_SHIPMENT",
  "SHIP",
  "RECEIVE_PARTIAL",
  "RECEIVE_FULL",
  "CLOSE",
  "REOPEN",
  "RESTORE",
  "CANCEL",
] as const satisfies readonly POTransition[]

const bodySchema = z.object({
  poId: z.string().uuid({ message: "poId חייב להיות UUID תקני" }),
  transition: z.enum(PO_TRANSITIONS),
  notes: z.string().trim().max(2000).nullable().optional(),
})

// ─────────────────────────────────────────────
// Response DTO
// ─────────────────────────────────────────────

export type POTransitionResponse = {
  ok: true
  data: {
    poId: string
    companyId: string
    previousStatus: POStatus
    newStatus: POStatus
    transition: POTransition
    /** Phase 6.4 — fiscal/budget warnings that did not block the transition. */
    warnings?: string[]
  }
}

// ─────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Auth — session + company membership + RLS client
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId, userId } = ctx

  // 2. Body validation
  const json = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return apiErrorResponse(
      400,
      "INVALID_BODY",
      parsed.error.issues[0]?.message ?? "Request body לא תקין",
      parsed.error.issues,
    )
  }
  const { poId, transition, notes } = parsed.data

  // 3. Fetch current PO status from DB.
  const currentStatus = await fetchPOStatus(supabase, activeCompanyId, poId)
  if (currentStatus === null) {
    return apiErrorResponse(404, "PO_NOT_FOUND", `הזמנת רכש ${poId} לא נמצאה`)
  }

  // 4. Guard — check transition legality.
  const available = getAvailableTransitions(currentStatus)
  if (!available.includes(transition)) {
    return apiErrorResponse(
      409,
      "ILLEGAL_TRANSITION",
      `מעבר "${transition}" לא חוקי מסטטוס "${currentStatus}". מעברים אפשריים: ${available.length > 0 ? available.join(", ") : "אין"}`,
      { currentStatus, availableTransitions: available },
    )
  }

  // ── Phase 6.2 — RBAC + SoD pre-checks ────────────────────────────────────
  // Fetch user's effective procurement roles once (used for both checks).
  const userRoles = await getUserProcurementRoles(supabase, userId, activeCompanyId)

  const rbacCheck = assertRbacAllowed(transition, userRoles)
  if (!rbacCheck.ok) {
    return apiErrorResponse(403, rbacCheck.code, rbacCheck.message)
  }

  const sodCheck = await assertSoD({
    supabase,
    poId,
    companyId: activeCompanyId,
    approvingUserId: userId,
    transition,
  })
  if (!sodCheck.ok) {
    return apiErrorResponse(403, sodCheck.code, sodCheck.message)
  }

  // ── Phase 6.4 — Pre-flight fiscal & budget checks ─────────────────────────
  // Accumulate non-blocking warnings; blocking failures return early.
  const transitionWarnings: string[] = []

  if (transition === "SUBMIT") {
    // P0 #1 — Block SUBMIT if PO has no lines (empty PO is a classic ERP error)
    const lineCountQ = await supabase
      .from("erp_purchase_order_lines")
      .select("id", { count: "exact", head: true })
      .eq("company_id", activeCompanyId)
      .eq("purchase_order_id", poId)
    if ((lineCountQ.count ?? 0) === 0) {
      return apiErrorResponse(
        422,
        "PO_NO_LINES",
        "לא ניתן להגיש הזמנה ריקה. יש להוסיף לפחות שורה אחת לפני הגשה.",
      )
    }

    // Fiscal period check: PO submission date must fall in an OPEN GL period.
    const periodCheck = await checkFiscalPeriodOpen({ companyId: activeCompanyId })
    if (!periodCheck.ok) {
      return apiErrorResponse(422, periodCheck.code, periodCheck.message)
    }
    transitionWarnings.push(...periodCheck.warnings)
  }

  if (transition === "CANCEL") {
    // P0 #5 — Block CANCEL if there are open (non-closed) goods receipts linked
    // to this PO. Cancelling a PO with open deliveries would create orphaned GR
    // records and break inventory integrity.
    const openGrQ = await supabase
      .from("erp_goods_receipts")
      .select("id, gr_number")
      .eq("company_id", activeCompanyId)
      .eq("purchase_order_id", poId)
      .not("status", "in", '("CLOSED","CANCELLED")')
    if (openGrQ.error) {
      return apiErrorResponse(500, "GR_CHECK_ERROR", openGrQ.error.message)
    }
    if ((openGrQ.data?.length ?? 0) > 0) {
      const grList = (openGrQ.data ?? [])
        .map((r: { gr_number: string }) => r.gr_number)
        .join(", ")
      return apiErrorResponse(
        422,
        "PO_HAS_OPEN_GR",
        `לא ניתן לבטל הזמנה עם תעודות משלוח פתוחות: ${grList}. סגור את תעודות המשלוח תחילה.`,
      )
    }
  }

  if (transition === "APPROVE") {
    // Budget chapter threshold check: warn (or block in strict mode) if
    // approving this PO would exceed the budget chapter limit.
    const budgetCheck = await checkBudgetChapterThreshold({
      companyId: activeCompanyId,
      poId,
    })
    if (!budgetCheck.ok) {
      return apiErrorResponse(422, budgetCheck.code, budgetCheck.message)
    }
    transitionWarnings.push(...budgetCheck.warnings)
  }

  // 5. Apply the transition
  const result = await applyPOTransition({
    supabase,
    companyId: activeCompanyId,
    poId,
    transition,
    currentStatus,
    notes: notes ?? null,
  })

  if (!result.ok) {
    if (result.error.includes("0 rows") || result.error.includes("conflict")) {
      return apiErrorResponse(
        409,
        "CONCURRENT_UPDATE",
        "הסטטוס שונה על ידי פעולה מקבילה. רענן ונסה שוב.",
      )
    }
    return unknownApiErrorResponse(500, "TRANSITION_ERROR", result.error)
  }

  // ── Phase 6.1 — Commitment Accounting side-effects ────────────────────────
  // Run asynchronously AFTER the PO status update is committed.
  // Failures are non-fatal: the transition has already succeeded; we include
  // errors as warnings so the UI can surface them without rolling back.
  const newStatus = result.newStatus

  if (newStatus === "APPROVED") {
    const commitResult = await openCommitment({
      poId,
      companyId: activeCompanyId,
      approvedByUserId: userId,
    })
    if (!commitResult.ok) {
      console.error("[po-transition] openCommitment failed:", commitResult.error)
      transitionWarnings.push(
        `אזהרה: רישום התחייבות תקציבית נכשל — ${commitResult.error}. יש לבדוק ידנית.`,
      )
    }
  } else if (newStatus === "CANCELLED") {
    const releaseResult = await releaseCommitment({
      poId,
      companyId: activeCompanyId,
      reason: "CANCELLED",
    })
    if (!releaseResult.ok) {
      console.error("[po-transition] releaseCommitment (CANCEL) failed:", releaseResult.error)
      transitionWarnings.push(
        `אזהרה: שחרור התחייבות תקציבית נכשל — ${releaseResult.error}. יש לבדוק ידנית.`,
      )
    }
  } else if (newStatus === "CLOSED") {
    const releaseResult = await releaseCommitment({
      poId,
      companyId: activeCompanyId,
      reason: "CLOSED",
    })
    if (!releaseResult.ok) {
      console.error("[po-transition] releaseCommitment (CLOSE) failed:", releaseResult.error)
      transitionWarnings.push(
        `אזהרה: שחרור התחייבות תקציבית נכשל — ${releaseResult.error}. יש לבדוק ידנית.`,
      )
    }
  } else if (newStatus === "FULLY_RECEIVED") {
    const adjustResult = await adjustCommitment({
      poId,
      companyId: activeCompanyId,
    })
    if (!adjustResult.ok) {
      console.error("[po-transition] adjustCommitment (FULLY_RECEIVED) failed:", adjustResult.error)
      transitionWarnings.push(
        `אזהרה: עדכון התחייבות תקציבית לפי קליטה בפועל נכשל — ${adjustResult.error}. יש לבדוק ידנית.`,
      )
    }
  }

  // 6. Success
  const response: POTransitionResponse = {
    ok: true,
    data: {
      poId,
      companyId: activeCompanyId,
      previousStatus: currentStatus,
      newStatus,
      transition,
      ...(transitionWarnings.length > 0 ? { warnings: transitionWarnings } : {}),
    },
  }
  return NextResponse.json(response, { status: 200 })
}
