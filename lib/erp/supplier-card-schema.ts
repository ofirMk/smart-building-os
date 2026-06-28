/**
 * Supplier Card — Zod schemas for create/update.
 *
 * Phase A of `docs/architecture/supplier-card-spec.md`.
 *
 * Notes:
 *   • Zod v4 — use `message`, not `invalid_type_error`.
 *   • שדות `tax_id` / `vat_code` הם NOT NULL ב-DB אך SOP מאפשר השלמה
 *     מאוחרת — ה-API ממלא ערכי ברירת מחדל אם הקלט ריק (ראה
 *     `applySupplierDefaults`).
 *   • String fields go through `trimNullable` to coerce empty strings → null.
 */

import { z } from "zod"

const trimNullable = (raw: unknown): string | null => {
  if (raw == null) return null
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  return trimmed.length === 0 ? null : trimmed
}

const trimRequired = (raw: unknown): string | null => {
  const v = trimNullable(raw)
  return v
}

/** ערכי ברירת מחדל ל-NOT NULL columns שאינם בטופס. */
export const SUPPLIER_DB_DEFAULTS = {
  tax_id: "—",
  vat_code: "STANDARD",
  payment_terms: "NET_30",
} as const

/** סטטוסים מותרים — בסינכרון עם constraint `erp_md_suppliers_status_chk`. */
export const SUPPLIER_STATUSES = ["ACTIVE", "INACTIVE", "BLOCKED", "PENDING"] as const
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number]

export const SUPPLIER_KINDS = ["supplier", "subcontractor"] as const
export type SupplierKind = (typeof SUPPLIER_KINDS)[number]

const optionalString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform(trimNullable)

const requiredString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform(trimRequired)
  .refine((v): v is string => v !== null && v.length > 0, {
    message: "שדה חובה",
  })

const optionalInt = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v): number | null => {
    if (v == null || v === "") return null
    const n = typeof v === "string" ? Number(v) : v
    return Number.isFinite(n) ? Math.trunc(n) : null
  })

const optionalUuid = z
  .union([z.string(), z.null(), z.undefined()])
  .transform(trimNullable)
  .refine(
    (v) =>
      v === null ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
    { message: "uuid לא תקין" },
  )

