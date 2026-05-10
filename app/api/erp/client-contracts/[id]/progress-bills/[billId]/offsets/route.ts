/* eslint-disable @typescript-eslint/no-explicit-any -- TODO(tech-debt): refactor DB row types; tracked for Sprint 3 cleanup. */
import { type NextRequest, NextResponse } from "next/server"

import { normalizeRouteParams, requireClientContractsApiContext } from "@/lib/erp/client-contracts-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
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

  const loaded = await supabase
    .from("erp_client_progress_bill_offsets")
    .select("*")
    .eq("company_id", activeCompanyId)
    .eq("progress_bill_id", billId)
    .order("created_at", { ascending: true })
  if (loaded.error) return NextResponse.json({ error: loaded.error.message }, { status: 500 })

  return NextResponse.json({
    data: (loaded.data ?? []).map((row: any) => ({
      id: row.id as string,
      sourceType: row.source_type as string,
      sourceId: row.source_id as string,
      sourceNumber: (row.source_number as string | null) ?? null,
      sourceDate: (row.source_date as string | null) ?? null,
      baseAmount: Number(row.base_amount ?? 0),
      commissionPct: Number(row.commission_pct ?? 0),
      commissionAmount: Number(row.commission_amount ?? 0),
      offsetAmount: Number(row.offset_amount ?? 0),
      approvedOffsetAmount:
        row.approved_offset_amount === null || row.approved_offset_amount === undefined
          ? null
          : Number(row.approved_offset_amount),
    })),
  })
}
