/**
 * POST /api/procurement/landed-costs/[id]/allocate
 *   Re-run allocation calculation for a DRAFT landed cost document.
 *   Idempotent — safe to call multiple times.
 *
 * POST /api/procurement/landed-costs/[id]/post
 *   Finalise the document: posts allocations to item standard_cost.
 *   Irreversible once POSTED.
 *
 * GET  /api/procurement/landed-costs/[id]
 *   Fetch document with lines and current allocation preview.
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string }

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id } = await Promise.resolve(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { data, error } = await supabase
    .from("erp_landed_cost_documents")
    .select(
      "id, goods_receipt_id, reference, total_amount, currency, status, notes, posted_at, created_at, " +
        "erp_landed_cost_lines(id, cost_type, description, amount, allocation_method), " +
        "erp_landed_cost_allocations(id, gr_line_id, item_id, allocated_amount, allocation_basis_value)"
    )
    .eq("id", id)
    .eq("company_id", activeCompanyId)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.code === "PGRST116" ? 404 : 500 })
  }

  return NextResponse.json({ data })
}
