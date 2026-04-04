import {
  resolveFieldPercentForPartialLine,
  type GanttTaskSyncLite,
} from "@/lib/marker-ofek/gantt-billing-sync"

/** Field (Gantt) ahead of billing by more than this → unbilled revenue (₪). */
export const REVENUE_GAP_THRESHOLD_PCT = 10

/** Billed ahead of field by more than this → billing exposure / inspection risk (₪). */
export const RISK_GAP_THRESHOLD_PCT = 5

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export type RevenueGapLineInput = {
  id: string
  label: string
  quantity_current: number
  gantt_suggested_percent: number | null
  line_base_amount: number
}

export type RevenueGapRow = {
  lineId: string
  label: string
  fieldPercent: number
  billedPercent: number
  gapPercent: number
  /** `(gapPercent / 100) * line_base_amount` — “hidden” revenue at risk of under-billing */
  hiddenRevenueIls: number
  lineBaseAmount: number
}

export type BillingRiskRow = {
  lineId: string
  label: string
  fieldPercent: number
  billedPercent: number
  gapPercent: number
  /** `(gapPercent / 100) * line_base_amount` — exposure when billed above field */
  billingExposureIls: number
  lineBaseAmount: number
}

export type LineDualGapKind = "none" | "revenue" | "risk"

/**
 * Line items where (Field % − Billed %) > 10. Unbilled revenue = gap × line total (₪).
 */
export function getRevenueGaps(
  lines: RevenueGapLineInput[],
  ganttTasksForSync: GanttTaskSyncLite[]
): RevenueGapRow[] {
  const out: RevenueGapRow[] = []
  for (const li of lines) {
    const field = resolveFieldPercentForPartialLine(
      { label: li.label, gantt_suggested_percent: li.gantt_suggested_percent },
      ganttTasksForSync
    )
    if (field == null) continue
    const billed = Math.min(100, Math.max(0, Number(li.quantity_current) || 0))
    const gap = Math.round((field - billed) * 100) / 100
    if (gap <= REVENUE_GAP_THRESHOLD_PCT) continue
    const base = Math.max(0, Number(li.line_base_amount) || 0)
    const hiddenRevenueIls = roundMoney((gap / 100) * base)
    out.push({
      lineId: li.id,
      label: li.label,
      fieldPercent: field,
      billedPercent: billed,
      gapPercent: gap,
      hiddenRevenueIls,
      lineBaseAmount: base,
    })
  }
  return out
}

/**
 * Line items where (Billed % − Field %) > 5. Billing exposure = gap × line total (₪).
 */
export function getBillingRisks(
  lines: RevenueGapLineInput[],
  ganttTasksForSync: GanttTaskSyncLite[]
): BillingRiskRow[] {
  const out: BillingRiskRow[] = []
  for (const li of lines) {
    const field = resolveFieldPercentForPartialLine(
      { label: li.label, gantt_suggested_percent: li.gantt_suggested_percent },
      ganttTasksForSync
    )
    if (field == null) continue
    const billed = Math.min(100, Math.max(0, Number(li.quantity_current) || 0))
    const gap = Math.round((billed - field) * 100) / 100
    if (gap <= RISK_GAP_THRESHOLD_PCT) continue
    const base = Math.max(0, Number(li.line_base_amount) || 0)
    const billingExposureIls = roundMoney((gap / 100) * base)
    out.push({
      lineId: li.id,
      label: li.label,
      fieldPercent: field,
      billedPercent: billed,
      gapPercent: gap,
      billingExposureIls,
      lineBaseAmount: base,
    })
  }
  return out
}

export function summarizeRevenueGaps(gaps: RevenueGapRow[]): {
  totalHiddenRevenueIls: number
  criticalCount: number
} {
  const totalHiddenRevenueIls = roundMoney(
    gaps.reduce((s, g) => s + g.hiddenRevenueIls, 0)
  )
  return {
    totalHiddenRevenueIls,
    criticalCount: gaps.length,
  }
}

export function summarizeBillingRisks(risks: BillingRiskRow[]): {
  totalBillingExposureIls: number
  riskCount: number
} {
  const totalBillingExposureIls = roundMoney(
    risks.reduce((s, r) => s + r.billingExposureIls, 0)
  )
  return {
    totalBillingExposureIls,
    riskCount: risks.length,
  }
}

/** Real-time ribbon totals for a partial account (recalculates on draft נוכחי %). */
export function summarizeDualGapRibbon(
  lines: RevenueGapLineInput[],
  ganttTasksForSync: GanttTaskSyncLite[]
): {
  totalUnbilledRevenueIls: number
  totalBillingExposureIls: number
  revenueExceptionCount: number
  riskExceptionCount: number
} {
  const revenue = getRevenueGaps(lines, ganttTasksForSync)
  const risks = getBillingRisks(lines, ganttTasksForSync)
  const sRev = summarizeRevenueGaps(revenue)
  const sRisk = summarizeBillingRisks(risks)
  return {
    totalUnbilledRevenueIls: sRev.totalHiddenRevenueIls,
    totalBillingExposureIls: sRisk.totalBillingExposureIls,
    revenueExceptionCount: sRev.criticalCount,
    riskExceptionCount: sRisk.riskCount,
  }
}

/** Per-line: revenue vs risk exception (mutually exclusive when field is known). */
export function getLineDualGapInfo(
  line: RevenueGapLineInput,
  ganttTasksForSync: GanttTaskSyncLite[]
): {
  kind: LineDualGapKind
  fieldPercent: number | null
  billedPercent: number
  isException: boolean
  unbilledRevenueIls: number
  billingExposureIls: number
} {
  const field = resolveFieldPercentForPartialLine(
    { label: line.label, gantt_suggested_percent: line.gantt_suggested_percent },
    ganttTasksForSync
  )
  const billed = Math.min(100, Math.max(0, Number(line.quantity_current) || 0))
  const base = Math.max(0, Number(line.line_base_amount) || 0)

  if (field == null) {
    return {
      kind: "none",
      fieldPercent: null,
      billedPercent: billed,
      isException: false,
      unbilledRevenueIls: 0,
      billingExposureIls: 0,
    }
  }

  const fieldMinusBilled = Math.round((field - billed) * 100) / 100
  if (fieldMinusBilled > REVENUE_GAP_THRESHOLD_PCT) {
    return {
      kind: "revenue",
      fieldPercent: field,
      billedPercent: billed,
      isException: true,
      unbilledRevenueIls: roundMoney((fieldMinusBilled / 100) * base),
      billingExposureIls: 0,
    }
  }

  const billedMinusField = Math.round((billed - field) * 100) / 100
  if (billedMinusField > RISK_GAP_THRESHOLD_PCT) {
    return {
      kind: "risk",
      fieldPercent: field,
      billedPercent: billed,
      isException: true,
      unbilledRevenueIls: 0,
      billingExposureIls: roundMoney((billedMinusField / 100) * base),
    }
  }

  return {
    kind: "none",
    fieldPercent: field,
    billedPercent: billed,
    isException: false,
    unbilledRevenueIls: roundMoney((Math.max(0, fieldMinusBilled) / 100) * base),
    billingExposureIls: roundMoney((Math.max(0, billedMinusField) / 100) * base),
  }
}
