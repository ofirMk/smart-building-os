import { type NextRequest, NextResponse } from "next/server"

import {
  requireMasterDataApiContext,
  sanitizeOptionalString,
} from "@/lib/erp/master-data-api"
import {
  supplierCreateSchema,
  toSupplierInsertRow,
} from "@/lib/erp/supplier-card-schema"
import type { ErpSupplier, ErpSupplierType } from "@/types/erp"

// סטים לקטלוג סטטוסי PO — חייב להיות בסינכרון עם orders-list-scaffold
// ואיתם /api/master-data/suppliers/[id]/purchase-orders. שינוי כאן ←
// שינוי שם.
const OPEN_PO_STATUSES = [
  "DRAFT",
  "PENDING",
  "PENDING_APPROVAL",
  "PENDING_PRICE_APPROVAL",
  "PENDING_CEO_APPROVAL",
  "APPROVED",
  "ISSUED",
  "SENT_TO_SUPPLIER",
  "PARTIALLY_RECEIVED",
] as const

const PAID_INVOICE_STATUSES = ["APPROVED", "READY_FOR_PAYMENT"] as const

// SupplierCreateBody / normalizeSupplierKind — removed.
// POST validation moved to `lib/erp/supplier-card-schema.ts` (Phase A).
// PUT in `[id]/route.ts` retains its own light normalizer for backwards compat.

function toErpSupplierType(kind: "supplier" | "subcontractor"): ErpSupplierType {
  return kind === "subcontractor" ? "SUBCONTRACTOR" : "STANDARD"
}

// DB row shape — all columns selected by SUPPLIER_SELECT below.
type SupplierDbRow = {
  id: string
  company_id: string
  supplier_number: string
  name: string
  supplier_kind: "supplier" | "subcontractor"
  foreign_name: string | null
  status: string | null
  tax_vat_id: string | null
  payment_terms: string | null
  currency_code: string | null
  // contact & address
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
  // flags
  for_attention: boolean | null
  opening_date: string | null
  // enrichment
  industry: string | null
  branch_code: string | null
  founding_year: number | null
  employee_count: number | null
  prints_in_english: boolean | null
  is_confidential: boolean | null
  is_casual: boolean | null
  // Priority additional details
  responsible_person: string | null
  is_foreign_supplier: boolean | null
  authorization_level: number | null
  default_order_type: string | null
  subcontractor_wh: string | null
  consignment_wh: string | null
  supplier_type_code: string | null
  // CoA link
  coa_account_id: string | null
  coa_account_code: string | null
  // display flags
  has_attachments: boolean | null
  marketgeys_display: number | null
  entry_note: string | null
  // financial settings
  vat_file_number: string | null
  pays_by_bank_transfer: boolean | null
  round_invoice_price: boolean | null
  pay_to_order_of: string | null
  ledger_account_code: string | null
  purchases_account_code: string | null
  cost_center_code: string | null
  invoice_txn_type: string | null
  credit_txn_type: string | null
  // tax / withholding
  vat_code: string | null
  is_internal_supplier: boolean | null
  general_discount_pct: number | null
  income_tax_file_number: string | null
  income_tax_file_type: number | null
  withholding_pct: number | null
  withholding_valid_until: string | null
  max_withholding_pct: number | null
  bookkeeping_cert_valid_until: string | null
  withholding_discount: number | null
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
  // qualification
  qualification_status: string | null
  qualification_notes: string | null
  qualified_at: string | null
}

// All columns fetched in list & detail queries — single source of truth.
export const SUPPLIER_SELECT =
  "id,company_id,supplier_number,name,supplier_kind,foreign_name,status," +
  "tax_vat_id,payment_terms,currency_code," +
  "phone,fax,email,website,address,address_line2,address_line3,city,country_code,zip_code," +
  "for_attention,opening_date," +
  "industry,branch_code,founding_year,employee_count,prints_in_english,is_confidential,is_casual," +
  "responsible_person,is_foreign_supplier,authorization_level,default_order_type," +
  "subcontractor_wh,consignment_wh,supplier_type_code," +
  "coa_account_id,coa_account_code," +
  "has_attachments,marketgeys_display,entry_note," +
  "vat_file_number,pays_by_bank_transfer,round_invoice_price,pay_to_order_of," +
  "ledger_account_code,purchases_account_code,cost_center_code,invoice_txn_type,credit_txn_type," +
  "vat_code,is_internal_supplier,general_discount_pct,income_tax_file_number,income_tax_file_type," +
  "withholding_pct,withholding_valid_until,max_withholding_pct,bookkeeping_cert_valid_until," +
  "withholding_discount,withholding_discount_until,withholds_from_supplier," +
  "income_tax_classification,tax_officer_code," +
  "is_required_to_file,withholding_from_date,withholding_to_date,max_withholding_code," +
  "withholding_tolerance_shekel,withholding_file_code,withholding_code_2,withholding_code_3," +
  "qualification_status,qualification_notes,qualified_at"

