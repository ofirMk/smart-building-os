/**
 * Sprint T7a — Tax-invoice pure helpers.
 *
 * IMPORTANT — DO NOT add `"use server"` to this file.
 *
 * The sibling `t7-tax-invoice-actions.ts` is a Server Actions module (Next.js
 * RSC), which means **every export from it must be an async function**. Pure
 * sync helpers like `computeTaxInvoiceTotals` and `sha256Hex` therefore have
 * to live in a separate, plain ESM module that can be imported by BOTH the
 * server actions AND the client-side composer for live preview calculations.
 *
 * This file is the canonical home for those helpers. The actions module
 * re-uses them internally; client components import them directly.
 */

// ---------------------------------------------------------------------------
// Rounding primitives — used everywhere in the tax-invoice math.
// ---------------------------------------------------------------------------

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

// ---------------------------------------------------------------------------
// Totals waterfall — deterministic + unit-testable.
// ---------------------------------------------------------------------------

export interface TaxInvoiceTotalsLineInput {
  quantity: number
  unitPriceExcl: number
  discountPct?: number | null
}

export interface TaxInvoiceTotalsArgs {
  lines: TaxInvoiceTotalsLineInput[]
  vatRatePct: number
  globalDiscountPct: number
}

export interface TaxInvoiceTotalsResult {
  subtotalAmount: number
  globalDiscountAmount: number
  subtotalAfterDiscount: number
  vatAmount: number
  grandTotal: number
  perLine: Array<{
    discountAmount: number
    lineTotalExcl: number
    lineTotalIncl: number
    unitPriceIncl: number
  }>
}

/**
 * Compute per-line and document-level numbers given line inputs +
 * header-level globalDiscountPct and vatRatePct. Pure — deterministic and
 * easy to unit-test (T7a behaviour preserved 1:1).
 */
export function computeTaxInvoiceTotals(
  args: TaxInvoiceTotalsArgs,
): TaxInvoiceTotalsResult {
  const perLine = args.lines.map((ln) => {
    const gross = round2(ln.quantity * ln.unitPriceExcl)
    const discountPct = Math.min(Math.max(ln.discountPct ?? 0, 0), 100)
    const discountAmount = round2((gross * discountPct) / 100)
    const lineTotalExcl = round2(gross - discountAmount)
    const unitPriceIncl = round4(ln.unitPriceExcl * (1 + args.vatRatePct / 100))
    const lineTotalIncl = round2(lineTotalExcl * (1 + args.vatRatePct / 100))
    return { discountAmount, lineTotalExcl, lineTotalIncl, unitPriceIncl }
  })

  const subtotalAmount = round2(perLine.reduce((s, l) => s + l.lineTotalExcl, 0))
  const globalPct = Math.min(Math.max(args.globalDiscountPct || 0, 0), 100)
  const globalDiscountAmount = round2((subtotalAmount * globalPct) / 100)
  const subtotalAfterDiscount = round2(subtotalAmount - globalDiscountAmount)
  const vatAmount = round2((subtotalAfterDiscount * args.vatRatePct) / 100)
  const grandTotal = round2(subtotalAfterDiscount + vatAmount)

  return {
    subtotalAmount,
    globalDiscountAmount,
    subtotalAfterDiscount,
    vatAmount,
    grandTotal,
    perLine,
  }
}

// ---------------------------------------------------------------------------
// SHA-256: T7a originally exposed a `sha256Hex` helper here, but it relied on
// `node:crypto` which would have been pulled into client bundles via the
// composer's import of `computeTaxInvoiceTotals`. The helper is no longer
// referenced anywhere (closeTaxInvoiceAction uses `canonicalInvoiceHash` from
// `@/lib/finance/israel-tax-api` for the digital signature), so it was removed
// to keep this module fully isomorphic. Restore via a `node:crypto` import in
// a server-only file if a non-canonical hash variant is ever needed again.
// ---------------------------------------------------------------------------