/** סכמה מלאה ליצירה. */
export const supplierCreateSchema = z.object({
  // ── Identification ───────────────────────────────────────────────
  supplierNum: requiredString,
  name: requiredString,
  foreignName: optionalString,
  supplierKind: z
    .union([z.literal("supplier"), z.literal("subcontractor"), z.undefined(), z.null()])
    .transform((v): SupplierKind => (v === "subcontractor" ? "subcontractor" : "supplier")),
  status: z
    .union([z.enum(SUPPLIER_STATUSES), z.null(), z.undefined()])
    .transform((v): SupplierStatus => (v ?? "ACTIVE") as SupplierStatus),
  linkedCustomerId: optionalUuid,

  // ── Address & contact ────────────────────────────────────────────
  address: optionalString,
  addressLine2: optionalString,
  addressLine3: optionalString,
  city: optionalString,
  countryCode: optionalString,
  zipCode: z.string().trim().max(20).nullable().optional().transform((v) => v ?? null),
  phone: optionalString,
  fax: optionalString,
  email: optionalString,
  website: optionalString,

  // ── Flags ───────────────────────────────────────────────────
  forAttention: z.coerce.boolean().optional().default(false),
  openingDate: z.string().nullable().optional().transform((v) => v ?? null),

  // ── Extra (לשונית "פרטים נוספים") ───────────────────────────────
  branchCode: optionalString,
  industry: optionalString,
  foundingYear: optionalInt.refine(
    (v) => v === null || (v >= 1800 && v <= new Date().getFullYear() + 1),
    { message: "שנה לא תקינה" },
  ),
  employeeCount: optionalInt.refine((v) => v === null || v >= 0, {
    message: "ערך חייב להיות אי-שלילי",
  }),
  printsInEnglish: z.coerce.boolean().optional().default(false),
  isConfidential: z.coerce.boolean().optional().default(false),
  isCasual: z.coerce.boolean().optional().default(false),
  allowNameOverride: z.coerce.boolean().optional().default(false),

  // ── Priority פרטים נוספים (v2 — צילום #2) ─────────────────────
  responsiblePerson: optionalString,
  isForeignSupplier: z.coerce.boolean().optional().default(false),
  authorizationLevel: z.union([z.number().int().min(0).max(9), z.null(), z.undefined()]).optional().transform((v) => v ?? null),
  defaultOrderType: optionalString,
  subcontractorWh: optionalString,
  consignmentWh: optionalString,
  supplierTypeCode: optionalString,

  // ── Priority צילום #4 ────────────────────────────────────
  hasAttachments: z.coerce.boolean().optional().default(false),
  marketgeysDisplay: z.union([z.number().int().min(0), z.null(), z.undefined()]).optional().transform((v) => v ?? 0),
  entryNote: optionalString,

  // ── הגדרות כספיים לספקים (Priority financial settings) ────────────
  vatFileNumber: optionalString,
  paysByBankTransfer: z.coerce.boolean().optional().default(false),
  roundInvoicePrice: z.coerce.boolean().optional().default(false),
  payToOrderOf: optionalString,
  ledgerAccountCode: optionalString,
  purchasesAccountCode: optionalString,
  costCenterCode: optionalString,
  invoiceTxnType: optionalString,
  creditTxnType: optionalString,

  // ── פרטים כלליים וניכוי מס במקור ────────────────────
  vatCode: optionalString,
  isInternalSupplier: z.coerce.boolean().optional().default(false),
  generalDiscountPct: z.union([z.number(), z.null(), z.undefined()]).optional().transform((v) => v ?? null),
  incomeTaxFileNumber: optionalString,
  incomeTaxFileType: z.union([z.number().int().min(1).max(9), z.null(), z.undefined()]).optional().transform((v) => v ?? null),
  withholdingPct: z.union([z.number(), z.null(), z.undefined()]).optional().transform((v) => v ?? null),
  withholdingValidUntil: z.string().nullable().optional().transform((v) => v ?? null),
  maxWithholdingPct: z.union([z.number(), z.null(), z.undefined()]).optional().transform((v) => v ?? null),
  bookkeeepingCertValidUntil: z.string().nullable().optional().transform((v) => v ?? null),
  withholdingDiscount: z.union([z.number(), z.null(), z.undefined()]).optional().transform((v) => v ?? null),
  withholdingDiscountUntil: z.string().nullable().optional().transform((v) => v ?? null),
  withholdsFromSupplier: z.coerce.boolean().optional().default(false),
  incomeTaxClassification: optionalString,
  taxOfficerCode: optionalString,
  isRequiredToFile: z.coerce.boolean().optional().default(false),
  withholdingFromDate: z.string().nullable().optional().transform((v) => v ?? null),
  withholdingToDate: z.string().nullable().optional().transform((v) => v ?? null),
  maxWithholdingCode: optionalString,
  withholdingToleranceShekel: z.coerce.boolean().optional().default(false),
  withholdingFileCode: optionalString,
  withholdingCode2: optionalString,
  withholdingCode3: optionalString,

  paymentTerms: optionalString,
  currencyCode: optionalString,
  taxVatId: optionalString,
})

export type SupplierCreatePayload = z.infer<typeof supplierCreateSchema>

/** עדכון = כל שדה אופציונלי. */
export const supplierUpdateSchema = supplierCreateSchema.partial()
export type SupplierUpdatePayload = z.infer<typeof supplierUpdateSchema>

/**
 * המרה מ-payload ל-row של DB.
 * ממלא NOT NULLs אם חסרים (תואם SOP — "אפשר להשלים מאוחר יותר").
 */
