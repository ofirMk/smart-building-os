import { z } from "zod"

export const BP_ENTITY_TYPES = ["client", "supplier", "subcontractor"] as const
export type BpEntityType = (typeof BP_ENTITY_TYPES)[number]

/** תנאי תשלום — ערכים יציבים לטופס; אינטגרציה ל-ERP בשלבים הבאים */
export const BP_PAYMENT_TERM_OPTIONS: { value: string; label: string }[] = [
  { value: "net_0", label: "מזומן" },
  { value: "net_30", label: "שוטף+30" },
  { value: "net_45", label: "שוטף+45" },
  { value: "net_60", label: "שוטף+60" },
  { value: "net_90", label: "שוטף+90" },
  { value: "eom_30", label: "סוף חודש + 30" },
  { value: "custom", label: "מוסכם (פרטי)" },
]

const contactRowSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "שם איש קשר חובה")
    .max(120, "שם ארוך מדי"),
  phone: z
    .string()
    .trim()
    .min(1, "טלפון חובה")
    .max(20, "מספר ארוך מדי")
    .refine(
      (s) => s.replace(/\D/g, "").length >= 9,
      "מספר טלפון — לפחות 9 ספרות"
    ),
})

/** מסיר תווים שאינם ספרות; לא חותך — אימות אורך נפרד */
export function stripNonDigits(raw: string): string {
  return raw.replace(/\D/g, "")
}

/**
 * Phase 1.1 — Business Partner (Zod)
 * חובה: שם ישות, סוג, ח.פ/ע.מ (בדיוק 9 ספרות לאחר הסרת לא-ספרות), תנאי תשלום, לפחות איש קשר אחד (שם+טלפון).
 */
export const businessPartnerEntrySchema = z.object({
  entityName: z
    .string()
    .trim()
    .min(2, "שם הישות חובה (לפחות 2 תווים)")
    .max(200, "שם ארוך מדי"),
  entityType: z.enum(["client", "supplier", "subcontractor"]),
  taxId: z
    .string()
    .min(1, "ח.פ / ע.מ. חובה")
    .transform(stripNonDigits)
    .refine((digits) => digits.length === 9, {
      message: "ח.פ / ע.מ. — בדיוק 9 ספרות (לאחר הסרת תווים שאינם ספרות)",
    }),
  address: z.string().max(500, "כתובת ארוכה מדי").optional().default(""),
  bankName: z.string().max(120).optional().default(""),
  bankBranch: z.string().max(40).optional().default(""),
  bankAccount: z.string().max(30).optional().default(""),
  paymentTermsCode: z
    .string()
    .min(1, "תנאי תשלום חובה")
    .refine(
      (v) => BP_PAYMENT_TERM_OPTIONS.some((o) => o.value === v),
      "תנאי תשלום לא חוקי"
    ),
  contacts: z
    .array(contactRowSchema)
    .min(1, "נדרש לפחות איש קשר אחד (שם וטלפון)"),
})

export type BusinessPartnerEntryInput = z.input<typeof businessPartnerEntrySchema>
export type BusinessPartnerEntryOutput = z.output<typeof businessPartnerEntrySchema>

export function defaultBusinessPartnerEntryValues(
  initialKind?: BpEntityType | null
): BusinessPartnerEntryInput {
  return {
    entityName: "",
    entityType: initialKind ?? "supplier",
    taxId: "",
    address: "",
    bankName: "",
    bankBranch: "",
    bankAccount: "",
    paymentTermsCode: "",
    contacts: [{ name: "", phone: "" }],
  }
}

const ENTITY_TYPE_LABEL: Record<BpEntityType, string> = {
  client: "לקוח (מזמין)",
  supplier: "ספק",
  subcontractor: "קבלן משנה",
}

export function labelForEntityType(t: BpEntityType): string {
  return ENTITY_TYPE_LABEL[t]
}
