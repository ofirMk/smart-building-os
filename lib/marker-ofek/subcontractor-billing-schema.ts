import { z } from "zod"

import {
  billingChangeOrderLineSchema,
  computeBillingDeductions,
} from "@/lib/marker-ofek/client-billing-schema"

/**
 * חשבונות קבלני משנה — Zod + סיכומים.
 *
 * @database-layer — `@@index([projectId, billingMonth])`, `@@index([subcontractorId, billingMonth])` — ראו `DATA_LAYER_INDEXING.md`.
 */

/**
 * מזהה קבלן משנה — תואם ל־`QA_DEFECT_MOCK_SUBCONTRACTORS` (Phase 3.2) לצורך בדיקת ליקויים פתוחים.
 */
export const SUBCONTRACTOR_BILLING_KOHEN_ID = "sc-kohen-elec" as const

export const subcontractorBillingLineSchema = z.object({
  taskDescription: z.string().min(1, "נא למלא תיאור עבודה"),
  claimedAmount: z.coerce.number().nonnegative("סכום נדרש לא תקין"),
  approvedAmount: z.coerce.number().nonnegative("סכום מאושר לא תקין"),
  notes: z.string().optional().default(""),
})

export type SubcontractorBillingLine = z.infer<typeof subcontractorBillingLineSchema>

export const subcontractorBillingFormSchema = z
  .object({
    projectId: z.string().min(1, "נא לבחור פרויקט"),
    subcontractorId: z.string().min(1, "נא לבחור קבלן משנה"),
    invoiceNumber: z
      .string()
      .min(1, "נא להזין מספר חשבון")
      .transform((s) => s.trim()),
    /** ‎yyyy-mm — ‎`input[type=month]` */
    billingMonth: z
      .string()
      .regex(/^\d{4}-\d{2}$/, "נא לבחור חודש חיוב"),
    /** עיכבון — אחוז (5 = 5%) */
    retentionPercent: z.coerce.number().nonnegative(),
    /** ביטוח — אחוז (0.65 = 0.65%) */
    insurancePercent: z.coerce.number().nonnegative(),
    /** התייקרויות — סכום קבוע */
    indexationAmount: z.coerce.number(),
    changeOrders: z.array(billingChangeOrderLineSchema),
    lines: z
      .array(subcontractorBillingLineSchema)
      .min(1, "נא להוסיף לפחות שורת חיוב אחת"),
  })
  .transform((data) => {
    // מעבר יחיד על שורות — O(L) במקום שני reduce
    let totalClaimedAmount = 0
    let totalApprovedAmount = 0
    for (const l of data.lines) {
      totalClaimedAmount += l.claimedAmount
      totalApprovedAmount += l.approvedAmount
    }
    const derived = computeBillingDeductions({
      baseApprovedAmount: totalApprovedAmount,
      retentionPercent: data.retentionPercent,
      insurancePercent: data.insurancePercent,
      indexationAmount: data.indexationAmount,
      changeOrders: data.changeOrders,
    })
    return {
      ...data,
      totalClaimedAmount,
      totalApprovedAmount,
      changeOrdersApprovedSum: derived.changeOrdersApprovedSum,
      retentionDeduction: derived.retentionDeduction,
      insuranceDeduction: derived.insuranceDeduction,
      finalAmountToPay: derived.finalAmountToPay,
    }
  })

export type SubcontractorBillingFormInput = z.input<typeof subcontractorBillingFormSchema>
export type SubcontractorBillingFormOutput = z.output<
  typeof subcontractorBillingFormSchema
>

export type SubcontractorBillingMockProject = {
  id: string
  label: string
}

export type SubcontractorBillingMockSubcontractor = {
  id: string
  name: string
}

export const SUBCONTRACTOR_BILLING_MOCK_PROJECTS: SubcontractorBillingMockProject[] = [
  { id: "prj-qa-tlv-01", label: "ת״א צפון — מתח גבוה · מגדל אנרגיה" },
  { id: "prj-qa-haifa-02", label: "נמל חיפה — תאורה ומיגון" },
  { id: "prj-qa-bs-03", label: "באר שבע — שדה סולארי 12MW" },
  { id: "prj-qa-jlm-04", label: "ירושלים — הרחבת רשת תאורה" },
]

/** קבלני משנה לדמה — מזהים תואמים ל־Phase 3.2 (ליקויים QA). */
export const SUBCONTRACTOR_BILLING_MOCK_SUBCONTRACTORS: SubcontractorBillingMockSubcontractor[] =
  [
    { id: "sc-kohen-elec", name: "כהן חשמל" },
    { id: "sc-aa-gypsum", name: "א.א עבודות גבס" },
    { id: "sc-electra-infra", name: "אלקטרה תשתיות" },
  ]

/**
 * דמה: ליקויים פתוחים ב־QA — רק **כהן חשמל** מסומן (חיבור ל־Phase 3.2).
 */
export function hasOpenDefects(subcontractorId: string): boolean {
  return subcontractorId === SUBCONTRACTOR_BILLING_KOHEN_ID
}

export type SubcontractorBillingDocumentStatus = "draft" | "final"

export function statusLabelHe(
  status: SubcontractorBillingDocumentStatus
): string {
  return status === "final" ? "סופי" : "טיוטה"
}

let mockSerialSeq = 0
export function generateMockFormalSerialNumber(): string {
  mockSerialSeq += 1
  return `MO-SC-2026-${String(mockSerialSeq).padStart(5, "0")}`
}

export function defaultSubcontractorBillingFormValues(): SubcontractorBillingFormInput {
  const month = new Date().toISOString().slice(0, 7)
  return {
    projectId: SUBCONTRACTOR_BILLING_MOCK_PROJECTS[0]?.id ?? "",
    /** ברירת מחדל: כהן חשמל — מפעיל אזהרת ליקויים פתוחים (דמה). */
    subcontractorId: SUBCONTRACTOR_BILLING_MOCK_SUBCONTRACTORS[0]?.id ?? "",
    invoiceNumber: "CHB-2026-041",
    billingMonth: month,
    retentionPercent: 5,
    insurancePercent: 0.65,
    indexationAmount: 0,
    changeOrders: [
      { description: "הוראת שינוי — חיזוק ארונות", approvedAmount: 12000 },
    ],
    lines: [
      {
        taskDescription: "סידור לוחות ראשיים — אגף א׳",
        claimedAmount: 45000,
        approvedAmount: 45000,
        notes: "",
      },
      {
        taskDescription: "משיכת כבלים — גומחה 2–4",
        claimedAmount: 28000,
        approvedAmount: 28000,
        notes: "",
      },
    ],
  }
}
