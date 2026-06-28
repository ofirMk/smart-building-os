import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  mapSubcontractorContractRow,
  normalizeRouteParams,
  requireSubcontractorContractsApiContext,
} from "@/lib/erp/subcontractor-contracts-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const patchSchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "CLOSED", "CANCELLED"]).optional(),
  totalAmount: z.coerce.number().min(0).optional(),
  retentionPct: z.coerce.number().min(0).max(100).optional(),
  insurancePct: z.coerce.number().min(0).max(100).optional(),
  paymentTerms: z.string().trim().optional().nullable(),
  advancePaymentAmount: z.coerce.number().min(0).optional(),
  advanceRecoveryMethod: z
    .enum(["PROPORTIONAL", "FIXED_AMOUNT", "FIXED_PCT"])
    .optional()
    .nullable(),
  advanceRecoveryPct: z.coerce.number().min(0).max(100).optional(),
  rawMaterialOffsetCommissionPct: z.coerce.number().min(0).max(100).optional(),
  actualStartDate: z.string().trim().optional().nullable(),
  actualEndDate: z.string().trim().optional().nullable(),
  warrantyEndDate: z.string().trim().optional().nullable(),
  approvalChainCode: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const ctx = await requireSubcontractorContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { id } = await normalizeRouteParams(params)

  const { data, error } = await supabase
    .from("erp_subcontractor_contracts")
    .select("*")
    .eq("company_id", activeCompanyId)
    .eq("id", id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ data: mapSubcontractorContractRow(data) })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const ctx = await requireSubcontractorContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { id } = await normalizeRouteParams(params)

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
  if (d.totalAmount !== undefined) updates.total_amount = d.totalAmount
  if (d.retentionPct !== undefined) updates.retention_pct = d.retentionPct
  if (d.insurancePct !== undefined) updates.insurance_pct = d.insurancePct
  if (d.paymentTerms !== undefined) updates.payment_terms = d.paymentTerms
  if (d.advancePaymentAmount !== undefined)
    updates.advance_payment_amount = d.advancePaymentAmount
  if (d.advanceRecoveryMethod !== undefined)
    updates.advance_recovery_method = d.advanceRecoveryMethod
  if (d.advanceRecoveryPct !== undefined)
    updates.advance_recovery_pct = d.advanceRecoveryPct
  if (d.rawMaterialOffsetCommissionPct !== undefined)
    updates.raw_material_offset_commission_pct = d.rawMaterialOffsetCommissionPct
  if (d.actualStartDate !== undefined) updates.actual_start_date = d.actualStartDate
  if (d.actualEndDate !== undefined) updates.actual_end_date = d.actualEndDate
  if (d.warrantyEndDate !== undefined) updates.warranty_end_date = d.warrantyEndDate
  if (d.approvalChainCode !== undefined)
    updates.approval_chain_code = d.approvalChainCode
  if (d.notes !== undefined) updates.notes = d.notes

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 })

  const { data, error } = await supabase
    .from("erp_subcontractor_contracts")
    .update(updates)
    .eq("company_id", activeCompanyId)
    .eq("id", id)
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ data: mapSubcontractorContractRow(data) })
}
