import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  mapClientContractRow,
  requireClientContractsApiContext,
} from "@/lib/erp/client-contracts-api"

const createContractSchema = z.object({
  projectId: z.string().uuid(),
  supplierId: z.string().uuid().optional().nullable(),
  contractNumber: z.string().trim().min(1),
  clientName: z.string().trim().min(2),
  title: z.string().trim().min(2),
  indexationPct: z.coerce.number().min(0).max(1000).optional(),
  retentionPct: z.coerce.number().min(0).max(100).optional(),
  advancePaymentAmount: z.coerce.number().min(0).optional(),
  advanceRepaymentPct: z.coerce.number().min(0).max(100).optional(),
  startDate: z.string().trim().optional().nullable(),
  endDate: z.string().trim().optional().nullable(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const q = req.nextUrl.searchParams.get("q")?.trim()
  let query = supabase
    .from("erp_client_contracts")
    .select("*")
    .eq("company_id", activeCompanyId)
    .order("created_at", { ascending: false })

  if (q) {
    query = query.or(`contract_number.ilike.%${q}%,title.ilike.%${q}%,client_name.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: (data ?? []).map(mapClientContractRow) })
}

export async function POST(req: NextRequest) {
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const body = await req.json().catch(() => null)
  const parsed = createContractSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 })
  }

  const project = await supabase
    .from("erp_proj_projects")
    .select("id")
    .eq("company_id", activeCompanyId)
    .eq("id", parsed.data.projectId)
    .maybeSingle()
  if (project.error) return NextResponse.json({ error: project.error.message }, { status: 500 })
  if (!project.data) return NextResponse.json({ error: "Project not found for active company" }, { status: 400 })

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

  const insert = await supabase
    .from("erp_client_contracts")
    .insert({
      company_id: activeCompanyId,
      project_id: parsed.data.projectId,
      supplier_id: parsed.data.supplierId ?? null,
      contract_number: parsed.data.contractNumber,
      client_name: parsed.data.clientName,
      title: parsed.data.title,
      indexation_pct: parsed.data.indexationPct ?? 0,
      retention_pct: parsed.data.retentionPct ?? 0,
      advance_payment_amount: parsed.data.advancePaymentAmount ?? 0,
      advance_repayment_pct: parsed.data.advanceRepaymentPct ?? 0,
      start_date: parsed.data.startDate ?? null,
      end_date: parsed.data.endDate ?? null,
      status: "DRAFT",
    })
    .select("*")
    .single()
  if (insert.error) return NextResponse.json({ error: insert.error.message }, { status: 400 })

  return NextResponse.json({ data: mapClientContractRow(insert.data) }, { status: 201 })
}

