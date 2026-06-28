import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  mapSubcontractorContractRow,
  requireSubcontractorContractsApiContext,
} from "@/lib/erp/subcontractor-contracts-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const createSchema = z.object({
  projectId: z.string().uuid(),
  subcontractorId: z.string().uuid(),
  contractNumber: z.string().trim().min(1).max(80),
  contractType: z
    .enum(["PAUSHALI", "BOQ", "COST_PLUS"])
    .optional()
    .default("PAUSHALI"),
  totalAmount: z.coerce.number().min(0).optional(),
  insurancePct: z.coerce.number().min(0).max(100).optional(),
  retentionPct: z.coerce.number().min(0).max(100).optional(),
  paymentTerms: z.string().trim().optional().nullable(),
  advancePaymentAmount: z.coerce.number().min(0).optional(),
  advanceRecoveryMethod: z
    .enum(["PROPORTIONAL", "FIXED_AMOUNT", "FIXED_PCT"])
    .optional()
    .nullable(),
  advanceRecoveryPct: z.coerce.number().min(0).max(100).optional(),
  rawMaterialOffsetCommissionPct: z.coerce.number().min(0).max(100).optional(),
  pricingMethod: z.enum(["BOQ", "LUMP_SUM", "COST_PLUS"]).optional().nullable(),
  startDate: z.string().trim().optional().nullable(),
  endDate: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
})

export async function GET(req: NextRequest) {
  const ctx = await requireSubcontractorContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const q = req.nextUrl.searchParams.get("q")?.trim()
  const projectId = req.nextUrl.searchParams.get("projectId")?.trim()

  let query = supabase
    .from("erp_subcontractor_contracts")
    .select("*")
    .eq("company_id", activeCompanyId)
    .order("created_at", { ascending: false })

  if (projectId) query = query.eq("project_id", projectId)
  if (q)
    query = query.or(
      `contract_number.ilike.%${q}%,notes.ilike.%${q}%`
    )

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: (data ?? []).map(mapSubcontractorContractRow),
  })
}

export async function POST(req: NextRequest) {
  const ctx = await requireSubcontractorContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }

  const d = parsed.data

  // Verify project belongs to company
  const project = await supabase
    .from("erp_proj_projects")
    .select("id")
    .eq("company_id", activeCompanyId)
    .eq("id", d.projectId)
    .maybeSingle()
  if (project.error)
    return NextResponse.json({ error: project.error.message }, { status: 500 })
  if (!project.data)
    return NextResponse.json(
      { error: "Project not found for active company" },
      { status: 400 }
    )

  // Verify subcontractor belongs to company
  const sub = await supabase
    .from("erp_md_suppliers")
    .select("id")
    .eq("company_id", activeCompanyId)
    .eq("id", d.subcontractorId)
    .maybeSingle()
  if (sub.error)
    return NextResponse.json({ error: sub.error.message }, { status: 500 })
  if (!sub.data)
    return NextResponse.json(
      { error: "Subcontractor not found for active company" },
      { status: 400 }
    )

  const insert = await supabase
    .from("erp_subcontractor_contracts")
    .insert({
      company_id: activeCompanyId,
      project_id: d.projectId,
      subcontractor_id: d.subcontractorId,
      contract_number: d.contractNumber,
      contract_type: d.contractType ?? "PAUSHALI",
      total_amount: d.totalAmount ?? 0,
      insurance_pct: d.insurancePct ?? 0,
      retention_pct: d.retentionPct ?? 0,
      payment_terms: d.paymentTerms ?? null,
      advance_payment_amount: d.advancePaymentAmount ?? 0,
      advance_recovery_method: d.advanceRecoveryMethod ?? null,
      advance_recovery_pct: d.advanceRecoveryPct ?? 0,
      raw_material_offset_commission_pct: d.rawMaterialOffsetCommissionPct ?? 0,
      pricing_method: d.pricingMethod ?? null,
      start_date: d.startDate ?? null,
      end_date: d.endDate ?? null,
      notes: d.notes ?? null,
      status: "DRAFT",
    })
    .select("*")
    .single()

  if (insert.error)
    return NextResponse.json({ error: insert.error.message }, { status: 400 })

  return NextResponse.json(
    { data: mapSubcontractorContractRow(insert.data) },
    { status: 201 }
  )
}
