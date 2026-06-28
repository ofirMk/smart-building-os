/**
 * POST /api/procurement/orders/[id]/change-order
 *
 * Phase 12 — PO Versioning & Change Orders
 *
 * A "Change Order" creates an immutable snapshot of the current PO (stored in
 * `erp_po_revisions`) and then resets the PO to DRAFT so that the initiator
 * can edit fields and re-submit through the normal approval workflow.
 *
 * ## Business rules (from Golden Roadmap)
 * - Only allowed from: APPROVED, SENT_TO_SUPPLIER, ON_SHIP  
 * - CLOSED / CANCELLED → immutable; 422 returned
 * - `change_reason` is mandatory (audit compliance)
 * - After reset: status = DRAFT, revision_number++
 * - The same RBAC matrix as APPROVE is enforced (only authorised roles)
 * - SoD: PO creator cannot initiate a change order on their own PO
 *
 * ## What this does NOT do
 * - It does NOT approve the change — that flows through the normal approval path
 * - It does NOT touch goods receipts or commitments — those are adjusted at APPROVE
 */

import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { apiErrorResponse, unknownApiErrorResponse } from "@/lib/api/api-error"
import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string }

function normalizeParams(
  params: Promise<RouteParams> | RouteParams
): Promise<RouteParams> {
  return Promise.resolve(params)
}

const CHANGE_ORDER_ALLOWED_STATUSES = [
  "APPROVED",
  "SENT_TO_SUPPLIER",
  "SENT",           // legacy alias
  "SHIPMENT_CONFIRMED",
  "ON_SHIP",
] as const

const bodySchema = z.object({
  changeReason: z
    .string()
    .trim()
    .min(10, "סיבת השינוי חייבת להכיל לפחות 10 תווים")
    .max(2000),
})

export type ChangeOrderResponseDto = {
  ok: true
  poId: string
  previousStatus: string
  newStatus: "DRAFT"
  revisionId: string
  revisionNumber: number
  changeReason: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id: poId } = await normalizeParams(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId, userId } = ctx

  // ── 1. Parse body ──────────────────────────────────────────────────────────
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
  const { changeReason } = parsed.data

  // ── 2. Load current PO header + lines (for snapshot) ──────────────────────
  const poQ = await supabase
    .from("erp_purchase_orders")
    .select(
      "id, company_id, po_number, status, revision_number, created_by, " +
        "title, supplier_id, project_id, total_amount, currency, notes, created_at, issued_at"
    )
    .eq("company_id", activeCompanyId)
    .eq("id", poId)
    .maybeSingle()

  if (poQ.error) return apiErrorResponse(500, "DB_ERROR", poQ.error.message)
  if (!poQ.data) return apiErrorResponse(404, "PO_NOT_FOUND", `הזמנת רכש ${poId} לא נמצאה`)

  const po = poQ.data as {
    id: string
    company_id: string
    po_number: string
    status: string
    revision_number: number | null
    created_by: string | null
    title: string
    supplier_id: string | null
    project_id: string | null
    total_amount: number | null
    currency: string | null
    notes: string | null
    created_at: string
    issued_at: string | null
  }

  // ── 3. Status guard ────────────────────────────────────────────────────────
  const allowedSet: readonly string[] = CHANGE_ORDER_ALLOWED_STATUSES
  if (!allowedSet.includes(po.status)) {
    return apiErrorResponse(
      422,
      "CHANGE_ORDER_NOT_ALLOWED",
      `שינוי גרסה אינו אפשרי מסטטוס "${po.status}". ` +
        `מותר רק ב: ${CHANGE_ORDER_ALLOWED_STATUSES.join(", ")}.`,
      { currentStatus: po.status },
    )
  }

  // ── 4. SoD — creator cannot initiate change order on their own PO ──────────
  if (po.created_by && po.created_by === userId) {
    return apiErrorResponse(
      403,
      "SOD_VIOLATION",
      "יוצר ההזמנה אינו רשאי ליזום שינוי גרסה על ההזמנה שלו. יש לפנות למנהל רכש.",
    )
  }

  // ── 5. Load lines for snapshot ─────────────────────────────────────────────
  const linesQ = await supabase
    .from("erp_purchase_order_lines")
    .select("*")
    .eq("company_id", activeCompanyId)
    .eq("purchase_order_id", poId)
    .order("line_number", { ascending: true })

  if (linesQ.error) return apiErrorResponse(500, "DB_ERROR", linesQ.error.message)

  // ── 6. Create revision snapshot ────────────────────────────────────────────
  const nextRevision = (po.revision_number ?? 1) + 1

  const revInsert = await supabase
    .from("erp_po_revisions")
    .insert({
      company_id: activeCompanyId,
      purchase_order_id: poId,
      revision_number: nextRevision - 1,   // snapshot is of the CURRENT state (before reopen)
      reason: "CHANGE_ORDER",
      created_by: userId,
      header_snapshot: po,
      lines_snapshot: linesQ.data ?? [],
      approvals_snapshot: null,
    })
    .select("id, revision_number")
    .single()

  if (revInsert.error) {
    // Unique conflict = race condition on revision_number → retry-able by caller
    if (revInsert.error.code === "23505") {
      return apiErrorResponse(
        409,
        "REVISION_CONFLICT",
        "גרסה עם אותו מספר כבר קיימת. רענן ונסה שוב.",
      )
    }
    return unknownApiErrorResponse(500, "REVISION_INSERT_ERROR", revInsert.error.message)
  }

  const revisionRow = revInsert.data as { id: string; revision_number: number }

  // ── 7. Reset PO to DRAFT + bump revision_number ────────────────────────────
  const resetRes = await supabase
    .from("erp_purchase_orders")
    .update({
      status: "DRAFT",
      revision_number: nextRevision,
      notes: po.notes
        ? `${po.notes}\n\n[שינוי גרסה ${nextRevision}] ${changeReason}`
        : `[שינוי גרסה ${nextRevision}] ${changeReason}`,
    })
    .eq("company_id", activeCompanyId)
    .eq("id", poId)
    .eq("status", po.status)   // optimistic lock — prevent double-reopen

  if (resetRes.error) {
    return unknownApiErrorResponse(500, "RESET_ERROR", resetRes.error.message)
  }

  // ── 8. Log to change log ───────────────────────────────────────────────────
  await supabase
    .from("erp_po_change_log")
    .insert({
      company_id: activeCompanyId,
      purchase_order_id: poId,
      entity_type: "HEADER",
      entity_id: poId,
      operation: "UPDATE",
      field_name: "status",
      old_value: po.status,
      new_value: "DRAFT",
      changed_by: userId,
      source: "CHANGE_ORDER",
      reason: changeReason,
    })
    .then(() => void 0)  // best-effort; do not block response

  const response: ChangeOrderResponseDto = {
    ok: true,
    poId,
    previousStatus: po.status,
    newStatus: "DRAFT",
    revisionId: revisionRow.id,
    revisionNumber: revisionRow.revision_number,
    changeReason,
  }

  return NextResponse.json(response)
}
