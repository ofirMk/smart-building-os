import { z } from "zod"

const uuid = z.string().uuid("נדרש מזהה תקין (UUID)")

/** תאריך YYYY-MM-DD */
export const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך חייב בפורמט YYYY-MM-DD")

/** תאריך אופציונלי — ריק, null, או YYYY-MM-DD (תואם קריאות ישנות עם ‎null‎) */
export const optionalIsoDateNullable = z.preprocess(
  (val) => (val == null ? "" : val),
  z
    .string()
    .regex(/^$|^\d{4}-\d{2}-\d{2}$/, "תאריך חייב בפורמט YYYY-MM-DD")
    .transform((s) => (s === "" ? null : s))
)

export const moneyStringSchema = z
  .string()
  .min(1, "חובה להזין סכום")
  .refine((s) => {
    const n = parseFloat(String(s).replace(",", ".").trim())
    return Number.isFinite(n)
  }, "סכום לא מספרי")
  .transform((s) => parseFloat(String(s).replace(",", ".").trim()))

export const erpContractCreateSchema = z
  .object({
    projectId: uuid,
    /** מזמין — entities.type = client */
    clientEntityId: uuid,
    startDate: isoDateString,
    contractType: z.enum(["main_contract", "sub_contract"]),
    pricingModel: z.enum(["boq", "paushal"]),
    contractNumber: z.string().nullable().optional(),
    contractDisplayName: z.string().nullable().optional(),
    retentionPct: z.number().min(0).max(100),
    insurancePct: z.number().min(0).max(100),
    testingPct: z.number().min(0).max(100),
    paushalTotalValue: z.number().positive().nullable().optional(),
    boqRows: z
      .array(
        z.object({
          sectionCode: z.string().min(1),
          description: z.string().min(1),
          unit: z.string(),
          quantity: z.number().nonnegative(),
          unitPrice: z.number().nonnegative(),
        })
      )
      .optional(),
    paushalRows: z
      .array(
        z.object({
          sectionCode: z.string().min(1),
          description: z.string().min(1),
          weightPct: z.number().nonnegative(),
        })
      )
      .optional(),
    /** קוד חשבון מהמפה — סיווג AI (אופציונלי) */
    glAccountCode: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.pricingModel === "paushal") {
      if (data.paushalTotalValue == null || data.paushalTotalValue <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "במודל פאושלי חובה סכום חוזה חיובי",
          path: ["paushalTotalValue"],
        })
      }
      const rows = data.paushalRows ?? []
      if (rows.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "חובה לפחות שורת אבן דרך פאושלית",
          path: ["paushalRows"],
        })
      }
    }
    if (data.pricingModel === "boq") {
      const rows = data.boqRows ?? []
      const valid = rows.filter((r) => r.sectionCode.trim() && r.description.trim())
      if (valid.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "חובה לפחות שורת BoQ עם סעיף ותיאור",
          path: ["boqRows"],
        })
      }
    }
  })

export type ErpContractCreateInput = z.infer<typeof erpContractCreateSchema>

export const poFromBoqServerSchema = z.object({
  projectId: uuid,
  tenderId: uuid,
  supplierEntityId: uuid,
  lines: z
    .array(
      z.object({
        tenderBoqItemId: z.string().min(1),
        description: z.string().min(1),
        unit: z.string().nullable().optional(),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative(),
        catalogItemId: uuid,
      })
    )
    .min(1, "חובה לפחות שורת הזמנה אחת"),
})

export type PoFromBoqServerInput = z.infer<typeof poFromBoqServerSchema>

export const quickProjectSchema = z.object({
  name: z.string().min(2, "שם פרויקט חובה"),
  internalProjectCode: z.string().optional(),
  clientEntityId: uuid,
  /** אם חסר — נקבע לפי המשתמש המחובר בפעולת השרת */
  managingPartnerUserId: z.string().uuid().optional(),
})

