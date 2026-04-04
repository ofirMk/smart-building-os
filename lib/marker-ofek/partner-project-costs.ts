/**
 * Partner profitability manual cost buckets on `projects` — defensive reads when migrations lag.
 */

/** Supabase row may omit columns until migrations run — always finite (defaults to 0). */
export function readPartnerCostField(row: Record<string, unknown>, key: string): number {
  const v = row[key]
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