function mapSupplierRow(row: SupplierDbRow): ErpSupplier {
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
    generalDiscountPct: row.general_discount_pct ?? null,
    incomeTaxFileNumber: row.income_tax_file_number ?? null,
    incomeTaxFileType: row.income_tax_file_type ?? null,
    withholdingPct: row.withholding_pct ?? null,
    withholdingValidUntil: row.withholding_valid_until ?? null,
    maxWithholdingPct: row.max_withholding_pct ?? null,
    bookkeeepingCertValidUntil: row.bookkeeping_cert_valid_until ?? null,
    withholdingDiscount: row.withholding_discount ?? null,
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
    qualificationStatus: row.qualification_status ?? "APPROVED",
    qualificationNotes: row.qualification_notes ?? null,
    qualifiedAt: row.qualified_at ?? null,
  }
}

/** Aggregates ל-master grid של מסך הספקים (Phase 9.1). */
export type SupplierAggregateDto = {
  /** סך POs פתוחים (סטטוסים שלא סגורים/בוטלים). */
  openPoCount: number
  /** סכום ברוטו של POs פתוחים במטבע הדומיננטי. ריק אם אין. */
  openPoValue: number | null
  /** מטבע דומיננטי של POs פתוחים — null אם אין POs בכלל. */
  openPoCurrency: string | null
  /** סך חשבוניות שעוד לא שולמו (לא APPROVED/READY_FOR_PAYMENT/CANCELLED). */
  unpaidInvoiceCount: number
  /** חוב נוכחי לספק לפי חשבוניות לא-משולמות (ILS, סכום total_amount). */
  unpaidInvoiceValue: number
  /** תאריך הפעולה האחרונה — max מ-issued_at של POs ו-invoice_date של חשבוניות. */
  lastActivityAt: string | null
}

export type ErpSupplierWithAggregates = ErpSupplier & {
  aggregates?: SupplierAggregateDto
}

type PoRow = {
  supplier_id: string
  status: string
  total_amount_gross: number | string | null
  total_amount: number | string
  currency: string | null
  issued_at: string | null
}

type InvoiceRow = {
  supplier_id: string
  status: string
  total_amount: number | string
  invoice_date: string | null
}

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === "string" ? Number(v) : v
  return Number.isFinite(n) ? n : 0
}

// supabase מועבר כ-unknown כדי לעקוף type-instantiation עמוק; שימוש פנימי בלבד.
async function loadAggregates(
  supabaseUnknown: unknown,
  activeCompanyId: string,
  supplierIds: string[],
): Promise<Map<string, SupplierAggregateDto>> {
  const supabase = supabaseUnknown as {
    from: (tbl: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          in: (
            col: string,
            vals: readonly string[],
          ) => Promise<{
            data: unknown
            error: { message: string } | null
          }> & {
            in: (
              col: string,
              vals: readonly string[],
            ) => Promise<{
              data: unknown
              error: { message: string } | null
            }>
          }
        }
      }
    }
  }
  const out = new Map<string, SupplierAggregateDto>()
  if (supplierIds.length === 0) return out

  // ── POs פתוחים בלבד — לחישוב open value & dominant currency. ──────────
  const posQ = await supabase
    .from("erp_purchase_orders")
    .select(
      "supplier_id,status,total_amount_gross,total_amount,currency,issued_at",
    )
    .eq("company_id", activeCompanyId)
    .in("supplier_id", supplierIds)
    .in("status", OPEN_PO_STATUSES as unknown as string[])

  // ── Invoices לא-משולמות (לא APPROVED/READY/CANCELLED). ────────────────
  // מסננים בקוד לאחר השליפה — Postgres-supabase לא תומך טוב ב-NOT IN ארוך.
  const invQ = await supabase
    .from("erp_vendor_invoices")
    .select("supplier_id,status,total_amount,invoice_date")
    .eq("company_id", activeCompanyId)
    .in("supplier_id", supplierIds)

  const pos = (posQ.data ?? []) as PoRow[]
  const invs = (invQ.data ?? []) as InvoiceRow[]

  type Bucket = {
    openPoCount: number
    poValueByCcy: Map<string, number>
    unpaidInvoiceCount: number
    unpaidInvoiceValue: number
    lastActivityAt: string | null
  }
  const bySup = new Map<string, Bucket>()
  function get(sid: string): Bucket {
    let b = bySup.get(sid)
    if (!b) {
      b = {
        openPoCount: 0,
        poValueByCcy: new Map(),
        unpaidInvoiceCount: 0,
        unpaidInvoiceValue: 0,
        lastActivityAt: null,
      }
      bySup.set(sid, b)
    }
    return b
  }
  function bumpDate(b: Bucket, d: string | null) {
    if (!d) return
    if (!b.lastActivityAt || d > b.lastActivityAt) b.lastActivityAt = d
  }

  for (const p of pos) {
    const b = get(p.supplier_id)
    b.openPoCount += 1
    const ccy = p.currency ?? "ILS"
    const val = toNum(p.total_amount_gross ?? p.total_amount)
    b.poValueByCcy.set(ccy, (b.poValueByCcy.get(ccy) ?? 0) + val)
    bumpDate(b, p.issued_at)
  }

  for (const inv of invs) {
    const b = get(inv.supplier_id)
    bumpDate(b, inv.invoice_date)
    if (
      (PAID_INVOICE_STATUSES as readonly string[]).includes(inv.status) ||
      inv.status === "CANCELLED"
    ) {
      continue
    }
    b.unpaidInvoiceCount += 1
    b.unpaidInvoiceValue += toNum(inv.total_amount)
  }

  for (const [sid, b] of bySup) {
    let dominantCcy: string | null = null
    let dominantValue = 0
    for (const [ccy, v] of b.poValueByCcy) {
      if (v > dominantValue) {
        dominantCcy = ccy
        dominantValue = v
      }
    }
    out.set(sid, {
      openPoCount: b.openPoCount,
      openPoValue: dominantCcy ? Math.round(dominantValue * 100) / 100 : null,
      openPoCurrency: dominantCcy,
      unpaidInvoiceCount: b.unpaidInvoiceCount,
      unpaidInvoiceValue: Math.round(b.unpaidInvoiceValue * 100) / 100,
      lastActivityAt: b.lastActivityAt,
    })
  }

  return out
}

