import type { MoBoqVersion } from "@/types/marker-ofek"

/** Line total ₪ */
export function boqLineTotal(quantity: number, unitPrice: number): number {
  return roundMoney(Number(quantity) * Number(unitPrice))
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Direct cost = Σ (qty × unit price) for provided lines.
 */
export function sumDirectCost(
  lines: Array<{ quantity: number | null; unit_price: number | null }>
): number {
  let s = 0
  for (const row of lines) {
    s += Number(row.quantity) * Number(row.unit_price)
  }
  return roundMoney(s)
}

/**
 * Risk & overhead applied on direct cost (additive percentages on base).
 * total = base × (1 + risk/100 + overhead/100)
 */
export function applyRiskAndOverheadOnBase(
  directCost: number,
  riskPercent: number,
  overheadPercent: number
): {
  riskAmount: number
  overheadAmount: number
  grandTotal: number
} {
  const base = roundMoney(directCost)
  const r = roundMoney(base * (Number(riskPercent) / 100))
  const o = roundMoney(base * (Number(overheadPercent) / 100))
  return {
    riskAmount: r,
    overheadAmount: o,
    grandTotal: roundMoney(base + r + o),
  }
}

/** Deviation of vendor price vs target: (vendor − target) / target × 100 */
export function priceDeviationPercent(target: number, vendor: number): number | null {
  const t = Number(target)
  const v = Number(vendor)
  if (!Number.isFinite(t) || t === 0) return null
  return roundMoney(((v - t) / t) * 100)
}

/** Competitive (green) when vendor unit ≤ target; expensive (red) when above */
export function deviationTone(
  deviationPercent: number | null
): "good" | "bad" | "neutral" {
  if (deviationPercent == null || !Number.isFinite(deviationPercent)) return "neutral"
  if (deviationPercent <= 0) return "good"
  return "bad"
}

export const BOQ_VERSIONS: { id: MoBoqVersion; label: string }[] = [
  { id: "v1", label: "V1" },
  { id: "v2", label: "V2" },
  { id: "final", label: "סופי" },
]
