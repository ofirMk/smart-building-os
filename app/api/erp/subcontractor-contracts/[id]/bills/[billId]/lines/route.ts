import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  mapBillLineRow,
  normalizeRouteParams,
  requireSubcontractorContractsApiContext,
} from "@/lib/erp/subcontractor-contracts-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const lineUpsertSchema = z.object({
  boqLineId: z.string().uuid(),
  cumulativePct: z.coerce.number().min(0).max(100).optional().default(0),
  cumulativeQty: z.coerce.number().min(0).optional().default(0),
  cumulativeAmount: z.coerce.number().min(0).optional().default(0),
  submittedAmount: z.coerce.number().min(0).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
})

const bulkPutSchema = z.object({
  lines: z.array(lineUpsertSchema).min(1),
})

export async function GET(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; billId: string }> | { id: string; billId: string } }
) {
  const ctx = await requireSubcontractorContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { id: contractId, billId } = await normalizeRouteParams(params)

  // Verify bill ownership
  const bill = await supabase
    .from("erp_subcontractor_bills")
    .select("id")
    .eq("company_id", activeCompanyId)
    .eq("contract_id", contractId)
    .eq("id", billId)
    .maybeSingle()
  if (bill.error)
    return NextResponse.json({ error: bill.error.message }, { status: 500 })
  if (!bill.data)
    return NextResponse.json({ error: "Bill not found" }, { status: 404 })

  const { data, error } = await supabase
    .from("erp_subcontractor_bill_lines")
    .select("*")
    .eq("company_id", activeCompanyId)
    .eq("bill_id", billId)
    .order("boq_line_id")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: (data ?? []).map(mapBillLineRow) })
}

/**
 * PUT /api/erp/subcontractor-contracts/[id]/bills/[billId]/lines
 * Bulk upsert of bill lines. Idempotent — uses (company_id, bill_id, boq_line_id) conflict key.
 * Only allowed when bill.status = DRAFT.
 */
export async function PUT(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; billId: string }> | { id: string; billId: string } }
) {
  const ctx = await requireSubcontractorContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { id: contractId, billId } = await normalizeRouteParams(params)

  // Verify bill exists, belongs to company+contract, and is DRAFT
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
  if (bill.data.status !== "DRAFT")
    return NextResponse.json(
      { error: `Cannot edit lines on a bill with status "${bill.data.status}"` },
      { status: 400 }
    )

  const body = await req.json().catch(() => null)
  const parsed = bulkPutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }

  const rows = parsed.data.lines.map((l) => ({
    company_id: activeCompanyId,
    bill_id: billId,
    boq_line_id: l.boqLineId,
    cumulative_pct: l.cumulativePct ?? 0,
    cumulative_qty: l.cumulativeQty ?? 0,
    cumulative_amount: l.cumulativeAmount ?? 0,
    submitted_amount: l.submittedAmount ?? null,
    notes: l.notes ?? null,
  }))

  const { data, error } = await supabase
    .from("erp_subcontractor_bill_lines")
    .upsert(rows, {
      onConflict: "company_id,bill_id,boq_line_id",
      ignoreDuplicates: false,
    })
    .select("*")

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ data: (data ?? []).map(mapBillLineRow) })
}
