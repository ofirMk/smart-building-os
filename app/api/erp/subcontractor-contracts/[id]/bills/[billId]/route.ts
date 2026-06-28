import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  mapBillRow,
  normalizeRouteParams,
  requireSubcontractorContractsApiContext,
} from "@/lib/erp/subcontractor-contracts-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const patchSchema = z.object({
  status: z
    .enum(["DRAFT", "SUBMITTED", "APPROVED", "PAID", "REJECTED"])
    .optional(),
  isFinal: z.boolean().optional(),
  vatPct: z.coerce.number().min(0).max(100).optional(),
  executionMonth: z.string().trim().optional(),
  billDate: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
})

async function getBillAndVerify(
  supabase: ReturnType<typeof Object.assign>,
  companyId: string,
  contractId: string,
  billId: string
) {
  const { data, error } = await supabase
    .from("erp_subcontractor_bills")
    .select("*")
    .eq("company_id", companyId)
    .eq("contract_id", contractId)
    .eq("id", billId)
    .maybeSingle()
  return { data, error }
}

export async function GET(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; billId: string }> | { id: string; billId: string } }
) {
  const ctx = await requireSubcontractorContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { id, billId } = await normalizeRouteParams(params)
  const { data, error } = await getBillAndVerify(supabase, activeCompanyId, id, billId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Bill not found" }, { status: 404 })

  return NextResponse.json({ data: mapBillRow(data) })
}

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; billId: string }> | { id: string; billId: string } }
) {
  const ctx = await requireSubcontractorContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { id, billId } = await normalizeRouteParams(params)

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }

  const updates: Record<string, unknown> = {}
  const d = parsed.data
  if (d.status !== undefined) updates.status = d.status
  if (d.isFinal !== undefined) updates.is_final = d.isFinal
  if (d.vatPct !== undefined) updates.vat_pct = d.vatPct
  if (d.executionMonth !== undefined) updates.execution_month = d.executionMonth
  if (d.billDate !== undefined) updates.bill_date = d.billDate
  if (d.notes !== undefined) updates.notes = d.notes

  // Status-transition guards
  if (d.status === "APPROVED") updates.approved_at = new Date().toISOString()
  if (d.status === "PAID") updates.paid_at = new Date().toISOString()

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 })

  const { data, error } = await supabase
    .from("erp_subcontractor_bills")
    .update(updates)
    .eq("company_id", activeCompanyId)
    .eq("contract_id", id)
    .eq("id", billId)
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ data: mapBillRow(data) })
}
