import { type NextRequest, NextResponse } from "next/server"

import {
  requireMasterDataApiContext,
  sanitizeOptionalString,
} from "@/lib/erp/master-data-api"
import {
  supplierUpdateSchema,
  toSupplierUpdateRow,
} from "@/lib/erp/supplier-card-schema"
import type {
  ErpSupplier,
  ErpSupplierBankAccount,
  ErpSupplierContact,
  ErpSupplierMasterDetail,
  ErpSupplierType,
} from "@/types/erp"

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

type SupplierDbRow = {
  id: string
  company_id: string
  supplier_number: string
  name: string
  foreign_name: string | null
  supplier_kind: "supplier" | "subcontractor"
  status: string | null
  tax_vat_id: string | null
  payment_terms: string | null
  currency_code: string | null
  phone: string | null
  fax: string | null
  email: string | null
  website: string | null
  address: string | null
  address_line2: string | null
  address_line3: string | null
  city: string | null
  country_code: string | null
  zip_code: string | null
  for_attention: boolean | null
  opening_date: string | null
  industry: string | null
  branch_code: string | null
  founding_year: number | null
  employee_count: number | null
  prints_in_english: boolean | null
  is_confidential: boolean | null
  is_casual: boolean | null
  // פרטים נוספים — צילום #2
  responsible_person: string | null
  is_foreign_supplier: boolean | null
  authorization_level: number | null
  default_order_type: string | null
  subcontractor_wh: string | null
  consignment_wh: string | null
  supplier_type_code: string | null
  // CoA AP — צילום #3
  coa_account_id: string | null
  coa_account_code: string | null  // מדנורמלי לתצוגה מהירה
  // צילום #4
  has_attachments: boolean | null
  marketgeys_display: number | null
  // צילום #6
  entry_note: string | null
  // הגדרות כספים לספקים
  vat_file_number: string | null
  pays_by_bank_transfer: boolean | null
  round_invoice_price: boolean | null
  pay_to_order_of: string | null
  ledger_account_code: string | null
  purchases_account_code: string | null
  cost_center_code: string | null
  invoice_txn_type: string | null
  credit_txn_type: string | null
  // פרטים כלליים וניכוי מס במקור
  vat_code: string | null
  is_internal_supplier: boolean | null
  general_discount_pct: string | null
  income_tax_file_number: string | null
  income_tax_file_type: number | null
  withholding_pct: string | null
  withholding_valid_until: string | null
  max_withholding_pct: string | null
  bookkeeping_cert_valid_until: string | null
  withholding_discount: string | null
  withholding_discount_until: string | null
  withholds_from_supplier: boolean | null
  income_tax_classification: string | null
  tax_officer_code: string | null
  is_required_to_file: boolean | null
  withholding_from_date: string | null
  withholding_to_date: string | null
  max_withholding_code: string | null
  withholding_tolerance_shekel: boolean | null
  withholding_file_code: string | null
  withholding_code_2: string | null
  withholding_code_3: string | null
  // Phase 7.2 — Vendor qualification
  qualification_status: string | null
  qualification_notes: string | null
  qualified_at: string | null
}

const SUPPLIER_SELECT =
  "id,company_id,supplier_number,name,foreign_name,supplier_kind,status," +
  "tax_vat_id,payment_terms,currency_code," +
  "phone,fax,email,website," +
  "address,address_line2,address_line3,city,country_code,zip_code," +
  "for_attention,opening_date," +
  "industry,branch_code,founding_year,employee_count,prints_in_english,is_confidential,is_casual," +
  "responsible_person,is_foreign_supplier,authorization_level,default_order_type," +
  "subcontractor_wh,consignment_wh,supplier_type_code," +
  "coa_account_id,coa_account_code," +
  "has_attachments,marketgeys_display," +
  "entry_note," +
  "vat_file_number,pays_by_bank_transfer,round_invoice_price,pay_to_order_of," +
  "ledger_account_code,purchases_account_code,cost_center_code,invoice_txn_type,credit_txn_type," +
  "vat_code,is_internal_supplier,general_discount_pct," +
  "income_tax_file_number,income_tax_file_type,withholding_pct,withholding_valid_until," +
  "max_withholding_pct,bookkeeping_cert_valid_until,withholding_discount,withholding_discount_until," +
  "withholds_from_supplier,income_tax_classification,tax_officer_code," +
  "is_required_to_file,withholding_from_date,withholding_to_date,max_withholding_code," +
  "withholding_tolerance_shekel,withholding_file_code,withholding_code_2,withholding_code_3," +
  "qualification_status,qualification_notes,qualified_at"

