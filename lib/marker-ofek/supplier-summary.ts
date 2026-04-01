export type SupplierSummary = {
  supplierId: string | null
  name: string
  legalId: string | null
  contactPhone: string | null
  contactEmail: string | null
  rating: number
  totalVolume2025: number
  currentDebt: number
  activePos: number
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function pickString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
}

export function normalizeSupplierSummaryRow(row: Record<string, unknown>): SupplierSummary {
  const supplierId = pickString(row, ["supplier_id", "id", "entity_id"])
  const name = pickString(row, ["supplier_name", "name"]) ?? "ספק ללא שם"
  const legalId = pickString(row, ["legal_id", "hp", "tax_id"])
  const contactPhone = pickString(row, ["phone", "contact_phone"])
  const contactEmail = pickString(row, ["email", "contact_email"])

  return {
    supplierId,
    name,
    legalId,
    contactPhone,
    contactEmail,
    rating: Math.max(0, Math.min(5, asNumber(row.rating ?? row.rating_stars, 0))),
    totalVolume2025: asNumber(
      row.total_volume_2025 ?? row.total_spent_2025 ?? row.volume_2025,
      0
    ),
    currentDebt: asNumber(row.current_debt ?? row.open_debt ?? row.debt, 0),
    activePos: Math.max(0, Math.floor(asNumber(row.active_pos ?? row.active_pos_count, 0))),
  }
}

export function normalizeSupplierSummaryRows(rows: unknown[]): SupplierSummary[] {
  return rows
    .map((r) => normalizeSupplierSummaryRow((r ?? {}) as Record<string, unknown>))
    .filter((r) => r.name.trim().length > 0)
}