export function toSupplierInsertRow(
  payload: SupplierCreatePayload,
  companyId: string,
): Record<string, unknown> {
  return {
    company_id: companyId,
    supplier_number: payload.supplierNum,
    name: payload.name,
    foreign_name: payload.foreignName,
    supplier_kind: payload.supplierKind,
    status: payload.status,
    linked_customer_id: payload.linkedCustomerId,
    address: payload.address,
    address_line2: payload.addressLine2,
    address_line3: payload.addressLine3,
    city: payload.city,
    country_code: payload.countryCode,
    zip_code: payload.zipCode,
    phone: payload.phone,
    fax: payload.fax,
    email: payload.email,
    website: payload.website,
    for_attention: payload.forAttention ?? false,
    opening_date: payload.openingDate,
    branch_code: payload.branchCode,
    industry: payload.industry,
    founding_year: payload.foundingYear,
    employee_count: payload.employeeCount,
    prints_in_english: payload.printsInEnglish,
    is_confidential: payload.isConfidential,
    is_casual: payload.isCasual,
    allow_name_override: payload.allowNameOverride,
    responsible_person: payload.responsiblePerson,
    is_foreign_supplier: payload.isForeignSupplier ?? false,
    authorization_level: payload.authorizationLevel,
    default_order_type: payload.defaultOrderType,
    subcontractor_wh: payload.subcontractorWh,
    consignment_wh: payload.consignmentWh,
    supplier_type_code: payload.supplierTypeCode,
    has_attachments: payload.hasAttachments ?? false,
    marketgeys_display: payload.marketgeysDisplay ?? 0,
    entry_note: payload.entryNote ?? null,
    vat_file_number: payload.vatFileNumber ?? null,
    pays_by_bank_transfer: payload.paysByBankTransfer ?? false,
    round_invoice_price: payload.roundInvoicePrice ?? false,
    pay_to_order_of: payload.payToOrderOf ?? null,
    ledger_account_code: payload.ledgerAccountCode ?? null,
    purchases_account_code: payload.purchasesAccountCode ?? null,
    cost_center_code: payload.costCenterCode ?? null,
    invoice_txn_type: payload.invoiceTxnType ?? null,
    credit_txn_type: payload.creditTxnType ?? null,
    vat_code: payload.vatCode ?? SUPPLIER_DB_DEFAULTS.vat_code,
    is_internal_supplier: payload.isInternalSupplier ?? false,
    general_discount_pct: payload.generalDiscountPct ?? null,
    income_tax_file_number: payload.incomeTaxFileNumber ?? null,
    income_tax_file_type: payload.incomeTaxFileType ?? null,
    withholding_pct: payload.withholdingPct ?? null,
    withholding_valid_until: payload.withholdingValidUntil ?? null,
    max_withholding_pct: payload.maxWithholdingPct ?? null,
    bookkeeping_cert_valid_until: payload.bookkeeepingCertValidUntil ?? null,
    withholding_discount: payload.withholdingDiscount ?? null,
    withholding_discount_until: payload.withholdingDiscountUntil ?? null,
    withholds_from_supplier: payload.withholdsFromSupplier ?? false,
    income_tax_classification: payload.incomeTaxClassification ?? null,
    tax_officer_code: payload.taxOfficerCode ?? null,
    is_required_to_file: payload.isRequiredToFile ?? false,
    withholding_from_date: payload.withholdingFromDate ?? null,
    withholding_to_date: payload.withholdingToDate ?? null,
    max_withholding_code: payload.maxWithholdingCode ?? null,
    withholding_tolerance_shekel: payload.withholdingToleranceShekel ?? false,
    withholding_file_code: payload.withholdingFileCode ?? null,
    withholding_code_2: payload.withholdingCode2 ?? null,
    withholding_code_3: payload.withholdingCode3 ?? null,
    payment_terms: payload.paymentTerms ?? SUPPLIER_DB_DEFAULTS.payment_terms,
    currency_code: payload.currencyCode,
    tax_vat_id: payload.taxVatId,
    tax_id: SUPPLIER_DB_DEFAULTS.tax_id,
  }
}

