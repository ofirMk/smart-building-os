import { type NextRequest, NextResponse } from "next/server"

import { normalizeRouteParams, requireClientContractsApiContext } from "@/lib/erp/client-contracts-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/erp/client-contracts/:id/progress-bills/:billId/calculate
 *
 * Query params:
 *   - `mode=full` → Sprint T2 — invokes the full §3.2.2 waterfall RPC
 *     (`erp_compute_client_bill_waterfall`) which writes escalation,
 *     retention(cap), insurance, advance recovery (3 methods), raw-material
 *     offsets+commission, back-charges, previous-billed, amount_to_pay,
 *     VAT and grand_total onto the bill header.
 *   - Default → legacy `erp_calculate_client_bill_totals` (simpler totals).
 *
 * Both modes are idempotent. Callers can switch from simple to full at any
 * point without losing previously-stored values; the full waterfall always
 * recomputes from current lines + contract config.
 */
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

  const mode = req.nextUrl.searchParams.get("mode")
  const useFullWaterfall = mode === "full"

  if (useFullWaterfall) {
    const fullRes = await supabase.rpc("erp_compute_client_bill_waterfall", {
      p_company_id: activeCompanyId,
      p_bill_id: billId,
    })
    if (fullRes.error) {
      return NextResponse.json({ error: fullRes.error.message }, { status: 500 })
    }
    return NextResponse.json({ mode: "full", waterfall: fullRes.data })
  }

  const calculated = await supabase.rpc("erp_calculate_client_bill_totals", {
    p_company_id: activeCompanyId,
    p_progress_bill_id: billId,
  })
  if (calculated.error) return NextResponse.json({ error: calculated.error.message }, { status: 500 })
  return NextResponse.json({ mode: "simple", totals: calculated.data })
}

