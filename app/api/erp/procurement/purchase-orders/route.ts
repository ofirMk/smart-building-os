import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  mapPurchaseOrderRow,
  requireProcurementApiContext,
} from "@/lib/erp/procurement-api"

const createPurchaseOrderSchema = z.object({
  projectId: z.string().uuid(),
  supplierId: z.string().uuid(),
  poNumber: z.string().trim().min(1),
  title: z.string().trim().min(2),
  issuedAt: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const status = req.nextUrl.searchParams.get("status")
  const q = req.nextUrl.searchParams.get("q")?.trim()

  let query = supabase
    .from("erp_purchase_orders")
    .select("*")
    .eq("company_id", activeCompanyId)
    .order("created_at", { ascending: false })

  if (status) query = query.eq("status", status)
  if (q) query = query.or(`po_number.ilike.%${q}%,title.ilike.%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: (data ?? []).map(mapPurchaseOrderRow) })
}

export async function POST(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const body = await req.json().catch(() => null)
  const parsed = createPurchaseOrderSchema.safeParse(body)
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

  const supplier = await supabase
    .from("erp_md_suppliers")
    .select("id")
    .eq("company_id", activeCompanyId)
    .eq("id", parsed.data.supplierId)
    .maybeSingle()
  if (supplier.error) return NextResponse.json({ error: supplier.error.message }, { status: 500 })
  if (!supplier.data) return NextResponse.json({ error: "Supplier not found for active company" }, { status: 400 })

  const { data, error } = await supabase
    .from("erp_purchase_orders")
    .insert({
      company_id: activeCompanyId,
      project_id: parsed.data.projectId,
      supplier_id: parsed.data.supplierId,
      po_number: parsed.data.poNumber,
      title: parsed.data.title,
      issued_at: parsed.data.issuedAt ?? null,
      notes: parsed.data.notes ?? null,
      status: "DRAFT",
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: mapPurchaseOrderRow(data) }, { status: 201 })
}

