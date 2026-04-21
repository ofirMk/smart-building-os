import { type NextRequest, NextResponse } from "next/server"

import {
  requireMasterDataApiContext,
  sanitizeOptionalString,
} from "@/lib/erp/master-data-api"
import type { CreateSupplierInput, ErpSupplier, ErpSupplierType } from "@/types/erp"

type SupplierCreateBody = Partial<CreateSupplierInput> & {
  supplierNumber?: unknown
  supplierNum?: unknown
  supplierKind?: unknown
  foreignName?: unknown
  address?: unknown
  phone?: unknown
  email?: unknown
  taxVatId?: unknown
  paymentTerms?: unknown
}

function normalizeSupplierKind(value: unknown): "supplier" | "subcontractor" {
  return sanitizeOptionalString(value) === "subcontractor"
    ? "subcontractor"
    : "supplier"
}

function toErpSupplierType(kind: "supplier" | "subcontractor"): ErpSupplierType {
  return kind === "subcontractor" ? "SUBCONTRACTOR" : "STANDARD"
}

function mapSupplierRow(row: {
  id: string
  company_id: string
  supplier_number: string
  name: string
  supplier_kind: "supplier" | "subcontractor"
  tax_vat_id: string | null
  payment_terms: string | null
}): ErpSupplier {
  return {
    id: row.id,
    companyId: row.company_id,
    supplierNum: row.supplier_number,
    name: row.name,
    taxId: row.tax_vat_id,
    type: toErpSupplierType(row.supplier_kind),
    paymentTerms: row.payment_terms,
  }
}

export async function GET(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response

  const { supabase, activeCompanyId } = gate.ctx
  const q = sanitizeOptionalString(req.nextUrl.searchParams.get("q"))
  const kind = sanitizeOptionalString(req.nextUrl.searchParams.get("supplierKind"))

  let query = supabase
    .from("erp_md_suppliers")
    .select("id,company_id,supplier_number,name,supplier_kind,tax_vat_id,payment_terms")
    .eq("company_id", activeCompanyId)
    .order("name", { ascending: true })

  if (kind === "supplier" || kind === "subcontractor") {
    query = query.eq("supplier_kind", kind)
  }
  if (q) {
    query = query.or(
      `name.ilike.%${q}%,supplier_number.ilike.%${q}%,tax_vat_id.ilike.%${q}%`
    )
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: (data ?? []).map(mapSupplierRow) })
}

export async function POST(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response

  const { supabase, activeCompanyId } = gate.ctx
  const body = (await req.json().catch(() => null)) as SupplierCreateBody | null

  const supplierNum =
    sanitizeOptionalString(body?.supplierNum) ??
    sanitizeOptionalString(body?.supplierNumber)
  const name = sanitizeOptionalString(body?.name)
  const supplierKind = normalizeSupplierKind(body?.supplierKind)
  const taxVatId = sanitizeOptionalString(body?.taxVatId) ?? sanitizeOptionalString(body?.taxId)
  const paymentTerms = sanitizeOptionalString(body?.paymentTerms)

  if (!supplierNum || !name) {
    return NextResponse.json(
      { error: "supplierNum and name are required" },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("erp_md_suppliers")
    .insert({
      company_id: activeCompanyId,
      supplier_number: supplierNum,
      supplier_kind: supplierKind,
      name,
      foreign_name: sanitizeOptionalString(body?.foreignName),
      address: sanitizeOptionalString(body?.address),
      phone: sanitizeOptionalString(body?.phone),
      email: sanitizeOptionalString(body?.email),
      tax_vat_id: taxVatId,
      payment_terms: paymentTerms,
    })
    .select("id,company_id,supplier_number,name,supplier_kind,tax_vat_id,payment_terms")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: mapSupplierRow(data) }, { status: 201 })
}
