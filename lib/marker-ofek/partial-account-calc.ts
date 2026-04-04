/**
 * Pure cumulative billing math for partial accounts (server action uses this after loading DB rows).
 * Period work = Σ line ((current% − previous%) / 100) × line base.
 * Indexed period = period × index_coefficient (V1 default 1; base date on contract for future CPI).
 * Deductions (retention, insurance, lab fees) apply to indexed period work.
 * Payment due = indexedPeriod − retention − insurance − labFees.
 */

export type DeductionPercents = {
  retention: number
  insurance: number
  labFees: number
}

export type DeductionAmounts = {
  retention: number
  insurance: number
  labFees: number
  paymentDue: number
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** Merge `contract_deduction_rules` rows with legacy `contracts.*_pct` fallbacks. */
export function resolveDeductionPercents(input: {
  retentionPct: number
  insurancePct: number
  labFeesPct: number
  rules: Array<{ deduction_kind: string; percent: number | null }> | null | undefined
}): DeductionPercents {
  const fromRule = (kind: string, fallback: number) => {
    const row = input.rules?.find((r) => r.deduction_kind === kind)
    if (row && row.percent != null && Number.isFinite(Number(row.percent))) {
      return clampPct(Number(row.percent))
    }
    return clampPct(fallback)
  }
  return {
    retention: fromRule("retention", input.retentionPct),
    insurance: fromRule("insurance", input.insurancePct),
    labFees: fromRule("lab_fees", input.labFeesPct),
  }
}

export function applyIndexCoefficient(periodWorkGross: number, indexCoefficient: number): number {
  const k = Number(indexCoefficient)
  const mult = Number.isFinite(k) && k > 0 ? k : 1
  return roundMoney(periodWorkGross * mult)
}

/**
 * Step 2 indexation: prefer (Current/Base) from `ref_index_history`; else `index_coefficient` on gross.
 * Adjustment = indexed − gross (הפרשי הצמדה).
 */
export function computeIndexedPeriodFromHistory(input: {
  periodGross: number
  baseIndexValue: number | null
  currentIndexValue: number | null
  indexCoefficientFallback: number
}): {
  periodIndexed: number
  indexationAdjustment: number
  usedIndexRatio: boolean
} {
  const gross = Math.max(0, Number(input.periodGross) || 0)
  const b = input.baseIndexValue
  const c = input.currentIndexValue
  if (
    b != null &&
    c != null &&
    Number.isFinite(b) &&
    Number.isFinite(c) &&
    b > 0 &&
    c > 0
  ) {
    const periodIndexed = roundMoney(gross * (c / b))
    return {
      periodIndexed,
      indexationAdjustment: roundMoney(periodIndexed - gross),
      usedIndexRatio: true,
    }
  }
  const periodIndexed = applyIndexCoefficient(gross, input.indexCoefficientFallback)
  return {
    periodIndexed,
    indexationAdjustment: roundMoney(periodIndexed - gross),
    usedIndexRatio: false,
  }
}

/**
 * Deductions are straight % of indexed period work (same structure as previous retention+insurance only).
 */
export function computeDeductionAmounts(
  periodWorkIndexed: number,
  percents: DeductionPercents
): DeductionAmounts {
  const base = Math.max(0, periodWorkIndexed)
  const retention = roundMoney(base * (clampPct(percents.retention) / 100))
  const insurance = roundMoney(base * (clampPct(percents.insurance) / 100))
  const labFees = roundMoney(base * (clampPct(percents.labFees) / 100))
  const paymentDue = roundMoney(base - retention - insurance - labFees)
  return { retention, insurance, labFees, paymentDue }
}

/**
 * Header cumulative after this account: previous_cumulative_approved + period_work_gross (before index).
 * (Index applies to period invoice slice, not to rolling cumulative display — V1.)
 */
export function computeTotalCumulativeAmount(
  previousCumulativeApproved: number,
  periodWorkGross: number
): number {
  return roundMoney(
    Math.max(0, Number(previousCumulativeApproved) || 0) +
      Math.max(0, Number(periodWorkGross) || 0)
  )
}

export function contractProgressPercent(
  totalCumulativeAmount: number,
  contractTotal: number
): number | null {
  const t = Number(contractTotal)
  if (!Number.isFinite(t) || t <= 0) return null
  return roundMoney((Math.max(0, totalCumulativeAmount) / t) * 100)
}
