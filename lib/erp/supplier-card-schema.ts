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
  phone: optionalString,
  email: optionalString,

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

  // ── Finance basics ───────────────────────────────────────────────
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
    phone: payload.phone,
    email: payload.email,
    branch_code: payload.branchCode,
    industry: payload.industry,
    founding_year: payload.foundingYear,
    employee_count: payload.employeeCount,
    prints_in_english: payload.printsInEnglish,
    is_confidential: payload.isConfidential,
    is_casual: payload.isCasual,
    allow_name_override: payload.allowNameOverride,
    payment_terms: payload.paymentTerms ?? SUPPLIER_DB_DEFAULTS.payment_terms,
    currency_code: payload.currencyCode,
    tax_vat_id: payload.taxVatId,
    tax_id: SUPPLIER_DB_DEFAULTS.tax_id,
    vat_code: SUPPLIER_DB_DEFAULTS.vat_code,
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
    phone: "phone",
    email: "email",
    branchCode: "branch_code",
    industry: "industry",
    foundingYear: "founding_year",
    employeeCount: "employee_count",
    printsInEnglish: "prints_in_english",
    isConfidential: "is_confidential",
    isCasual: "is_casual",
    allowNameOverride: "allow_name_override",
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
