import { type NextRequest, NextResponse } from "next/server"

import { normalizeRouteParams, requireClientContractsApiContext } from "@/lib/erp/client-contracts-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; billId: string }> | { id: string; billId: string } }
) {
  const { id: clientContractId, billId } = await normalizeRouteParams(params)
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const verifyBill = await supabase
    .from("erp_client_progress_bills")
    .select("id")
    .eq("company_id", activeCompanyId)
    .eq("client_contract_id", clientContractId)
    .eq("id", billId)
    .maybeSingle()
  if (verifyBill.error) return NextResponse.json({ error: verifyBill.error.message }, { status: 500 })
  if (!verifyBill.data) return NextResponse.json({ error: "Progress bill not found" }, { status: 404 })

  const calculated = await supabase.rpc("erp_calculate_client_bill_totals", {
    p_company_id: activeCompanyId,
    p_progress_bill_id: billId,
  })
  if (calculated.error) return NextResponse.json({ error: calculated.error.message }, { status: 500 })
  return NextResponse.json({ totals: calculated.data })
}

