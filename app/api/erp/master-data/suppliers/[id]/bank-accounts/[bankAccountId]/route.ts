import { type NextRequest, NextResponse } from "next/server"
import { requireMasterDataApiContext, sanitizeOptionalString } from "@/lib/erp/master-data-api"

function normalizeParams(params: Promise<{ id: string; bankAccountId: string }> | { id: string; bankAccountId: string }): Promise<{ id: string; bankAccountId: string }> {
  return Promise.resolve(params)
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; bankAccountId: string }> | { id: string; bankAccountId: string } }) {
  const { id: supplierId, bankAccountId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const { data, error } = await supabase
    .from("erp_md_supplier_bank_accounts")
    .select("id,company_id,supplier_id,bank_name,bank_code,branch_code,branch_name,account_number,iban,swift,is_primary")
    .eq("id", bankAccountId)
    .eq("supplier_id", supplierId)
    .eq("company_id", activeCompanyId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Supplier bank account not found" }, { status: 404 })
  return NextResponse.json({
    data: {
      id: data.id,
      companyId: data.company_id,
      supplierId: data.supplier_id,
      bankName: data.bank_name,
      bankCode: (data as Record<string, unknown>).bank_code as string | null ?? null,
      branchCode: data.branch_code,
      branchName: (data as Record<string, unknown>).branch_name as string | null ?? null,
      accountNumber: data.account_number,
      iban: data.iban,
      swift: data.swift,
      isPrimary: data.is_primary,
    },
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; bankAccountId: string }> | { id: string; bankAccountId: string } }) {
  const { id: supplierId, bankAccountId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const body = (await req.json().catch(() => null)) as { bankName?: unknown; bankCode?: unknown; branchCode?: unknown; branchName?: unknown; accountNumber?: unknown; iban?: unknown; swift?: unknown; isPrimary?: unknown } | null
  const patch: Record<string, string | boolean | null> = {}
  if (body?.bankName !== undefined) patch.bank_name = sanitizeOptionalString(body.bankName) ?? ""
  if (body?.bankCode !== undefined) patch.bank_code = sanitizeOptionalString(body.bankCode)
  if (body?.branchCode !== undefined) patch.branch_code = sanitizeOptionalString(body.branchCode)
  if (body?.branchName !== undefined) patch.branch_name = sanitizeOptionalString(body.branchName)
  if (body?.accountNumber !== undefined) patch.account_number = sanitizeOptionalString(body.accountNumber)
  if (body?.iban !== undefined) patch.iban = sanitizeOptionalString(body.iban)
  if (body?.swift !== undefined) patch.swift = sanitizeOptionalString(body.swift)
  if (body?.isPrimary !== undefined) patch.is_primary = body.isPrimary === true

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields supplied for update" }, { status: 400 })
  }
  if ("account_number" in patch && !patch.account_number) {
    return NextResponse.json({ error: "accountNumber cannot be empty" }, { status: 400 })
  }

  const { error } = await supabase
    .from("erp_md_supplier_bank_accounts")
    .update(patch)
    .eq("id", bankAccountId)
    .eq("supplier_id", supplierId)
    .eq("company_id", activeCompanyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return GET(req, { params })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; bankAccountId: string }> | { id: string; bankAccountId: string } }) {
  const { id: supplierId, bankAccountId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const { error } = await supabase
    .from("erp_md_supplier_bank_accounts")
    .delete()
    .eq("id", bankAccountId)
    .eq("supplier_id", supplierId)
    .eq("company_id", activeCompanyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
