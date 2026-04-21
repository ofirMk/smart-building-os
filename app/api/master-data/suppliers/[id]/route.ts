import { type NextRequest, NextResponse } from "next/server"

import {
  requireMasterDataApiContext,
  sanitizeOptionalString,
} from "@/lib/erp/master-data-api"
import type {
  ErpSupplier,
  ErpSupplierBankAccount,
  ErpSupplierContact,
  ErpSupplierMasterDetail,
  ErpSupplierType,
  UpdateSupplierInput,
} from "@/types/erp"

type SupplierUpdateBody = Partial<UpdateSupplierInput> & {
  supplierNumber?: unknown
  supplierNum?: unknown
  supplierKind?: unknown
  taxVatId?: unknown
  foreignName?: unknown
  address?: unknown
  phone?: unknown
  email?: unknown
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeParams(
  params: Promise<{ id: string }> | { id: string }
): Promise<{ id: string }> {
  return Promise.resolve(params)
}

function toErpSupplierType(kind: "supplier" | "subcontractor"): ErpSupplierType {
  return kind === "subcontractor" ? "SUBCONTRACTOR" : "STANDARD"
}

function mapSupplier(row: {
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

async function loadSupplierAggregate(req: NextRequest, supplierId: string) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate

  const { supabase, activeCompanyId } = gate.ctx
  const include = req.nextUrl.searchParams.get("include") ?? ""
  const includeContacts = include.includes("contacts")
  const includeBankAccounts = include.includes("bankAccounts")

  const { data: supplier, error } = await supabase
    .from("erp_md_suppliers")
    .select("id,company_id,supplier_number,name,supplier_kind,tax_vat_id,payment_terms")
    .eq("id", supplierId)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: error.message }, { status: 500 }),
    }
  }
  if (!supplier) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Supplier not found" }, { status: 404 }),
    }
  }

  const out: ErpSupplierMasterDetail = { ...mapSupplier(supplier) }

  if (includeContacts) {
    const { data: contacts, error: contactsError } = await supabase
      .from("erp_md_supplier_contacts")
      .select("id,company_id,supplier_id,full_name,role_title,phone,email,is_primary")
      .eq("company_id", activeCompanyId)
      .eq("supplier_id", supplierId)
      .order("is_primary", { ascending: false })
      .order("full_name", { ascending: true })

    if (contactsError) {
      return {
        ok: false as const,
        response: NextResponse.json({ error: contactsError.message }, { status: 500 }),
      }
    }
    out.contacts = (contacts ?? []).map(
      (row): ErpSupplierContact => ({
        id: row.id,
        companyId: row.company_id,
        supplierId: row.supplier_id,
        name: row.full_name,
        role: row.role_title,
        phone: row.phone,
        email: row.email,
        isPrimary: row.is_primary,
      })
    )
  }

  if (includeBankAccounts) {
    const { data: banks, error: banksError } = await supabase
      .from("erp_md_supplier_bank_accounts")
      .select("id,company_id,supplier_id,bank_name,branch_code,account_number,iban,swift,is_primary")
      .eq("company_id", activeCompanyId)
      .eq("supplier_id", supplierId)
      .order("is_primary", { ascending: false })
      .order("bank_name", { ascending: true })

    if (banksError) {
      return {
        ok: false as const,
        response: NextResponse.json({ error: banksError.message }, { status: 500 }),
      }
    }
    out.bankAccounts = (banks ?? []).map(
      (row): ErpSupplierBankAccount => ({
        id: row.id,
        companyId: row.company_id,
        supplierId: row.supplier_id,
        bankName: row.bank_name,
        branchCode: row.branch_code,
        accountNumber: row.account_number,
        iban: row.iban,
        swift: row.swift,
        isPrimary: row.is_primary,
      })
    )
  }

  return { ok: true as const, data: out }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeParams(params)
  const loaded = await loadSupplierAggregate(req, id)
  if (!loaded.ok) return loaded.response
  return NextResponse.json({ data: loaded.data })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const body = (await req.json().catch(() => null)) as SupplierUpdateBody | null
  const patch: Record<string, string | null> = {}

  const supplierNum =
    sanitizeOptionalString(body?.supplierNum) ??
    sanitizeOptionalString(body?.supplierNumber)
  const name = sanitizeOptionalString(body?.name)
  const supplierKind = sanitizeOptionalString(body?.supplierKind)
  const taxVatId = sanitizeOptionalString(body?.taxVatId) ?? sanitizeOptionalString(body?.taxId)
  const paymentTerms = sanitizeOptionalString(body?.paymentTerms)

  if (supplierNum) patch.supplier_number = supplierNum
  if (name) patch.name = name
  if (supplierKind === "supplier" || supplierKind === "subcontractor") {
    patch.supplier_kind = supplierKind
  }
  if (body?.foreignName !== undefined) patch.foreign_name = sanitizeOptionalString(body.foreignName)
  if (body?.address !== undefined) patch.address = sanitizeOptionalString(body.address)
  if (body?.phone !== undefined) patch.phone = sanitizeOptionalString(body.phone)
  if (body?.email !== undefined) patch.email = sanitizeOptionalString(body.email)
  if (taxVatId !== null) patch.tax_vat_id = taxVatId
  if (paymentTerms !== null) patch.payment_terms = paymentTerms

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No valid fields supplied for update" },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from("erp_md_suppliers")
    .update(patch)
    .eq("id", id)
    .eq("company_id", activeCompanyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const loaded = await loadSupplierAggregate(req, id)
  if (!loaded.ok) return loaded.response
  return NextResponse.json({ data: loaded.data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const { error } = await supabase
    .from("erp_md_suppliers")
    .delete()
    .eq("id", id)
    .eq("company_id", activeCompanyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}