export async function GET(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response

  const { supabase, activeCompanyId } = gate.ctx
  const q = sanitizeOptionalString(req.nextUrl.searchParams.get("q"))
  const kind = sanitizeOptionalString(req.nextUrl.searchParams.get("supplierKind"))
  const include = req.nextUrl.searchParams.get("include") ?? ""
  const includeAggregates = include.includes("aggregates")

  let query = supabase
    .from("erp_md_suppliers")
    .select(SUPPLIER_SELECT)
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

  const suppliers = ((data ?? []) as unknown as SupplierDbRow[]).map(mapSupplierRow)

  if (!includeAggregates) {
    return NextResponse.json({ data: suppliers })
  }

  const aggMap = await loadAggregates(
    supabase,
    activeCompanyId,
    suppliers.map((s) => s.id),
  )

  const enriched: ErpSupplierWithAggregates[] = suppliers.map((s) => ({
    ...s,
    aggregates: aggMap.get(s.id) ?? {
      openPoCount: 0,
      openPoValue: null,
      openPoCurrency: null,
      unpaidInvoiceCount: 0,
      unpaidInvoiceValue: 0,
      lastActivityAt: null,
    },
  }))

  return NextResponse.json({ data: enriched })
}

export async function POST(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response

  const { supabase, activeCompanyId } = gate.ctx
  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null

  // נורמליזציה: מקבלים גם `supplierNumber` (legacy) — מעבירים ל-`supplierNum`.
  if (raw && raw.supplierNumber != null && raw.supplierNum == null) {
    raw.supplierNum = raw.supplierNumber
  }
  // נורמליזציה: מקבלים גם `taxId` (legacy) — מעבירים ל-`taxVatId`.
  if (raw && raw.taxId != null && raw.taxVatId == null) {
    raw.taxVatId = raw.taxId
  }

  const parsed = supplierCreateSchema.safeParse(raw ?? {})
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

  const insertRow = toSupplierInsertRow(parsed.data, activeCompanyId)

  const { data, error } = await supabase
    .from("erp_md_suppliers")
    .insert(insertRow)
    .select(SUPPLIER_SELECT)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const row = data as unknown as SupplierDbRow

  // Priority parity #3: פתיחת חשבון AP אוטומטית בספר החשבונות.
  // קוד החשבון = מספר הספק (כמו Priority: "יפתח חשבון 200005 שיקושר לספק").
  let coaCreated: { id: string; code: string } | null = null
  try {
    const { data: coaRow } = await supabase
      .from("mo_chart_of_accounts")
      .insert({
        code: row.supplier_number,
        name: row.name,
        account_type: "liability",
        company_id: activeCompanyId,
      })
      .select("id,code")
      .single()

    if (coaRow) {
      coaCreated = { id: coaRow.id, code: coaRow.code }
      // קשר בין הספק לחשבון
      await supabase
        .from("erp_md_suppliers")
        .update({ coa_account_id: coaRow.id, coa_account_code: coaRow.code })
        .eq("id", row.id)
    }
  } catch {
    // לא בלוקר — הספק נוצר גם בלי חשבון CoA
  }

  return NextResponse.json(
    {
      data: mapSupplierRow(row),
      coaCreated,
    },
    { status: 201 },
  )
}
