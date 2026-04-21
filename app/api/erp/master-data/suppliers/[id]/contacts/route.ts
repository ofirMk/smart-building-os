import { type NextRequest, NextResponse } from "next/server"
import { requireMasterDataApiContext, sanitizeOptionalString } from "@/lib/erp/master-data-api"

function normalizeParams(params: Promise<{ id: string }> | { id: string }): Promise<{ id: string }> {
  return Promise.resolve(params)
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { id: supplierId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const { data, error } = await supabase
    .from("erp_md_supplier_contacts")
    .select("id,company_id,supplier_id,full_name,role_title,phone,email,is_primary")
    .eq("company_id", activeCompanyId)
    .eq("supplier_id", supplierId)
    .order("is_primary", { ascending: false })
    .order("full_name", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    data: (data ?? []).map((row) => ({
      id: row.id,
      companyId: row.company_id,
      supplierId: row.supplier_id,
      name: row.full_name,
      role: row.role_title,
      phone: row.phone,
      email: row.email,
      isPrimary: row.is_primary,
    })),
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { id: supplierId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const body = (await req.json().catch(() => null)) as { name?: unknown; role?: unknown; phone?: unknown; email?: unknown; isPrimary?: unknown } | null
  const name = sanitizeOptionalString(body?.name)
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 })

  const { data, error } = await supabase
    .from("erp_md_supplier_contacts")
    .insert({
      company_id: activeCompanyId,
      supplier_id: supplierId,
      full_name: name,
      role_title: sanitizeOptionalString(body?.role),
      phone: sanitizeOptionalString(body?.phone),
      email: sanitizeOptionalString(body?.email),
      is_primary: body?.isPrimary === true,
    })
    .select("id,company_id,supplier_id,full_name,role_title,phone,email,is_primary")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({
    data: {
      id: data.id,
      companyId: data.company_id,
      supplierId: data.supplier_id,
      name: data.full_name,
      role: data.role_title,
      phone: data.phone,
      email: data.email,
      isPrimary: data.is_primary,
    },
  }, { status: 201 })
}
