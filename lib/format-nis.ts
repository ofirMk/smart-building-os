/** פורמט סכומים בשקלים (ILS) — בטוח לשימוש ב־Client וב־Server */
export function formatNisHe(value: number): string {
  if (!Number.isFinite(value)) {
    return (0).toLocaleString("he-IL", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 2,
    })
  }
  return value.toLocaleString("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  })
}
