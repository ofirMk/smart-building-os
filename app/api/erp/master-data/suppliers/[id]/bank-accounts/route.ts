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
    .from("erp_md_supplier_bank_accounts")
    .select("id,company_id,supplier_id,bank_name,branch_code,account_number,iban,swift,is_primary")
    .eq("company_id", activeCompanyId)
    .eq("supplier_id", supplierId)
    .order("is_primary", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    data: (data ?? []).map((row) => ({
      id: row.id,
      companyId: row.company_id,
      supplierId: row.supplier_id,
      bankName: row.bank_name,
      branchCode: row.branch_code,
      accountNumber: row.account_number,
      iban: row.iban,
      swift: row.swift,
      isPrimary: row.is_primary,
    })),
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { id: supplierId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const body = (await req.json().catch(() => null)) as { bankName?: unknown; branchCode?: unknown; accountNumber?: unknown; iban?: unknown; swift?: unknown; isPrimary?: unknown } | null
  const accountNumber = sanitizeOptionalString(body?.accountNumber)
  if (!accountNumber) {
    return NextResponse.json({ error: "accountNumber is required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("erp_md_supplier_bank_accounts")
    .insert({
      company_id: activeCompanyId,
      supplier_id: supplierId,
      bank_name: sanitizeOptionalString(body?.bankName) ?? "",
      branch_code: sanitizeOptionalString(body?.branchCode),
      account_number: accountNumber,
      iban: sanitizeOptionalString(body?.iban),
      swift: sanitizeOptionalString(body?.swift),
      is_primary: body?.isPrimary === true,
    })
    .select("id,company_id,supplier_id,bank_name,branch_code,account_number,iban,swift,is_primary")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({
    data: {
      id: data.id,
      companyId: data.company_id,
      supplierId: data.supplier_id,
      bankName: data.bank_name,
      branchCode: data.branch_code,
      accountNumber: data.account_number,
      iban: data.iban,
      swift: data.swift,
      isPrimary: data.is_primary,
    },
  }, { status: 201 })
}
