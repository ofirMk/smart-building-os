/**
 * אילו סטטוסי PO נספרים בעלות מחויבת לפרויקט (שותפים / הנהלה).
 * PO בממתינה לאישור מנכ״ל לא אמור להשפיע על רווחיות עד לאישור.
 */
export function poAmountCountsTowardCommittedSpend(status: string): boolean {
  const s = status.trim().toLowerCase()
  if (s === "draft") return false
  if (s === "pending_ceo_approval") return false
  return true
}

export type PoCommittedSpendRow = {
  status: string
  /** עמודה מחושבת ב־DB — `purchase_orders.is_ceo_approved` */
  is_ceo_approved?: boolean | null
}

/**
 * שורת PO נספרת בעלות מחויבת רק כשהסטטוס מאושר לרכש **וגם** `is_ceo_approved` (חתימת מנכ״ל כשנדרש).
 */
export function poRowCountsTowardCommittedSpend(row: PoCommittedSpendRow): boolean {
  if (!poAmountCountsTowardCommittedSpend(String(row.status ?? ""))) return false
  if (row.is_ceo_approved === false) return false
  return true
}
