/**
 * Shared progress-report line math (partial billing / milestone % steps).
 * Used by the new progress report UI and server `saveProgressReport`.
 */

export function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function calcCurrentAmountProgressLine(
  totalPrice: number,
  selectedPctRaw: number,
  previousPctRaw: number | null | undefined
): { deltaPct: number; currentAmount: number; cumulativeValue: number } {
  const previousPct = clampPct(Number(previousPctRaw ?? 0))
  const selectedPct = clampPct(Number(selectedPctRaw))
  const selectedBps = Math.round(selectedPct * 100)
  const previousBps = Math.round(previousPct * 100)
  const deltaBps = selectedBps - previousBps
  const deltaPct = roundMoney(deltaBps / 100)
  const currentAmount = roundMoney((totalPrice * deltaBps) / 10000)
  const cumulativeValue = roundMoney((totalPrice * selectedBps) / 10000)
  return { deltaPct, currentAmount, cumulativeValue }
}
