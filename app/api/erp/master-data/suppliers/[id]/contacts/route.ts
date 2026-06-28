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
    .select("id,company_id,supplier_id,full_name,first_name,last_name,foreign_name,role_title,phone,phone_mobile,phone_office,phone_home,fax,email,contact_status,is_primary")
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
      firstName: row.first_name ?? null,
      lastName: row.last_name ?? null,
      foreignName: row.foreign_name ?? null,
      role: row.role_title,
      phone: row.phone,
      phoneMobile: row.phone_mobile ?? null,
      phoneOffice: row.phone_office ?? null,
      phoneHome: row.phone_home ?? null,
      fax: row.fax ?? null,
      email: row.email,
      contactStatus: row.contact_status ?? "ACTIVE",
      isPrimary: row.is_primary,
    })),
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { id: supplierId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const body = (await req.json().catch(() => null)) as {
    name?: unknown; role?: unknown; phone?: unknown; phoneMobile?: unknown;
    phoneOffice?: unknown; phoneHome?: unknown; fax?: unknown;
    email?: unknown; isPrimary?: unknown;
    firstName?: unknown; lastName?: unknown; foreignName?: unknown;
    contactStatus?: unknown
  } | null
  const name = sanitizeOptionalString(body?.name)
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 })

  const { data, error } = await supabase
    .from("erp_md_supplier_contacts")
    .insert({
      company_id: activeCompanyId,
      supplier_id: supplierId,
      full_name: name,
      first_name: sanitizeOptionalString(body?.firstName),
      last_name: sanitizeOptionalString(body?.lastName),
      foreign_name: sanitizeOptionalString(body?.foreignName),
      role_title: sanitizeOptionalString(body?.role),
      phone: sanitizeOptionalString(body?.phone),
      phone_mobile: sanitizeOptionalString(body?.phoneMobile),
      phone_office: sanitizeOptionalString(body?.phoneOffice),
      phone_home: sanitizeOptionalString(body?.phoneHome),
      fax: sanitizeOptionalString(body?.fax),
      email: sanitizeOptionalString(body?.email),
      contact_status: body?.contactStatus === "INACTIVE" ? "INACTIVE" : "ACTIVE",
      is_primary: body?.isPrimary === true,
    })
    .select("id,company_id,supplier_id,full_name,first_name,last_name,foreign_name,role_title,phone,phone_mobile,phone_office,phone_home,fax,email,contact_status,is_primary")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
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
  }, { status: 201 })
}