/** טופס הקמת פרויקט פשוט (מסלול ‎/marker-ofek/projects/new‎) */
export const markerProjectIntakeFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "שם פרויקט נדרש (לפחות 2 תווים)")
    .max(240, "שם פרויקט ארוך מדי"),
  client_name: z
    .string()
    .trim()
    .max(240, "שם לקוח ארוך מדי")
    .optional()
    .transform((s) => s ?? ""),
  tender_id: z.union([z.string().uuid("מזהה מכרז לא תקין"), z.null()]).optional(),
  /** קוד פנימי ‎PR…‎ — Phase 8.3 ‎Unified Project Setup */
  internal_project_code: z
    .string()
    .trim()
    .max(64, "קוד פרויקט ארוך מדי")
    .optional()
    .transform((s) => s ?? ""),
})

export type MarkerProjectIntakeFormInput = z.infer<
  typeof markerProjectIntakeFormSchema
>

/** אשף יצירת חוזה מזמין (ישות לקוח ב־/entities/new) — נשמר כטיוטת ERP מינימלית */
export const clientContractWizardSchema = z.object({
  projectId: uuid,
  clientEntityId: uuid,
  contractKind: z.enum(["lump-sum", "measurement"]),
  contractDisplayName: z
    .string()
    .trim()
    .max(280)
    .optional()
    .nullable()
    .transform((s) => (s && s.length > 0 ? s : null)),
  retentionPct: z.preprocess(
    (v) => {
      if (v === "" || v == null || v === undefined) return 0
      const n =
        typeof v === "number" ? v : Number(String(v).replace(",", ".").trim())
      return Number.isFinite(n) ? n : 0
    },
    z.number().min(0, "עיכבון לא יכול להיות שלילי").max(100, "עיכבון עד 100%")
  ),
})

export type ClientContractWizardInput = z.infer<
  typeof clientContractWizardSchema
>

/**
 * ממזג קלט ישן (camelCase) לשמות עמודות ב־`public.entities` (snake_case).
 * השדות הסופיים ב־`quickEntitySchema` תואמים למסד.
 */
export function normalizeQuickEntityInput(raw: unknown): unknown {
  if (raw == null || typeof raw !== "object") return raw
  const o = { ...(raw as Record<string, unknown>) }
  const firstStr = (
    ...vals: (string | null | undefined)[]
  ): string | undefined => {
    for (const v of vals) {
      if (v == null) continue
      const t = String(v).trim()
      if (t !== "") return t
    }
    return undefined
  }
  o.legal_id = firstStr(
    o.legal_id as string | undefined,
    o.legalId as string | undefined
  )
  o.tax_id = firstStr(o.tax_id as string | undefined, o.taxId as string | undefined)
  o.erp_supplier_number = firstStr(
    o.erp_supplier_number as string | undefined,
    o.erpSupplierNumber as string | undefined
  )
  o.erp_customer_number = firstStr(
    o.erp_customer_number as string | undefined,
    o.erpCustomerNumber as string | undefined
  )
  o.payment_term_code = firstStr(
    o.payment_term_code as string | undefined,
    o.paymentTermCode as string | undefined
  )
  o.gl_account_code = firstStr(
    o.gl_account_code as string | undefined,
    o.glAccountCode as string | undefined
  )
  if (o.withholding_tax_pct == null && o.withholdingTaxPct != null) {
    o.withholding_tax_pct = o.withholdingTaxPct
  }
  if (
    o.default_withholding_tax_percent == null &&
    o.defaultWithholdingPercent != null
  ) {
    o.default_withholding_tax_percent = o.defaultWithholdingPercent
  }
  const wDate = firstStr(
    o.withholding_tax_expiry as string | undefined,
    o.withholdingTaxExpiresAt as string | undefined,
    o.withholdingTaxExpiry as string | undefined
  )
  if (wDate != null) o.withholding_tax_expiry = wDate
  const bDate = firstStr(
    o.bookkeeping_cert_expiry as string | undefined,
    o.bookkeepingCertExpiresAt as string | undefined,
    o.bookkeepingAuthExpiry as string | undefined
  )
  if (bDate != null) o.bookkeeping_cert_expiry = bDate
  return o
}

