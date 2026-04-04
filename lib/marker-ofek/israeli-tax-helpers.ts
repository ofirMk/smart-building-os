import { roundMoney } from "@/lib/marker-ofek/partial-account-calc"

/** ניכוי במקור על תשלום — בסיס חישוב לפי סכום לפני ניכוי ואחוז תעודה. */
export function computeWithholdingOnPayment(
  paymentAmountBeforeWithholdingNis: number,
  withholdingRatePercent: number
): { withholdingNis: number; netPaidNis: number } {
  const base = Math.max(0, Number(paymentAmountBeforeWithholdingNis) || 0)
  const pct = Math.min(
    100,
    Math.max(0, Number(withholdingRatePercent) || 0)
  )
  const withholdingNis = roundMoney((base * pct) / 100)
  return {
    withholdingNis,
    netPaidNis: roundMoney(base - withholdingNis),
  }
}
