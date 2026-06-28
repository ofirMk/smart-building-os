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
    .select("id,company_id,supplier_id,full_name,first_name,last_name,foreign_name,role_title,phone,phone_mobile,phone_office,phone_home,fax,email,contact_status,is_primary")
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
      firstName: data.first_name ?? null,
      lastName: data.last_name ?? null,
      foreignName: data.foreign_name ?? null,
      role: data.role_title,
      phone: data.phone,
      phoneMobile: data.phone_mobile ?? null,
      phoneOffice: data.phone_office ?? null,
      phoneHome: data.phone_home ?? null,
      fax: data.fax ?? null,
      email: data.email,
      contactStatus: data.contact_status ?? "ACTIVE",
      isPrimary: data.is_primary,
    },
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; contactId: string }> | { id: string; contactId: string } }) {
  const { id: supplierId, contactId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const body = (await req.json().catch(() => null)) as {
    name?: unknown; role?: unknown; phone?: unknown; phoneMobile?: unknown;
    phoneOffice?: unknown; phoneHome?: unknown; fax?: unknown;
    email?: unknown; isPrimary?: unknown; firstName?: unknown;
    lastName?: unknown; foreignName?: unknown; contactStatus?: unknown
  } | null
  const patch: Record<string, string | boolean | null> = {}
  if (body?.name !== undefined) patch.full_name = sanitizeOptionalString(body.name)
  if (body?.firstName !== undefined) patch.first_name = sanitizeOptionalString(body.firstName)
  if (body?.lastName !== undefined) patch.last_name = sanitizeOptionalString(body.lastName)
  if (body?.foreignName !== undefined) patch.foreign_name = sanitizeOptionalString(body.foreignName)
  if (body?.role !== undefined) patch.role_title = sanitizeOptionalString(body.role)
  if (body?.phone !== undefined) patch.phone = sanitizeOptionalString(body.phone)
  if (body?.phoneMobile !== undefined) patch.phone_mobile = sanitizeOptionalString(body.phoneMobile)
  if (body?.phoneOffice !== undefined) patch.phone_office = sanitizeOptionalString(body.phoneOffice)
  if (body?.phoneHome !== undefined) patch.phone_home = sanitizeOptionalString(body.phoneHome)
  if (body?.fax !== undefined) patch.fax = sanitizeOptionalString(body.fax)
  if (body?.email !== undefined) patch.email = sanitizeOptionalString(body.email)
  if (body?.contactStatus !== undefined) patch.contact_status = body.contactStatus === "INACTIVE" ? "INACTIVE" : "ACTIVE"
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
