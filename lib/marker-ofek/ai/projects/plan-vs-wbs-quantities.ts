export function parseLooseNumber(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === "number" && Number.isFinite(value)) return value
  const s = String(value).trim().replace(/,/g, " ")
  const m = s.match(/-?\d+(?:\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

export function parseWbsMetadataQuantity(
  metadata: Record<string, unknown>
): number | null {
  const keys = [
    "planned_quantity",
    "quantity",
    "qty",
    "budget_quantity",
    "takeoff_qty",
    "boq_qty",
  ] as const
  for (const k of keys) {
    const n = parseLooseNumber(metadata[k])
    if (n != null) return n
  }
  return null
}