function mapSupplier(row: SupplierDbRow): ErpSupplier {
  return {
    id: row.id,
    companyId: row.company_id,
    supplierNum: row.supplier_number,
    name: row.name,
    foreignName: row.foreign_name ?? null,
    type: toErpSupplierType(row.supplier_kind),
    status: row.status ?? "ACTIVE",
    taxId: row.tax_vat_id,
    paymentTerms: row.payment_terms,
    currencyCode: row.currency_code ?? null,
    phone: row.phone ?? null,
    fax: row.fax ?? null,
    email: row.email ?? null,
    website: row.website ?? null,
    address: row.address ?? null,
    addressLine2: row.address_line2 ?? null,
    addressLine3: row.address_line3 ?? null,
    city: row.city ?? null,
    countryCode: row.country_code ?? null,
    zipCode: row.zip_code ?? null,
    forAttention: row.for_attention ?? false,
    openingDate: row.opening_date ?? null,
    industry: row.industry ?? null,
    branchCode: row.branch_code ?? null,
    foundingYear: row.founding_year ?? null,
    employeeCount: row.employee_count ?? null,
    printsInEnglish: row.prints_in_english ?? false,
    isConfidential: row.is_confidential ?? false,
    isCasual: row.is_casual ?? false,
    responsiblePerson: row.responsible_person ?? null,
    isForeignSupplier: row.is_foreign_supplier ?? false,
    authorizationLevel: row.authorization_level ?? null,
    defaultOrderType: row.default_order_type ?? null,
    subcontractorWh: row.subcontractor_wh ?? null,
    consignmentWh: row.consignment_wh ?? null,
    supplierTypeCode: row.supplier_type_code ?? null,
    coaAccountId: row.coa_account_id ?? null,
    coaAccountCode: row.coa_account_code ?? null,
    hasAttachments: row.has_attachments ?? false,
    marketgeysDisplay: row.marketgeys_display ?? 0,
    entryNote: row.entry_note ?? null,
    vatFileNumber: row.vat_file_number ?? null,
    paysByBankTransfer: row.pays_by_bank_transfer ?? false,
    roundInvoicePrice: row.round_invoice_price ?? false,
    payToOrderOf: row.pay_to_order_of ?? null,
    ledgerAccountCode: row.ledger_account_code ?? null,
    purchasesAccountCode: row.purchases_account_code ?? null,
    costCenterCode: row.cost_center_code ?? null,
    invoiceTxnType: row.invoice_txn_type ?? null,
    creditTxnType: row.credit_txn_type ?? null,
    vatCode: row.vat_code ?? null,
    isInternalSupplier: row.is_internal_supplier ?? false,
    generalDiscountPct: row.general_discount_pct != null ? Number(row.general_discount_pct) : null,
    incomeTaxFileNumber: row.income_tax_file_number ?? null,
    incomeTaxFileType: row.income_tax_file_type ?? null,
    withholdingPct: row.withholding_pct != null ? Number(row.withholding_pct) : null,
    withholdingValidUntil: row.withholding_valid_until ?? null,
    maxWithholdingPct: row.max_withholding_pct != null ? Number(row.max_withholding_pct) : null,
    bookkeeepingCertValidUntil: row.bookkeeping_cert_valid_until ?? null,
    withholdingDiscount: row.withholding_discount != null ? Number(row.withholding_discount) : null,
    withholdingDiscountUntil: row.withholding_discount_until ?? null,
    withholdsFromSupplier: row.withholds_from_supplier ?? false,
    incomeTaxClassification: row.income_tax_classification ?? null,
    taxOfficerCode: row.tax_officer_code ?? null,
    isRequiredToFile: row.is_required_to_file ?? false,
    withholdingFromDate: row.withholding_from_date ?? null,
    withholdingToDate: row.withholding_to_date ?? null,
    maxWithholdingCode: row.max_withholding_code ?? null,
    withholdingToleranceShekel: row.withholding_tolerance_shekel ?? false,
    withholdingFileCode: row.withholding_file_code ?? null,
    withholdingCode2: row.withholding_code_2 ?? null,
    withholdingCode3: row.withholding_code_3 ?? null,
    // Phase 7.2 — Vendor qualification
    qualificationStatus: row.qualification_status ?? "APPROVED",
    qualificationNotes: row.qualification_notes ?? null,
    qualifiedAt: row.qualified_at ?? null,
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
    .select(SUPPLIER_SELECT)
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

  const out: ErpSupplierMasterDetail = { ...mapSupplier(supplier as unknown as SupplierDbRow) }

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
        firstName: (row as Record<string, unknown>).first_name as string | null ?? null,
        lastName: (row as Record<string, unknown>).last_name as string | null ?? null,
        foreignName: (row as Record<string, unknown>).foreign_name as string | null ?? null,
        role: row.role_title,
        phone: row.phone,
        phoneMobile: (row as Record<string, unknown>).phone_mobile as string | null ?? null,
        phoneOffice: (row as Record<string, unknown>).phone_office as string | null ?? null,
        phoneHome: (row as Record<string, unknown>).phone_home as string | null ?? null,
        fax: (row as Record<string, unknown>).fax as string | null ?? null,
        email: row.email,
        contactStatus: (row as Record<string, unknown>).contact_status as string ?? "ACTIVE",
        isPrimary: row.is_primary,
      })
    )
  }

  if (includeBankAccounts) {
    const { data: banks, error: banksError } = await supabase
      .from("erp_md_supplier_bank_accounts")
      .select("id,company_id,supplier_id,bank_name,bank_code,branch_code,branch_name,account_number,iban,swift,is_primary")
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
        bankCode: (row as Record<string, unknown>).bank_code as string | null ?? null,
        branchCode: row.branch_code,
        branchName: (row as Record<string, unknown>).branch_name as string | null ?? null,
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

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null

  // Backward-compat aliases.
  if (raw && raw.supplierNumber != null && raw.supplierNum == null) {
    raw.supplierNum = raw.supplierNumber
  }
  if (raw && raw.taxId != null && raw.taxVatId == null) {
    raw.taxVatId = raw.taxId
  }

  const parsed = supplierUpdateSchema.safeParse(raw ?? {})
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    )
  }

  const patch = toSupplierUpdateRow(parsed.data)
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No valid fields supplied for update" },
      { status: 400 },
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

