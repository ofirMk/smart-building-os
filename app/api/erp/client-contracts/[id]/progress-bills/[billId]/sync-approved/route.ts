import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { normalizeRouteParams, requireClientContractsApiContext } from "@/lib/erp/client-contracts-api"

const syncSchema = z.object({
  mode: z.enum(["CURRENT_SUBMITTED", "PREVIOUS_APPROVED"]).default("CURRENT_SUBMITTED"),
})

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

  const body = await req.json().catch(() => null)
  const parsed = syncSchema.safeParse(body ?? {})
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 })

  const verifyBill = await supabase
    .from("erp_client_progress_bills")
    .select("id")
    .eq("company_id", activeCompanyId)
    .eq("client_contract_id", clientContractId)
    .eq("id", billId)
    .maybeSingle()
  if (verifyBill.error) return NextResponse.json({ error: verifyBill.error.message }, { status: 500 })
  if (!verifyBill.data) return NextResponse.json({ error: "Progress bill not found" }, { status: 404 })

  let syncedRows = 0
  if (parsed.data.mode === "CURRENT_SUBMITTED") {
    const synced = await supabase.rpc("erp_copy_submitted_to_approved", {
      p_company_id: activeCompanyId,
      p_progress_bill_id: billId,
      p_skip_line_ids: [],
    })
    if (synced.error) return NextResponse.json({ error: synced.error.message }, { status: 500 })
    syncedRows = Number(synced.data ?? 0)
  } else {
    const synced = await supabase.rpc("erp_update_bill_from_submitted", {
      p_bill_id: billId,
      p_mode: parsed.data.mode,
    })
    if (synced.error) return NextResponse.json({ error: synced.error.message }, { status: 500 })
    syncedRows = Number(synced.data ?? 0)
  }

  const calculated = await supabase.rpc("erp_calculate_client_bill_totals", {
    p_company_id: activeCompanyId,
    p_progress_bill_id: billId,
  })
  if (calculated.error) return NextResponse.json({ error: calculated.error.message }, { status: 500 })

  return NextResponse.json({ ok: true, syncedRows, totals: calculated.data })
}