/**
 * שדות פיננסיים/ERP לטופס ישות — שמות זהים לעמודות `public.entities`
 * (עמודות הליבה: `ENTITY_ERP_FINANCIAL_COLUMN_KEYS` ב־`types/holden-finance.ts`).
 */
export const quickEntityFinancialFieldsSchema = z.object({
  tax_id: z.string().max(64).optional().nullable(),
  erp_supplier_number: z.string().max(64).optional().nullable(),
  erp_customer_number: z.string().max(64).optional().nullable(),
  payment_term_code: z.string().max(16).optional().nullable(),
  withholding_tax_pct: z.number().min(0).max(100).optional().nullable(),
  gl_account_code: z.string().max(32).optional().nullable(),
  withholding_tax_expiry: optionalIsoDateNullable.optional(),
  bookkeeping_cert_expiry: optionalIsoDateNullable.optional(),
  default_withholding_tax_percent: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .nullable(),
})

/** קלט יצירת ישות מהירה — שמות שדות כמו בעמודות `public.entities` (אחרי נרמול). */
export const quickEntitySchema = z.preprocess(
  normalizeQuickEntityInput,
  z
    .object({
      name: z.string().min(2, "שם חובה"),
      type: z.enum(["client", "supplier", "subcontractor"]),
      legal_id: z.string().optional(),
      address: z.string().optional(),
      email: z.union([z.literal(""), z.string().email("אימייל לא תקין")]).optional(),
      phone: z.string().max(64).optional().nullable(),
    })
    .merge(quickEntityFinancialFieldsSchema)
    .superRefine((data, ctx) => {
      const supplierLike =
        data.type === "supplier" || data.type === "subcontractor"
      if (supplierLike) {
        const lid = data.legal_id?.trim() ?? ""
        if (!lid) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "ח.פ / ע.מ חובה לספק לפני שמירה",
            path: ["legal_id"],
          })
          return
        }
        if (!/^\d{8,10}$/.test(lid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "ח.פ / ע.מ — 8 עד 10 ספרות בלבד",
            path: ["legal_id"],
          })
        }
      }
      if (data.type === "client" && data.legal_id?.trim()) {
        const lid = data.legal_id.trim()
        if (!/^\d{8,10}$/.test(lid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "ח.פ / ע.מ — 8 עד 10 ספרות בלבד",
            path: ["legal_id"],
          })
        }
      }
    })
)

export type QuickEntityInput = z.infer<typeof quickEntitySchema>

export const quickCatalogItemSchema = z.object({
  sku: z.string().min(1, "מק״ט חובה"),
  description: z.string().min(1, "תיאור חובה"),
  category: z.string().min(1, "קטגוריה חובה"),
  unit: z.string().optional(),
  defaultPrice: z.number().nonnegative().optional().nullable(),
})

export const quickTenderLinkSchema = z.object({
  projectId: uuid,
  title: z.string().min(2, "שם/כותרת מכרז חובה"),
})

/** פרופיל חברה — MDM (ח.פ, מע״מ, בנק) */
export const companyMdmFormSchema = z.object({
  legalId: z.string().min(1, "ח.פ / ע.מ חובה"),
  vatRegistrationNumber: z.string().min(1, "מספר עוסק / מע״מ חובה"),
  bankName: z.string().min(1, "שם בנק חובה"),
  bankBranch: z.string().min(1, "סניף חובה"),
  bankAccountNumber: z.string().min(1, "מספר חשבון חובה"),
})

/** ייבוא המוני — כרטסת ראשית (Holden `gl_accounts`) */
export const glAccountImportSchema = z.object({
  account_code: z.string().min(1, "קוד חשבון חובה"),
  account_name_he: z.string().min(1, "שם חשבון (עברית) חובה"),
  account_name_en: z.string().optional().default(""),
  trial_balance_group: z.string().min(1, "קבוצת מאזן בוחן חובה"),
  financial_statement_category: z.string().min(1, "קטגוריית דוח כספי חובה"),
  is_active: z.boolean().default(true),
})

export type GlAccountImportInput = z.infer<typeof glAccountImportSchema>
