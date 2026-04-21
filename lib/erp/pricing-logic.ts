/**
 * Pricing-logic helpers shared by procurement, contracts, and analytics.
 *
 * The historical-average variance calculation here feeds:
 *   - real-time ceiling / margin checks during entry,
 *   - the "High-Risk Approvals" Bento widget on the Executive Dashboard.
 */

export const HIGH_VARIANCE_THRESHOLD = 0.2

export type HistoricalPriceStats = {
  avgPrice: number
  minPrice: number
  maxPrice: number
  lastPaidPrice: number
  sampleCount: number
}

export type RawHistoricalPriceStatsRow = {
  avg_price: number | string | null
  min_price: number | string | null
  max_price: number | string | null
  last_paid_price: number | string | null
  sample_count: number | string | null
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function mapHistoricalPriceStatsRow(
  row: RawHistoricalPriceStatsRow | null | undefined
): HistoricalPriceStats {
  return {
    avgPrice: toFiniteNumber(row?.avg_price),
    minPrice: toFiniteNumber(row?.min_price),
    maxPrice: toFiniteNumber(row?.max_price),
    lastPaidPrice: toFiniteNumber(row?.last_paid_price),
    sampleCount: toFiniteNumber(row?.sample_count),
  }
}

export type PriceVarianceInput = {
  enteredPrice: number
  /**
   * Either a fully-mapped `HistoricalPriceStats` (preferred) or just the
   * average number. `null` is treated as "no baseline".
   */
  baseline: number | HistoricalPriceStats | null | undefined
}

export type PriceVarianceResult = {
  /** Absolute delta in currency units (`entered - baseline`). */
  delta: number
  /** Signed ratio. `0.24` means "+24% vs baseline". */
  variance: number
  /** Same value expressed as a percentage (`24`). */
  variancePct: number
  /** `true` when `|variance| >= HIGH_VARIANCE_THRESHOLD`. */
  isHighVariance: boolean
  /** The baseline number actually used (0 if none was resolvable). */
  baseline: number
}

function extractBaseline(
  baseline: number | HistoricalPriceStats | null | undefined
): number {
  if (baseline === null || baseline === undefined) return 0
  if (typeof baseline === "number") return Number.isFinite(baseline) ? baseline : 0
  return Number.isFinite(baseline.avgPrice) ? baseline.avgPrice : 0
}

/**
 * Compute the signed variance of an entered price against a baseline,
 * along with a boolean flag for the 20% threshold.
 *
 * A baseline <= 0 returns a neutral result (`variance = 0`,
 * `isHighVariance = false`) so callers don't need a branch for
 * missing historical data.
 */
export function calculatePriceVariance({
  enteredPrice,
  baseline,
}: PriceVarianceInput): PriceVarianceResult {
  const safeEntered = Number.isFinite(enteredPrice) ? Number(enteredPrice) : 0
  const baseNum = extractBaseline(baseline)

  if (baseNum <= 0) {
    return {
      delta: 0,
      variance: 0,
      variancePct: 0,
      isHighVariance: false,
      baseline: 0,
    }
  }

  const delta = safeEntered - baseNum
  const variance = delta / baseNum
  return {
    delta: Math.round(delta * 100) / 100,
    variance: Math.round(variance * 10000) / 10000,
    variancePct: Math.round(variance * 1000) / 10,
    isHighVariance: Math.abs(variance) >= HIGH_VARIANCE_THRESHOLD,
    baseline: baseNum,
  }
}

/**
 * Convenience: returns just the boolean flag without the full result.
 */
export function isHighVariancePrice(input: PriceVarianceInput): boolean {
  return calculatePriceVariance(input).isHighVariance
}

/**
 * Format a variance ratio for UI display, e.g. `0.24 -> "+24.0%"`.
 */
export function formatVariancePct(variance: number): string {
  if (!Number.isFinite(variance) || variance === 0) return "0%"
  const abs = Math.abs(variance) * 100
  const sign = variance > 0 ? "+" : "-"
  return `${sign}${abs.toFixed(1)}%`
}
