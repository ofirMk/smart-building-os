/**
 * Forecasting Accuracy Engine — per Project Manager index.
 *
 *   ForecastingAccuracyIndex = 1 - (AvgAbsDeviation / PaymentTerms)
 *
 * The deviation is the absolute difference (in days) between the
 * forecasted cash-arrival date and the date the project actually
 * realised cash inflow (or the approval-lag proxy when no actual
 * payment is recorded yet). Payment terms come from the client
 * contract (`payment_terms_days`, defaulted to 30).
 *
 * Index is clamped to the `[0, 1]` range so a single catastrophic
 * outlier cannot produce a negative "score". Callers that prefer a
 * percentage can multiply the result by 100.
 */

export type ForecastingAccuracyInput = {
  averageAbsoluteDeviationDays: number
  paymentTermsDays: number
}

export type ForecastingAccuracyResult = {
  forecastingAccuracyIndex: number
  forecastingAccuracyPct: number
  averageAbsoluteDeviationDays: number
  paymentTermsDays: number
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed) ? parsed : fallback
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/**
 * Core calculation used everywhere the directive formula is required.
 * `paymentTermsDays <= 0` collapses the index to 0 (cannot forecast
 * against no payment terms) rather than throwing, so callers don't
 * need a branch for missing data.
 */
export function calculateForecastingAccuracyIndex(
  input: ForecastingAccuracyInput
): ForecastingAccuracyResult {
  const avgAbsDev = Math.max(0, toFiniteNumber(input.averageAbsoluteDeviationDays))
  const paymentTerms = toFiniteNumber(input.paymentTermsDays)

  if (paymentTerms <= 0) {
    return {
      forecastingAccuracyIndex: 0,
      forecastingAccuracyPct: 0,
      averageAbsoluteDeviationDays: avgAbsDev,
      paymentTermsDays: 0,
    }
  }

  const raw = 1 - avgAbsDev / paymentTerms
  const idx = clamp01(raw)
  return {
    forecastingAccuracyIndex: Number(idx.toFixed(4)),
    forecastingAccuracyPct: Number((idx * 100).toFixed(2)),
    averageAbsoluteDeviationDays: Number(avgAbsDev.toFixed(2)),
    paymentTermsDays: Number(paymentTerms.toFixed(2)),
  }
}

/**
 * One row in the PM accuracy ranking surfaced by `/api/erp/analytics/global-health`.
 */
export type ProjectForecastingSample = {
  projectId: string
  projectManagerId: string | null
  averageAbsoluteDeviationDays: number | null
  paymentTermsDays: number | null
  projectName?: string | null
}

export type PmAccuracyRankingRow = {
  projectManagerId: string
  projectManagerName: string | null
  projectsCount: number
  averageAbsoluteDeviationDays: number
  averagePaymentTermsDays: number
  forecastingAccuracyIndex: number
  forecastingAccuracyPct: number
}

export type PmProfileLookup = Map<string, string | null>

/**
 * Groups `ProjectForecastingSample`s by PM, averages the deviation and
 * payment-terms across each PM's projects, and emits a sorted ranking
 * (highest index first). Projects without a PM or without finite
 * deviation/payment-terms are dropped from the aggregate but counted
 * in the return payload when the caller needs the raw list.
 */
export function computePmAccuracyRanking(
  samples: ProjectForecastingSample[],
  profiles: PmProfileLookup = new Map()
): PmAccuracyRankingRow[] {
  const grouped = new Map<
    string,
    {
      totalDeviation: number
      totalPaymentTerms: number
      projects: number
    }
  >()

  for (const row of samples) {
    if (!row.projectManagerId) continue
    const deviation = toFiniteNumber(row.averageAbsoluteDeviationDays, NaN)
    const paymentTerms = toFiniteNumber(row.paymentTermsDays, NaN)
    if (!Number.isFinite(deviation) || !Number.isFinite(paymentTerms)) continue
    if (paymentTerms <= 0) continue

    const bucket = grouped.get(row.projectManagerId) ?? {
      totalDeviation: 0,
      totalPaymentTerms: 0,
      projects: 0,
    }
    bucket.totalDeviation += Math.abs(deviation)
    bucket.totalPaymentTerms += paymentTerms
    bucket.projects += 1
    grouped.set(row.projectManagerId, bucket)
  }

  const rows: PmAccuracyRankingRow[] = []
  for (const [projectManagerId, bucket] of grouped.entries()) {
    const avgDev = bucket.totalDeviation / bucket.projects
    const avgTerms = bucket.totalPaymentTerms / bucket.projects
    const { forecastingAccuracyIndex, forecastingAccuracyPct } =
      calculateForecastingAccuracyIndex({
        averageAbsoluteDeviationDays: avgDev,
        paymentTermsDays: avgTerms,
      })

    rows.push({
      projectManagerId,
      projectManagerName: profiles.get(projectManagerId) ?? null,
      projectsCount: bucket.projects,
      averageAbsoluteDeviationDays: Number(avgDev.toFixed(2)),
      averagePaymentTermsDays: Number(avgTerms.toFixed(2)),
      forecastingAccuracyIndex,
      forecastingAccuracyPct,
    })
  }

  return rows.sort(
    (a, b) => b.forecastingAccuracyIndex - a.forecastingAccuracyIndex
  )
}

/**
 * Utility used when only a single project's index is required (e.g.
 * project dashboard drill-down).
 */
export function computeProjectAccuracyIndex(
  sample: ProjectForecastingSample
): ForecastingAccuracyResult {
  return calculateForecastingAccuracyIndex({
    averageAbsoluteDeviationDays: toFiniteNumber(sample.averageAbsoluteDeviationDays),
    paymentTermsDays: toFiniteNumber(sample.paymentTermsDays),
  })
}
