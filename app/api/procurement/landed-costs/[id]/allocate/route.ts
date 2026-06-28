/**
 * POST /api/procurement/landed-costs/[id]/allocate
 *
 * Re-run the allocation calculation for a DRAFT landed cost document.
 * Idempotent — safe to call after editing lines.
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id } = await Promise.resolve(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  // Ownership check
  const docQ = await supabase
    .from("erp_landed_cost_documents")
    .select("id, status")
    .eq("id", id)
    .eq("company_id", activeCompanyId)
    .single()

  if (docQ.error) {
    return NextResponse.json({ error: "מסמך עלויות נחיתה לא נמצא" }, { status: 404 })
  }

  const doc = docQ.data as { id: string; status: string }
  if (doc.status !== "DRAFT") {
    return NextResponse.json(
      { error: "ALREADY_POSTED", message: "לא ניתן לחשב מחדש מסמך שכבר נרשם" },
      { status: 409 }
    )
  }

  const { error } = await supabase.rpc("erp_allocate_landed_costs", { p_document_id: id })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Return updated allocations
  const allocQ = await supabase
    .from("erp_landed_cost_allocations")
    .select("id, gr_line_id, item_id, allocated_amount, allocation_basis_value")
    .eq("company_id", activeCompanyId)
    .eq("document_id", id)
    .order("gr_line_id")

  return NextResponse.json({ data: allocQ.data })
}
