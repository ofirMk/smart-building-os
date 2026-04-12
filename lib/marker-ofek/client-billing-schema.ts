import { z } from "zod"

/**
 * חשבון יזם מצטבר — Zod + חישובי ניכוי.
 *
 * **אבטחה:** כל שמירה דרך Server Action חייבת להריץ `safeParse`/`parse` מחדש; לקוח לא יכול להוות גבול אמון ל-RBAC או סכומים.
 *
 * @database-layer — אינדקסים מוצעים: `@@index([projectId, billingMonth])`, `@@unique([formalSerial])` (כשלא ריק);
 * פירוט: `DATA_LAYER_INDEXING.md`.
 */

/** הוראות שינוי — משותף לחשבונות יזם וקבלני משנה (Phase 8.1) */
export const billingChangeOrderLineSchema = z.object({
  description: z.string(),
  approvedAmount: z.coerce.number().nonnegative("סכום מאושר לא תקין"),
})

export type BillingChangeOrderLine = z.infer<typeof billingChangeOrderLineSchema>

export type ClientBillingDocumentStatus = "draft" | "final"

export function clientBillingStatusLabelHe(
  status: ClientBillingDocumentStatus
): string {
  return status === "final" ? "סופי" : "טיוטה"
}

let mockClientFormalSerialSeq = 80000011
/** דמה: מספר רשמי לחשבון יזם — לדוגמה MB80000012 */
export function generateMockClientFormalSerialNumber(): string {
  mockClientFormalSerialSeq += 1
  return `MB${mockClientFormalSerialSeq}`
}

/**
 * ניכויים והצמדות — אחיד ל־ERP (אחוזים כערך תצוגה: 5 = 5%, 0.65 = 0.65%).
 * סיבוכיות **O(C)** כאשר C = מספר שורות `changeOrders` (מעבר יחיד, ללא לולאות מקוננות).
 */
export function computeBillingDeductions(args: {
  baseApprovedAmount: number
  retentionPercent: number
  insurancePercent: number
  indexationAmount: number
  changeOrders: { approvedAmount: number }[]
}): {
  changeOrdersApprovedSum: number
  retentionDeduction: number
  insuranceDeduction: number
  finalAmountToPay: number
} {
  const changeOrdersApprovedSum = roundMoney(
    args.changeOrders.reduce((s, c) => s + roundMoney(c.approvedAmount), 0)
  )
  const retentionDeduction = roundMoney(
    args.baseApprovedAmount * (args.retentionPercent / 100)
  )
  const insuranceDeduction = roundMoney(
    args.baseApprovedAmount * (args.insurancePercent / 100)
  )
  const finalAmountToPay = roundMoney(
    args.baseApprovedAmount +
      args.indexationAmount +
      changeOrdersApprovedSum -
      retentionDeduction -
      insuranceDeduction
  )
  return {
    changeOrdersApprovedSum,
    retentionDeduction,
    insuranceDeduction,
    finalAmountToPay,
  }
}

export const clientBillingLineSchema = z.object({
  itemDescription: z.string().min(1, "נא למלא תיאור סעיף"),
  contractQty: z.coerce.number().nonnegative("כמות חוזית לא תקינה"),
  unitPrice: z.coerce.number().nonnegative("מחיר יחידה לא תקין"),
  previousCumulativeQty: z.coerce.number().nonnegative("כמות מצטברת קודמת לא תקינה"),
  /** כמות לחיוב בתקופה הנוכחית — קלט פעיל */
  currentPeriodQty: z.coerce.number().nonnegative("כמות לחיוב לא תקינה"),
})

export type ClientBillingLine = z.infer<typeof clientBillingLineSchema>

/**
 * חשבון יזם מצטבר — Phase 8.4: בסיס BOQ (תקופה) + הוראות שינוי + התייקרויות − עיכבון − ביטוח
 * (מזהה ל־`computeBillingDeductions` עם `baseApprovedAmount` = סה״כ שורות התקופה).
 */
