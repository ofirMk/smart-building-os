import { z } from "zod"

/**
 * הקמת פרויקט + הצעת מחיר (מכרז).
 *
 * @database-layer — `@@index([projectCode])`, `@@index([status])` — ראו `DATA_LAYER_INDEXING.md`.
 */

/** סוג חוזה — מסלול פאושלי מול כתב כמויות */
export const PROJECT_CONTRACT_TYPE_VALUES = ["פאושלי", "כתב כמויות"] as const
export type ProjectContractType = (typeof PROJECT_CONTRACT_TYPE_VALUES)[number]

/** סטטוס הקמה ב-ERP (מסך אחוד) */
export const PROJECT_SETUP_STATUS_VALUES = [
  "טיוטה",
  "בהקמה",
  "פעיל",
  "מושהה",
  "נסגר",
] as const
export type ProjectSetupStatus = (typeof PROJECT_SETUP_STATUS_VALUES)[number]

export const tenderQuoteLineSchema = z.object({
  section: z.string().trim().min(1, "נא למלא סעיף"),
  workDescription: z.string().trim().min(1, "נא למלא תיאור עבודה"),
  unit: z.string().trim().min(1, "נא למלא יחידת מידה"),
  quantity: z.coerce.number().nonnegative("כמות לא תקינה"),
  unitPrice: z.coerce.number().nonnegative("מחיר יחידה לא תקין"),
})

export type TenderQuoteLineInput = z.input<typeof tenderQuoteLineSchema>
export type TenderQuoteLineOutput = z.output<typeof tenderQuoteLineSchema>

export function lineQuoteAmount(line: TenderQuoteLineOutput): number {
  return line.quantity * line.unitPrice
}

export const projectSetupFormSchema = z
  .object({
    projectCode: z
      .string()
      .trim()
      .min(1, "נא למלא קוד פרויקט")
      .regex(/^PR\d+$/, "פורמט קוד: PR ומספרים (למשל PR16000010)"),
    projectName: z
      .string()
      .trim()
      .min(2, "נא למלא שם פרויקט")
      .max(240, "שם פרויקט ארוך מדי"),
    clientName: z
      .string()
      .trim()
      .min(1, "נא למלא שם לקוח")
      .max(240, "שם לקוח ארוך מדי"),
    projectManager: z
      .string()
      .trim()
      .min(1, "נא למלא אחראי פרויקט")
      .max(160, "שם ארוך מדי"),
    contractType: z.enum(PROJECT_CONTRACT_TYPE_VALUES),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "נא לבחור תאריך התחלה"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "נא לבחור תאריך סיום צפוי"),
    status: z.enum(PROJECT_SETUP_STATUS_VALUES),
    tenderLines: z.array(tenderQuoteLineSchema).min(1, "נא להוסיף לפחות שורת הצעה אחת"),
  })
  .superRefine((data, ctx) => {
    if (data.endDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "תאריך סיום חייב להיות אחרי או שווה לתאריך התחלה",
        path: ["endDate"],
      })
    }
  })
  .transform((data) => {
    // מעבר יחיד — O(N) על שורות הצעה
    const tenderLines: Array<TenderQuoteLineOutput & { lineTotal: number }> = []
    let totalQuoteAmount = 0
    for (const line of data.tenderLines) {
      const lineTotal = lineQuoteAmount(line)
      totalQuoteAmount += lineTotal
      tenderLines.push({ ...line, lineTotal })
    }
    return {
      ...data,
      tenderLines,
      totalQuoteAmount,
    }
  })

export type ProjectSetupFormInput = z.input<typeof projectSetupFormSchema>
export type ProjectSetupFormOutput = z.output<typeof projectSetupFormSchema>

function isoDateLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function defaultProjectSetupFormValues(): ProjectSetupFormInput {
  const today = new Date()
  const inOneYear = new Date(today)
  inOneYear.setFullYear(inOneYear.getFullYear() + 1)

  return {
    projectCode: "PR16000010",
    projectName: "",
    clientName: "",
    projectManager: "",
    contractType: "כתב כמויות",
    startDate: isoDateLocal(today),
    endDate: isoDateLocal(inOneYear),
    status: "טיוטה",
    tenderLines: [
      {
        section: "1.01",
        workDescription: "עבודות חשמל — לוחות ראשיים",
        unit: "יח״ד",
        quantity: 1,
        unitPrice: 0,
      },
      {
        section: "1.02",
        workDescription: "משיכות כבלים ותשתית",
        unit: "מ״ר",
        quantity: 100,
        unitPrice: 0,
      },
    ],
  }
}
