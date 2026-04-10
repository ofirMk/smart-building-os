import { z } from "zod"

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * שורה גולמית מהמודל — תומך גם בפורמט ישן (רק unit_price + previous_cumulative_quantity)
 * וגם בפורמט מחוזה (total_item_price + cumulative_execution_percent).
 */
const baselineBillLineItemRawSchema = z.object({
  item_id: z.union([z.string(), z.number()]).optional(),
  section_number: z.coerce.string(),
  description: z.coerce.string(),
  unit: z.union([z.string(), z.number()]).optional(),
  contract_quantity: z.coerce.number(),
  total_item_price: z.coerce.number().optional(),
  unit_price: z.coerce.number().optional(),
  previous_cumulative_quantity: z.coerce.number().optional(),
  cumulative_execution_percent: z.coerce.number().optional(),
  previous_percent: z.coerce.number().optional(),
  current_performance: z.coerce.number().optional(),
  total_accumulated: z.coerce.number().optional(),
  alert: z.union([z.string(), z.null()]).optional(),
})

export const baselineBillLineItemSchema = baselineBillLineItemRawSchema.transform(
  (raw) => {
    const qty = Number(raw.contract_quantity)
    let totalItem =
      raw.total_item_price !== undefined && Number.isFinite(raw.total_item_price)
        ? raw.total_item_price
        : NaN
    let unitP =
      raw.unit_price !== undefined && Number.isFinite(raw.unit_price)
        ? raw.unit_price
        : NaN

    if (Number.isFinite(qty) && qty > 0) {
      if ((!Number.isFinite(unitP) || unitP === 0) && Number.isFinite(totalItem) && totalItem > 0) {
        unitP = roundMoney(totalItem / qty)
      }
      if (
        (!Number.isFinite(totalItem) || totalItem === 0) &&
        Number.isFinite(unitP) &&
        unitP > 0
      ) {
        totalItem = roundMoney(unitP * qty)
      }
    }
    if (!Number.isFinite(unitP)) unitP = 0
    if (!Number.isFinite(totalItem)) totalItem = 0

    let prevQty = raw.previous_cumulative_quantity
    if (prevQty === undefined || !Number.isFinite(prevQty)) {
      const pct = raw.cumulative_execution_percent
      if (pct !== undefined && Number.isFinite(pct) && Number.isFinite(qty) && qty > 0) {
        prevQty = roundMoney(Math.max(0, Math.min(qty, (pct / 100) * qty)))
      } else {
        prevQty = 0
      }
    } else {
      prevQty = Math.max(0, prevQty)
    }

    let cumPct = raw.cumulative_execution_percent
    if (cumPct === undefined || !Number.isFinite(cumPct)) {
      if (Number.isFinite(qty) && qty > 0 && Number.isFinite(prevQty)) {
        cumPct = roundMoney(Math.min(100, Math.max(0, (prevQty / qty) * 100)))
      } else {
        cumPct = 0
      }
    } else {
      cumPct = Math.min(100, Math.max(0, cumPct))
    }

    const unitStr =
      raw.unit === undefined || raw.unit === null
        ? ""
        : String(raw.unit).trim()

    const previousPercent = Number.isFinite(raw.previous_percent)
      ? Number(raw.previous_percent)
      : Number.isFinite(cumPct)
        ? Number(cumPct)
        : 0
    const currentPerformance = Number.isFinite(raw.current_performance)
      ? Number(raw.current_performance)
      : 0
    const totalAccumulated = Number.isFinite(raw.total_accumulated)
      ? Number(raw.total_accumulated)
      : roundMoney(previousPercent + currentPerformance)
    const normalizedAlert =
      String(raw.alert ?? "").trim().toUpperCase() === "OVER_BUDGET" ||
      totalAccumulated > 100
        ? "OVER_BUDGET"
        : null

    return {
      item_id:
        raw.item_id === undefined || raw.item_id === null
          ? null
          : String(raw.item_id).trim() || null,
      section_number: String(raw.section_number ?? "").trim(),
      description: String(raw.description ?? "").trim(),
      unit: unitStr,
      contract_quantity: Number.isFinite(qty) ? qty : 0,
      total_item_price: totalItem,
      unit_price: unitP,
      previous_cumulative_quantity: prevQty,
      cumulative_execution_percent: cumPct,
      previous_percent: previousPercent,
      current_performance: currentPerformance,
      total_accumulated: totalAccumulated,
      alert: normalizedAlert,
    }
  }
)

export type BaselineBillLineItemAI = z.infer<typeof baselineBillLineItemSchema>

/** שדות כותרת כספיים + שורות (אותו מבנה ל-PDF בסיס בלבד או PDF משולב BoQ) */
export const partialBillBaselineAISchema = z.object({
  bill_number: z.coerce.number().default(0),
  bill_month: z.string().default(""),
  base_index: z.coerce.number().default(0),
  current_index: z.coerce.number().default(0),
  cumulative_work_value: z.coerce.number().default(0),
  indexation_amount: z.coerce.number().default(0),
  retention_percent: z.coerce.number().default(0),
  retention_amount: z.coerce.number().default(0),
  insurance_amount: z.coerce.number().default(0),
  testing_amount: z.coerce.number().default(0),
  subcontractor_deductions: z.coerce.number().default(0),
  total_approved: z.coerce.number().default(0),
  glAccountCode: z.coerce.string().default(""),
  items: z
    .array(baselineBillLineItemSchema)
    .min(1, { message: "חובה לפחות שורת BoQ אחת — חלצו את כל שורות הטבלה מהמסמך" }),
})

export type PartialBillBaselineAIParsed = z.infer<
  typeof partialBillBaselineAISchema
>

export function parsePartialBillBaselinePayload(
  raw: unknown,
  context: string
): PartialBillBaselineAIParsed {
  const r = partialBillBaselineAISchema.safeParse(raw)
  if (!r.success) {
    console.error(`[${context}] Zod parse failed`, r.error.flatten(), raw)
    throw new Error("מבנה נתוני חשבון לא תואם לסכימה — בדקו את תשובת ה-AI")
  }
  return r.data
}
