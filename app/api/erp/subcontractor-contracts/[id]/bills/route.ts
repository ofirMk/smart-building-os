import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  mapBillRow,
  normalizeRouteParams,
  requireSubcontractorContractsApiContext,
} from "@/lib/erp/subcontractor-contracts-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const createBillSchema = z.object({
  executionMonth: z.string().trim().min(1, "נדרש חודש ביצוע (YYYY-MM)"),
  billDate: z.string().trim().optional().nullable(),
  vatPct: z.coerce.number().min(0).max(100).optional(),
  isFinal: z.boolean().optional().default(false),
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

  // Verify contract belongs to company
  const contract = await supabase
    .from("erp_subcontractor_contracts")
    .select("id, project_id")
    .eq("company_id", activeCompanyId)
    .eq("id", id)
    .maybeSingle()
  if (contract.error)
    return NextResponse.json({ error: contract.error.message }, { status: 500 })
  if (!contract.data)
    return NextResponse.json({ error: "Contract not found" }, { status: 404 })

  const { data, error } = await supabase
    .from("erp_subcontractor_bills")
    .select("*")
    .eq("company_id", activeCompanyId)
    .eq("contract_id", id)
    .order("bill_number", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: (data ?? []).map(mapBillRow) })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const ctx = await requireSubcontractorContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { id } = await normalizeRouteParams(params)

  // Fetch contract to get project_id + validate ownership
  const contract = await supabase
    .from("erp_subcontractor_contracts")
    .select("id, project_id, status")
    .eq("company_id", activeCompanyId)
    .eq("id", id)
    .maybeSingle()
  if (contract.error)
    return NextResponse.json({ error: contract.error.message }, { status: 500 })
  if (!contract.data)
    return NextResponse.json({ error: "Contract not found" }, { status: 404 })
  if (contract.data.status === "CANCELLED")
    return NextResponse.json(
      { error: "Cannot create bill on a cancelled contract" },
      { status: 400 }
    )

  const body = await req.json().catch(() => null)
  const parsed = createBillSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }

  // Next bill_number = max + 1
  const maxNo = await supabase
    .from("erp_subcontractor_bills")
    .select("bill_number")
    .eq("company_id", activeCompanyId)
    .eq("contract_id", id)
    .order("bill_number", { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextBillNo = (maxNo.data?.bill_number ?? 0) + 1

  const d = parsed.data
  const insert = await supabase
    .from("erp_subcontractor_bills")
    .insert({
      company_id: activeCompanyId,
      project_id: contract.data.project_id,
      contract_id: id,
      bill_number: nextBillNo,
      execution_month: d.executionMonth,
      bill_date: d.billDate ?? new Date().toISOString().slice(0, 10),
      vat_pct: d.vatPct ?? 17,
      is_final: d.isFinal ?? false,
      notes: d.notes ?? null,
      status: "DRAFT",
    })
    .select("*")
    .single()

  if (insert.error)
    return NextResponse.json({ error: insert.error.message }, { status: 400 })

  return NextResponse.json({ data: mapBillRow(insert.data) }, { status: 201 })
}
