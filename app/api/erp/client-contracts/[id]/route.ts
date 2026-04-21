import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  mapClientContractRow,
  normalizeRouteParams,
  requireClientContractsApiContext,
} from "@/lib/erp/client-contracts-api"

const updateContractSchema = z.object({
  clientName: z.string().trim().min(2).optional(),
  title: z.string().trim().min(2).optional(),
  supplierId: z.string().uuid().nullable().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "CLOSED", "CANCELLED"]).optional(),
  indexationPct: z.coerce.number().min(0).max(1000).optional(),
  retentionPct: z.coerce.number().min(0).max(100).optional(),
  advancePaymentAmount: z.coerce.number().min(0).optional(),
  advanceRepaymentPct: z.coerce.number().min(0).max(100).optional(),
  startDate: z.string().trim().nullable().optional(),
  endDate: z.string().trim().nullable().optional(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeRouteParams(params)
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const loaded = await supabase
    .from("erp_client_contracts")
    .select("*")
    .eq("company_id", activeCompanyId)
    .eq("id", id)
    .maybeSingle()
  if (loaded.error) return NextResponse.json({ error: loaded.error.message }, { status: 500 })
  if (!loaded.data) return NextResponse.json({ error: "Client contract not found" }, { status: 404 })
  return NextResponse.json({ data: mapClientContractRow(loaded.data) })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeRouteParams(params)
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const body = await req.json().catch(() => null)
  const parsed = updateContractSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 })
  }

  if (parsed.data.supplierId) {
    const supplier = await supabase
      .from("erp_md_suppliers")
      .select("id")
      .eq("company_id", activeCompanyId)
      .eq("id", parsed.data.supplierId)
      .maybeSingle()
    if (supplier.error) return NextResponse.json({ error: supplier.error.message }, { status: 500 })
    if (!supplier.data) return NextResponse.json({ error: "Supplier not found for active company" }, { status: 400 })
  }

  const patch: Record<string, string | number | null> = {}
  if (parsed.data.clientName !== undefined) patch.client_name = parsed.data.clientName
  if (parsed.data.title !== undefined) patch.title = parsed.data.title
  if (parsed.data.supplierId !== undefined) patch.supplier_id = parsed.data.supplierId
  if (parsed.data.status !== undefined) patch.status = parsed.data.status
  if (parsed.data.indexationPct !== undefined) patch.indexation_pct = parsed.data.indexationPct
  if (parsed.data.retentionPct !== undefined) patch.retention_pct = parsed.data.retentionPct
  if (parsed.data.advancePaymentAmount !== undefined) patch.advance_payment_amount = parsed.data.advancePaymentAmount
  if (parsed.data.advanceRepaymentPct !== undefined) patch.advance_repayment_pct = parsed.data.advanceRepaymentPct
  if (parsed.data.startDate !== undefined) patch.start_date = parsed.data.startDate
  if (parsed.data.endDate !== undefined) patch.end_date = parsed.data.endDate
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No fields supplied" }, { status: 400 })

  const updated = await supabase
    .from("erp_client_contracts")
    .update(patch)
    .eq("company_id", activeCompanyId)
    .eq("id", id)
    .select("*")
    .maybeSingle()
  if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 400 })
  if (!updated.data) return NextResponse.json({ error: "Client contract not found" }, { status: 404 })
  return NextResponse.json({ data: mapClientContractRow(updated.data) })
}

