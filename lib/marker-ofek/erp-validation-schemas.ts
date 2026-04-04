import { z } from "zod"

const uuid = z.string().uuid("נדרש מזהה תקין (UUID)")

/** תאריך YYYY-MM-DD */
export const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך חייב בפורמט YYYY-MM-DD")

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

export const quickEntitySchema = z
  .object({
    name: z.string().min(2, "שם חובה"),
    type: z.enum(["client", "supplier", "subcontractor"]),
    legalId: z.string().optional(),
    address: z.string().optional(),
    withholdingTaxExpiry: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    bookkeepingAuthExpiry: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    defaultWithholdingPercent: z.number().min(0).max(100).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "supplier") {
      const lid = data.legalId?.trim() ?? ""
      if (!lid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ח.פ / ע.מ חובה לספק לפני שמירה",
          path: ["legalId"],
        })
      }
    }
  })

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