/**
 * מיפוי payload לעדכון — כולל שדות בלבד שהמשתמש שלח (`undefined`
 * נשמט). אינו מכריח ערכי ברירת מחדל (אלה רלוונטיים רק ליצירה).
 */
export function toSupplierUpdateRow(
  payload: SupplierUpdatePayload,
): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  const map: Record<string, string> = {
    supplierNum: "supplier_number",
    name: "name",
    foreignName: "foreign_name",
    supplierKind: "supplier_kind",
    status: "status",
    linkedCustomerId: "linked_customer_id",
    address: "address",
    addressLine2: "address_line2",
    addressLine3: "address_line3",
    city: "city",
    countryCode: "country_code",
    zipCode: "zip_code",
    phone: "phone",
    fax: "fax",
    email: "email",
    website: "website",
    forAttention: "for_attention",
    openingDate: "opening_date",
    branchCode: "branch_code",
    industry: "industry",
    foundingYear: "founding_year",
    employeeCount: "employee_count",
    printsInEnglish: "prints_in_english",
    isConfidential: "is_confidential",
    isCasual: "is_casual",
    allowNameOverride: "allow_name_override",
    responsiblePerson: "responsible_person",
    isForeignSupplier: "is_foreign_supplier",
    authorizationLevel: "authorization_level",
    defaultOrderType: "default_order_type",
    subcontractorWh: "subcontractor_wh",
    consignmentWh: "consignment_wh",
    supplierTypeCode: "supplier_type_code",
    hasAttachments: "has_attachments",
    marketgeysDisplay: "marketgeys_display",
    entryNote: "entry_note",
    vatFileNumber: "vat_file_number",
    paysByBankTransfer: "pays_by_bank_transfer",
    roundInvoicePrice: "round_invoice_price",
    payToOrderOf: "pay_to_order_of",
    ledgerAccountCode: "ledger_account_code",
    purchasesAccountCode: "purchases_account_code",
    costCenterCode: "cost_center_code",
    invoiceTxnType: "invoice_txn_type",
    creditTxnType: "credit_txn_type",
    vatCode: "vat_code",
    isInternalSupplier: "is_internal_supplier",
    generalDiscountPct: "general_discount_pct",
    incomeTaxFileNumber: "income_tax_file_number",
    incomeTaxFileType: "income_tax_file_type",
    withholdingPct: "withholding_pct",
    withholdingValidUntil: "withholding_valid_until",
    maxWithholdingPct: "max_withholding_pct",
    bookkeeepingCertValidUntil: "bookkeeping_cert_valid_until",
    withholdingDiscount: "withholding_discount",
    withholdingDiscountUntil: "withholding_discount_until",
    withholdsFromSupplier: "withholds_from_supplier",
    incomeTaxClassification: "income_tax_classification",
    taxOfficerCode: "tax_officer_code",
    isRequiredToFile: "is_required_to_file",
    withholdingFromDate: "withholding_from_date",
    withholdingToDate: "withholding_to_date",
    maxWithholdingCode: "max_withholding_code",
    withholdingToleranceShekel: "withholding_tolerance_shekel",
    withholdingFileCode: "withholding_file_code",
    withholdingCode2: "withholding_code_2",
    withholdingCode3: "withholding_code_3",
    paymentTerms: "payment_terms",
    currencyCode: "currency_code",
    taxVatId: "tax_vat_id",
  }
  for (const [k, dbCol] of Object.entries(map)) {
    if (k in payload && (payload as Record<string, unknown>)[k] !== undefined) {
      row[dbCol] = (payload as Record<string, unknown>)[k]
    }
  }
  return row
}
