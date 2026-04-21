import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  mapProgressBillLineRow,
  normalizeRouteParams,
  requireClientContractsApiContext,
} from "@/lib/erp/client-contracts-api"

const createOrUpdateLineSchema = z.object({
  contractLineId: z.string().uuid(),
  submittedQuantity: z.coerce.number().min(0),
  submittedAmount: z.coerce.number().min(0),
  submittedPercent: z.coerce.number().min(0).optional(),
  approvedQuantity: z.coerce.number().min(0).nullable().optional(),
  approvedAmount: z.coerce.number().min(0).nullable().optional(),
  approvedPercent: z.coerce.number().min(0).nullable().optional(),
  approvedManualOverride: z.boolean().optional(),
})

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
    .from("erp_client_progress_bill_lines")
    .select("*")
    .eq("company_id", activeCompanyId)
    .eq("progress_bill_id", billId)
    .order("created_at", { ascending: true })
  if (loaded.error) return NextResponse.json({ error: loaded.error.message }, { status: 500 })
  return NextResponse.json({ data: (loaded.data ?? []).map(mapProgressBillLineRow) })
}

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

  const body = await req.json().catch(() => null)
  const parsed = createOrUpdateLineSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 })

  const upserted = await supabase
    .from("erp_client_progress_bill_lines")
    .upsert(
      {
        company_id: activeCompanyId,
        progress_bill_id: billId,
        contract_line_id: parsed.data.contractLineId,
        submitted_quantity: parsed.data.submittedQuantity,
        submitted_amount: parsed.data.submittedAmount,
        submitted_percent: parsed.data.submittedPercent ?? 0,
        approved_quantity: parsed.data.approvedQuantity ?? null,
        approved_amount: parsed.data.approvedAmount ?? null,
        approved_percent: parsed.data.approvedPercent ?? null,
        approved_manual_override: parsed.data.approvedManualOverride === true,
      },
      { onConflict: "company_id,progress_bill_id,contract_line_id" }
    )
    .select("*")
    .single()
  if (upserted.error) return NextResponse.json({ error: upserted.error.message }, { status: 400 })

  const calculated = await supabase.rpc("erp_calculate_client_bill_totals", {
    p_company_id: activeCompanyId,
    p_progress_bill_id: billId,
  })
  if (calculated.error) return NextResponse.json({ error: calculated.error.message }, { status: 500 })

  return NextResponse.json({ data: mapProgressBillLineRow(upserted.data), totals: calculated.data }, { status: 201 })
}

