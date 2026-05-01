/**
 * `/api/procurement/orders/[id]/approvals` — Phase 7.13.1.C
 *
 * GET — מחזיר את התמונה המלאה של תהליך האישור עבור PO:
 *   • chain — תוצאת `erp_resolve_approval_chain(po)` (תיאורטית)
 *   • approvals — רשומות בפועל מ-`erp_po_approvals`
 *   • currentStatus / currentApprovalLevel
 *
 * משמש את ה-Approvals tab במסך הפרט; משלב שני מקורות ב-call אחד.
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string }

function normalizeParams(
  params: Promise<RouteParams> | RouteParams
): Promise<RouteParams> {
  return Promise.resolve(params)
}

// ─────────────────────────────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────────────────────────────

export type ApprovalChainEntryDto = {
  level: number
  requiredRole: string | null
  amountThresholdGross: number | null
  triggerExpr: string | null
  activated: boolean
}

export type ApprovalRecordDto = {
  id: string
  level: number
  requiredRole: string | null
  approverUserId: string | null
  status: "PENDING" | "APPROVED" | "REJECTED" | "BYPASSED" | "CANCELLED"
  comment: string | null
  decidedAt: string | null
  createdAt: string
}

export type ApprovalsResponseDto = {
  poId: string
  currentStatus: string
  currentApprovalLevel: number
  poTypeId: string | null
  hasPoType: boolean
  chain: ApprovalChainEntryDto[]
  approvals: ApprovalRecordDto[]
}

type ChainRow = {
  level: number
  required_role: string | null
  amount_threshold_gross: number | string | null
  trigger_expr: string | null
  activated: boolean
}

type ApprovalRow = {
  id: string
  level: number
  required_role: string | null
  approver_user_id: string | null
  status: string
  comment: string | null
  decided_at: string | null
  created_at: string
}

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value == null) return null
  const n = typeof value === "string" ? Number(value) : value
  return Number.isFinite(n) ? n : null
}

// ─────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id } = await normalizeParams(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  // 1) PO header (existence + status + po_type_id check)
  const headerQuery = await supabase
    .from("erp_purchase_orders")
    .select("id,status,current_approval_level,po_type_id")
    .eq("company_id", activeCompanyId)
    .eq("id", id)
    .maybeSingle()
  if (headerQuery.error) {
    return NextResponse.json({ error: headerQuery.error.message }, { status: 500 })
  }
  if (!headerQuery.data) {
    return NextResponse.json({ error: "הזמנת רכש לא נמצאה" }, { status: 404 })
  }
  const header = headerQuery.data as {
    id: string
    status: string
    current_approval_level: number | null
    po_type_id: string | null
  }

  // 2) approvals records (always available even if no chain configured)
  const approvalsQuery = await supabase
    .from("erp_po_approvals")
    .select(
      "id,level,required_role,approver_user_id,status,comment,decided_at,created_at"
    )
    .eq("company_id", activeCompanyId)
    .eq("purchase_order_id", id)
    .order("level", { ascending: true })
  if (approvalsQuery.error) {
    return NextResponse.json(
      { error: approvalsQuery.error.message },
      { status: 500 }
    )
  }

  // 3) resolved chain — only callable if a po_type exists. If not, return empty.
  let chain: ApprovalChainEntryDto[] = []
  if (header.po_type_id) {
    const chainQuery = await supabase.rpc("erp_resolve_approval_chain", {
      p_po_id: id,
    })
    if (chainQuery.error) {
      // Soft-fail: still return approvals, mark chain empty with the reason in
      // a header-level field. Avoids breaking the tab if a po_type is misconfigured.
      // (we do not include the error string in the body to avoid leaking schema.)
    } else {
      chain = ((chainQuery.data ?? []) as ChainRow[]).map((row) => ({
        level: row.level,
        requiredRole: row.required_role,
        amountThresholdGross: toNumberOrNull(row.amount_threshold_gross),
        triggerExpr: row.trigger_expr,
        activated: Boolean(row.activated),
      }))
    }
  }

  const approvals = ((approvalsQuery.data ?? []) as ApprovalRow[]).map(
    (row): ApprovalRecordDto => ({
      id: row.id,
      level: row.level,
      requiredRole: row.required_role,
      approverUserId: row.approver_user_id,
      status: row.status as ApprovalRecordDto["status"],
      comment: row.comment,
      decidedAt: row.decided_at,
      createdAt: row.created_at,
    })
  )

  const dto: ApprovalsResponseDto = {
    poId: id,
    currentStatus: header.status,
    currentApprovalLevel: header.current_approval_level ?? 0,
    poTypeId: header.po_type_id,
    hasPoType: Boolean(header.po_type_id),
    chain,
    approvals,
  }

  return NextResponse.json({ data: dto })
}
