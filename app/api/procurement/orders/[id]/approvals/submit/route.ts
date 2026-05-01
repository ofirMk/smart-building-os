/**
 * `/api/procurement/orders/[id]/approvals/submit` — Phase 7.13.1.C
 *
 * POST — שלח PO לאישור: DRAFT → PENDING_APPROVAL (או APPROVED אם
 * אין שרשרת אישור פעילה). עוטף את ה-RPC `erp_submit_po_for_approval`.
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

type SubmitResultRow = {
  approvals_created: number | string | null
  new_status: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id } = await normalizeParams(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  // ensure PO is in this tenant
  const ownership = await supabase
    .from("erp_purchase_orders")
    .select("id")
    .eq("company_id", activeCompanyId)
    .eq("id", id)
    .maybeSingle()
  if (ownership.error) {
    return NextResponse.json({ error: ownership.error.message }, { status: 500 })
  }
  if (!ownership.data) {
    return NextResponse.json({ error: "הזמנת רכש לא נמצאה" }, { status: 404 })
  }

  const { data, error } = await supabase.rpc("erp_submit_po_for_approval", {
    p_po_id: id,
  })

  if (error) {
    // 22023 = invalid_parameter_value (used by RPC for status mismatch)
    // P0002 = no_data_found
    const status =
      error.code === "22023" ? 409 : error.code === "P0002" ? 404 : 400
    return NextResponse.json({ error: error.message }, { status })
  }

  const rows = (data ?? []) as SubmitResultRow[]
  const result = rows[0]
  return NextResponse.json({
    data: {
      approvalsCreated:
        result?.approvals_created != null ? Number(result.approvals_created) : 0,
      newStatus: result?.new_status ?? null,
    },
  })
}
