/**
 * תצוגת סכום בשקלים (₪) לפי he-IL
 */
export function formatIls(amount: number | string): string {
  const n = typeof amount === "string" ? Number(amount) : amount
  if (!Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n)
}
