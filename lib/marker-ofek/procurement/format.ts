/** Shared ILS formatter for procurement surfaces — pair cells with `font-mono tabular-nums`. */
export function procurementCurrencyFormatter(): Intl.NumberFormat {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
