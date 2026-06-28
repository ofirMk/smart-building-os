import { type NextRequest, NextResponse } from "next/server"

import {
  mapBillRow,
  normalizeRouteParams,
  requireSubcontractorContractsApiContext,
} from "@/lib/erp/subcontractor-contracts-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/erp/subcontractor-contracts/[id]/bills/[billId]/calculate
 *
 * Calls the erp_compute_subcontractor_bill_waterfall RPC and returns the
 * updated bill header with the full waterfall breakdown.
 */
export async function POST(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; billId: string }> | { id: string; billId: string } }
) {
  const ctx = await requireSubcontractorContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { id: contractId, billId } = await normalizeRouteParams(params)

  // Verify bill belongs to company + contract
  const bill = await supabase
    .from("erp_subcontractor_bills")
    .select("id, status")
    .eq("company_id", activeCompanyId)
    .eq("contract_id", contractId)
    .eq("id", billId)
    .maybeSingle()
  if (bill.error)
    return NextResponse.json({ error: bill.error.message }, { status: 500 })
  if (!bill.data)
    return NextResponse.json({ error: "Bill not found" }, { status: 404 })

  // Call the waterfall RPC (security definer — passes company context via RLS)
  const rpc = await supabase.rpc(
    "erp_compute_subcontractor_bill_waterfall",
    { p_bill_id: billId }
  )
  if (rpc.error)
    return NextResponse.json({ error: rpc.error.message }, { status: 500 })

  // Re-fetch the updated bill to return fresh numbers
  const updated = await supabase
    .from("erp_subcontractor_bills")
    .select("*")
    .eq("company_id", activeCompanyId)
    .eq("id", billId)
    .single()
  if (updated.error)
    return NextResponse.json({ error: updated.error.message }, { status: 500 })

  return NextResponse.json({
    data: mapBillRow(updated.data),
    waterfall: rpc.data as Record<string, unknown>,
  })
}
