import { z } from "zod"

export const BP_ENTITY_TYPES = ["client", "supplier", "subcontractor"] as const
export type BpEntityType = (typeof BP_ENTITY_TYPES)[number]

/** תנאי תשלום — ערכים יציבים לטופס; אינטגרציה ל-ERP בשלבים הבאים */
export const BP_PAYMENT_TERM_OPTIONS: { value: string; label: string }[] = [
  { value: "net_0", label: "מזומן מיידי" },
  { value: "net_30", label: "שוטף + 30" },
  { value: "net_45", label: "שוטף + 45" },
  { value: "net_60", label: "שוטף + 60" },
  { value: "net_90", label: "שוטף + 90" },
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
    .min(9, "מספר טלפון לא תקין")
    .max(20, "מספר ארוך מדי"),
})

function normalizeTaxDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 9)
}

export const businessPartnerEntrySchema = z.object({
  entityName: z
    .string()
    .trim()
    .min(2, "שם ישות חובה (לפחות 2 תווים)")
    .max(200, "שם ארוך מדי"),
  entityType: z.enum(["client", "supplier", "subcontractor"]),
  taxId: z
    .string()
    .min(1, "ח.פ / ע.מ. חובה")
    .transform(normalizeTaxDigits)
    .refine((d) => d.length === 9, {
      message: "ח.פ / ע.מ. — בדיוק 9 ספרות",
    }),
  address: z.string().max(500, "כתובת ארוכה מדי").default(""),
  bankName: z.string().max(120).default(""),
  bankBranch: z.string().max(40).default(""),
  bankAccount: z.string().max(30).default(""),
  paymentTermsCode: z
    .string()
    .min(1, "נא לבחור תנאי תשלום")
    .refine(
      (v) => BP_PAYMENT_TERM_OPTIONS.some((o) => o.value === v),
      "תנאי תשלום לא חוקי"
    ),
  contacts: z
    .array(contactRowSchema)
    .min(1, "נדרש לפחות איש קשר אחד"),
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
