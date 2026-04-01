/**
 * קטגוריות מותרות ל-AI Procurement / Shadow Catalog — חייב להתאים ל-seed ב-mo_categories.
 * טקסונומיה יציבה תומכת בסנכרון עתידי ל-ERP (ראו `erp-evolution-insights.ts`).
 */
export const MO_PROCUREMENT_CATEGORY_NAMES = [
  "כבלים ומוליכים",
  "אביזרי קצה ומיתוג",
  "תאורה וגופי תאורה",
  "צנרת, תעלות וקופסאות",
  "לוחות חשמל וציוד חלוקה",
  "שונות",
] as const

export type MoProcurementCategoryName =
  (typeof MO_PROCUREMENT_CATEGORY_NAMES)[number]

const SET = new Set<string>(MO_PROCUREMENT_CATEGORY_NAMES)

export function normalizeProcurementCategory(
  name: unknown
): MoProcurementCategoryName {
  const s = String(name ?? "").trim()
  if (SET.has(s)) return s as MoProcurementCategoryName
  return "שונות"
}
