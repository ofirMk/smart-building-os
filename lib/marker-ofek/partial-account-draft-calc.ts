import {
  applyIndexCoefficient,
  computeDeductionAmounts,
  computeTotalCumulativeAmount,
  contractProgressPercent,
  type DeductionPercents,
} from "@/lib/marker-ofek/partial-account-calc"

export type DraftLineInput = {
  /** Stable key for React state */
  lineKey: string
  lineBase: number
  qPrev: number
  qCur: number
}

export type DraftLinePreview = {
  lineKey: string
  /** (qCur/100)×base */
  currentGross: number
  /** Period slice for this line */
  periodGross: number
  /** (currentGross / contractTotal)×100 when contract total known */
  totalPercentOfContract: number | null
}

export type PartialAccountDraftPreview = {
  periodWorkGross: number
  periodWorkIndexed: number
  retention: number
  insurance: number
  labFees: number
  paymentDue: number
  newCumulativeTotal: number
  contractProgressPercent: number | null
  perLine: DraftLinePreview[]
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

/**
 * Client-side preview aligned with `calculatePartialAccount` (period gross → index → deductions).
 */
export function computePartialAccountDraftPreview(input: {
  previousCumulativeApproved: number
  contractTotal: number | null
  indexCoefficient: number
  deductionPercents: DeductionPercents
  lines: DraftLineInput[]
}): PartialAccountDraftPreview {
  let periodWorkGross = 0
  const perLine: DraftLinePreview[] = []

  const ct =
    input.contractTotal != null && Number.isFinite(input.contractTotal) && input.contractTotal > 0
      ? input.contractTotal
      : null

  for (const row of input.lines) {
    const base = Math.max(0, Number(row.lineBase) || 0)
    const qPrev = clampPct(Number(row.qPrev) || 0)
    const qCur = clampPct(Number(row.qCur) || 0)
    const currentGross = Math.round(base * (qCur / 100) * 100) / 100
    const delta = Math.max(0, qCur - qPrev)
    const periodGross = Math.round(base * (delta / 100) * 100) / 100
    periodWorkGross += periodGross
    perLine.push({
      lineKey: row.lineKey,
      currentGross,
      periodGross,
      totalPercentOfContract: ct != null ? Math.round((currentGross / ct) * 10000) / 100 : null,
    })
  }

  periodWorkGross = Math.round(periodWorkGross * 100) / 100
  const periodWorkIndexed = applyIndexCoefficient(periodWorkGross, input.indexCoefficient)
  const d = computeDeductionAmounts(periodWorkIndexed, input.deductionPercents)
  const newCumulativeTotal = computeTotalCumulativeAmount(
    input.previousCumulativeApproved,
    periodWorkGross
  )

  return {
    periodWorkGross,
    periodWorkIndexed,
    retention: d.retention,
    insurance: d.insurance,
    labFees: d.labFees,
    paymentDue: d.paymentDue,
    newCumulativeTotal,
    contractProgressPercent: contractProgressPercent(newCumulativeTotal, input.contractTotal ?? 0),
    perLine,
  }
}