export const clientBillingFormSchema = z
  .object({
    projectId: z.string().min(1, "נא לבחור פרויקט"),
    /** ‎yyyy-mm — ‎`input[type=month]` */
    billingMonth: z
      .string()
      .regex(/^\d{4}-\d{2}$/, "נא לבחור חודש חיוב"),
    /** מספר בקשת תשלום / חשבון (למשל 4) */
    applicationNumber: z.coerce
      .number()
      .int("מספר שלם בלבד")
      .positive("נא להזין מספר חשבון חיובי"),
    /** עיכבון — אחוז מסכום הבסיס (ברירת מחדל 5 = 5%) */
    retentionPercent: z.coerce.number().nonnegative(),
    /** ביטוח — אחוז (ברירת מחדל 0.65 = 0.65%) */
    insurancePercent: z.coerce.number().nonnegative(),
    /** התייקרויות — סכום קבוע */
    indexationAmount: z.coerce.number(),
    changeOrders: z.array(billingChangeOrderLineSchema),
    /** נעילת מסמך — טיוטה / סופי + מספר רשמי (דמה ‎MB…) */
    documentStatus: z.enum(["draft", "final"]).default("draft"),
    formalSerial: z.string().default(""),
    lines: z
      .array(clientBillingLineSchema)
      .min(1, "אין שורות בכמות הכספים"),
  })
  .transform((data) => {
    // מעבר יחיד על שורות BOQ — O(L) במקום map + reduce + map נפרדים
    const lineComputed: {
      totalCumulativeQty: number
      lineTotalAmount: number
    }[] = []
    let totalPeriodBillAmount = 0
    for (const l of data.lines) {
      const lineTotalAmount = roundMoney(l.currentPeriodQty * l.unitPrice)
      totalPeriodBillAmount += lineTotalAmount
      lineComputed.push({
        totalCumulativeQty: l.previousCumulativeQty + l.currentPeriodQty,
        lineTotalAmount,
      })
    }
    totalPeriodBillAmount = roundMoney(totalPeriodBillAmount)
    const derived = computeBillingDeductions({
      baseApprovedAmount: totalPeriodBillAmount,
      retentionPercent: data.retentionPercent,
      insurancePercent: data.insurancePercent,
      indexationAmount: data.indexationAmount,
      changeOrders: data.changeOrders,
    })
    return {
      ...data,
      totalPeriodBillAmount,
      lineComputed,
      changeOrdersApprovedSum: derived.changeOrdersApprovedSum,
      retentionDeduction: derived.retentionDeduction,
      insuranceDeduction: derived.insuranceDeduction,
      finalAmountToPay: derived.finalAmountToPay,
      /** סכום נטו לחיוב יזם (שם מפורש ל־Phase 8.4) */
      finalAmountToBill: derived.finalAmountToPay,
    }
  })

export type ClientBillingFormInput = z.input<typeof clientBillingFormSchema>
export type ClientBillingFormOutput = z.output<typeof clientBillingFormSchema>

export type ClientBillingMockProject = {
  id: string
  label: string
}

/** פרויקטים לדמה — חשבון מצטבר מול יזם */
export const CLIENT_BILLING_MOCK_PROJECTS: ClientBillingMockProject[] = [
  {
    id: "prj-gindi-towers-a",
    label: "גינדי TLV — מגדל A · חשמל ותאורה",
  },
  {
    id: "prj-gindi-logistics",
    label: "גינדי לוגיסטיקה פארק 7 — מתח ותשתיות",
  },
  {
    id: "prj-urban-mix-use",
    label: "מתחם מעורב מגורים-מסחר — שלב ביצוע 2",
  },
]

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** כמות מצטברת כוללת בתקופה: קודם + נוכחי */
export function getLineTotalCumulativeQty(line: {
  previousCumulativeQty: number
  currentPeriodQty: number
}): number {
  return roundMoney(line.previousCumulativeQty + line.currentPeriodQty)
}

/** סכום לתשלום לסעיף בתקופה: כמות נוכחית × מחיר יחידה */
export function getLineBillAmount(line: {
  currentPeriodQty: number
  unitPrice: number
}): number {
  return roundMoney(line.currentPeriodQty * line.unitPrice)
}

export function defaultClientBillingFormValues(): ClientBillingFormInput {
  const month = new Date().toISOString().slice(0, 7)
  return {
    projectId: CLIENT_BILLING_MOCK_PROJECTS[0]?.id ?? "",
    billingMonth: month,
    applicationNumber: 4,
    retentionPercent: 5,
    insurancePercent: 0.65,
    indexationAmount: 0,
    changeOrders: [
      { description: "הוראת שינוי — הרחבת חיווט יסודות (מאושר)", approvedAmount: 18500 },
    ],
    documentStatus: "draft",
    formalSerial: "",
    lines: [
      {
        itemDescription: "התקנת לוח חשמל ראשי — אגפים 3–8",
        contractQty: 42,
        unitPrice: 18500,
        previousCumulativeQty: 28,
        currentPeriodQty: 4,
      },
      {
        itemDescription: "השחלת כבלי מתח ותקשורת — גומחות טכניות",
        contractQty: 5200,
        unitPrice: 12.8,
        previousCumulativeQty: 3100,
        currentPeriodQty: 420,
      },
      {
        itemDescription: "התקנת גופי תאורת חירום ושילוט יציאה",
        contractQty: 880,
        unitPrice: 245,
        previousCumulativeQty: 620,
        currentPeriodQty: 95,
      },
      {
        itemDescription: "ארגז חיבור ראשי + מונים — יח׳",
        contractQty: 18,
        unitPrice: 9200,
        previousCumulativeQty: 11,
        currentPeriodQty: 2,
      },
    ],
  }
}
