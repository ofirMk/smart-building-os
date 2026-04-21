import { type NextRequest, NextResponse } from "next/server"
import { requireMasterDataApiContext, sanitizeOptionalString } from "@/lib/erp/master-data-api"

function normalizeParams(params: Promise<{ id: string; contactId: string }> | { id: string; contactId: string }): Promise<{ id: string; contactId: string }> {
  return Promise.resolve(params)
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; contactId: string }> | { id: string; contactId: string } }) {
  const { id: supplierId, contactId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const { data, error } = await supabase
    .from("erp_md_supplier_contacts")
    .select("id,company_id,supplier_id,full_name,role_title,phone,email,is_primary")
    .eq("id", contactId)
    .eq("supplier_id", supplierId)
    .eq("company_id", activeCompanyId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Supplier contact not found" }, { status: 404 })
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
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; contactId: string }> | { id: string; contactId: string } }) {
  const { id: supplierId, contactId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const body = (await req.json().catch(() => null)) as { name?: unknown; role?: unknown; phone?: unknown; email?: unknown; isPrimary?: unknown } | null
  const patch: Record<string, string | boolean | null> = {}
  if (body?.name !== undefined) patch.full_name = sanitizeOptionalString(body.name)
  if (body?.role !== undefined) patch.role_title = sanitizeOptionalString(body.role)
  if (body?.phone !== undefined) patch.phone = sanitizeOptionalString(body.phone)
  if (body?.email !== undefined) patch.email = sanitizeOptionalString(body.email)
  if (body?.isPrimary !== undefined) patch.is_primary = body.isPrimary === true

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields supplied for update" }, { status: 400 })
  }
  if ("full_name" in patch && !patch.full_name) {
    return NextResponse.json({ error: "name cannot be empty" }, { status: 400 })
  }

  const { error } = await supabase
    .from("erp_md_supplier_contacts")
    .update(patch)
    .eq("id", contactId)
    .eq("supplier_id", supplierId)
    .eq("company_id", activeCompanyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return GET(req, { params })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; contactId: string }> | { id: string; contactId: string } }) {
  const { id: supplierId, contactId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const { error } = await supabase
    .from("erp_md_supplier_contacts")
    .delete()
    .eq("id", contactId)
    .eq("supplier_id", supplierId)
    .eq("company_id", activeCompanyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
