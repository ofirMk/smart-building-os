/**
 * Three-Way Match Engine — lib/procurement/three-way-match.ts
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * LAYER 1 — Pure TypeScript business logic (zero I/O, fully unit-testable)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Standard 3-way match compares three documents:
 *
 *   Purchase Order (PO)  — what was ordered and at what agreed price
 *   Goods Receipt  (GR)  — what was physically received
 *   Vendor Invoice (INV) — what the vendor is billing for
 *
 * For each invoice line the engine checks two axes:
 *   Qty check:   invoicedQty  vs  grReceivedQty  (vendor bills for what arrived)
 *   Price check: invoiceUnitPrice  vs  poUnitPrice  (vendor bills at agreed price)
 *
 * Per-line status (LineMatchStatus):
 *   MATCHED            — both axes within ROUNDING_EPSILON (< 0.01%)
 *   WITHIN_TOLERANCE   — both axes ≤ tolerancePct (default 10 %)
 *   EXCEEDS_TOLERANCE  — either axis > tolerancePct
 *   NO_GR              — no goods receipt line exists for this PO line
 *   NO_INVOICE         — PO line has no corresponding invoice line
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * LAYER 2 — Supabase DB integration (RPC + direct table reads)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   performMatch(supabase, params)          — executes erp_perform_3way_match RPC
 *   fetchMatchSummary(supabase, params)     — reads summary without re-running RPC
 *   fetchMatchLines(supabase, params)       — all match rows for an invoice
 *   canAutoApprove(summary)                 — pure guard (legacy, wraps Layer 1)
 *   resolveInvoiceForPayment(supabase, ...) — full approval workflow
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  ErpInvoiceMatchLineStatus,
  ErpPerform3WayMatchResult,
  ErpVendorInvoiceStatus,
} from "@/types/erp"

// ══════════════════════════════════════════════════════════════════════════════
// LAYER 1 — Pure engine
// ══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

/** Below this percentage variance a line is considered a perfect match. */
export const ROUNDING_EPSILON_PCT = 0.01 // 0.01 % — handles floating-point drift

/** Default tolerance band.  Configurable per call site. */
export const DEFAULT_TOLERANCE_PCT = 10

// ─────────────────────────────────────────────
// Input types (pure-layer DTOs — no DB schema dependency)
// ─────────────────────────────────────────────

/** Minimal PO-line fields required for matching. */
export type PoLineInput = {
  id: string
  orderedQty: number
  /** Agreed unit price on the PO. */
  unitPrice: number
}

/** Goods-receipt line linked to a PO line. */
export type GrLineInput = {
  id: string
  poLineId: string
  receivedQty: number
  /** Actual price recorded on the delivery note (may differ from PO). */
  unitPrice: number
}

/** Vendor-invoice line linked to a PO line. */
export type InvoiceLineInput = {
  id: string
  poLineId: string
  invoicedQty: number
  /** Unit price on the vendor's invoice. */
  unitPrice: number
}

// ─────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────

/** Classification for a single matched triplet. */
export type LineMatchStatus =
  | "MATCHED"            // both axes within ROUNDING_EPSILON (effectively exact)
  | "WITHIN_TOLERANCE"   // both axes ≤ tolerancePct
  | "EXCEEDS_TOLERANCE"  // either axis > tolerancePct
  | "NO_GR"              // no goods-receipt line found for this PO line
  | "NO_INVOICE"         // no invoice line found for this PO line

/** Full diagnostic result for one invoice-line triplet. */
export type LineMatchResult = {
  invoiceLineId: string
  poLineId: string
  grLineId: string | null
  // ── Variance values ────────────────────────
  /** (invoicedQty − grReceivedQty) / grReceivedQty × 100  [absolute %] */
  qtyVariancePct: number
  /** (invoiceUnitPrice − poUnitPrice) / poUnitPrice × 100  [absolute %] */
  priceVariancePct: number
  /** invoicedQty − grReceivedQty */
  qtyVarianceAbs: number
  /** invoiceUnitPrice − poUnitPrice  (signed: + means over-billed) */
  priceVarianceAbs: number
  /** priceVarianceAbs × invoicedQty — financial impact on this line */
  priceImpactValue: number
  // ── Classification ─────────────────────────
  status: LineMatchStatus
}

/** Aggregated match result across all lines of a single invoice. */
export type InvoiceMatchSummary = {
  totalLines: number
  matchedLines: number
  withinToleranceLines: number
  exceedsToleranceLines: number
  noGrLines: number
  noInvoiceLines: number
  totalQtyVarianceAbs: number
  /** Sum of priceImpactValue across all lines (signed). */
  totalPriceImpactValue: number
  /**
   * CLEAN             — all lines MATCHED
   * TOLERANCES_APPLIED — some WITHIN_TOLERANCE, none beyond
   * HAS_EXCEPTIONS    — one or more EXCEEDS_TOLERANCE lines
   * NEEDS_GR          — one or more NO_GR lines
   */
  overallStatus: "CLEAN" | "TOLERANCES_APPLIED" | "HAS_EXCEPTIONS" | "NEEDS_GR"
  /** Convenience flag: invoice can be auto-approved (no exceptions, no missing GR). */
  canAutoApprove: boolean
  lines: LineMatchResult[]
}

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

function round4(n: number): number { return Math.round(n * 10000) / 10000 }
function round2(n: number): number { return Math.round(n * 100) / 100 }

function pctVariance(value: number, reference: number): number {
  if (reference === 0) return value === 0 ? 0 : 100
  return Math.abs((value - reference) / reference) * 100
}

// ─────────────────────────────────────────────
// computeLineMatch — classify a single triplet
// ─────────────────────────────────────────────

/**
 * Classify one invoice-line against its linked PO-line and GR-line.
 *
 * ```ts
 * const result = computeLineMatch({
 *   invoiceLine: { id: "inv-1", poLineId: "po-1", invoicedQty: 10, unitPrice: 100 },
 *   poLine:      { id: "po-1", orderedQty: 10, unitPrice: 100 },
 *   grLine:      { id: "gr-1", poLineId: "po-1", receivedQty: 10, unitPrice: 100 },
 * })
 * // result.status === "MATCHED"
 * ```
 */
export function computeLineMatch(params: {
  invoiceLine: InvoiceLineInput
  poLine: PoLineInput
  /** Pass `null` when no GR line exists for this PO line. */
  grLine: GrLineInput | null
  /** Tolerance percentage. Defaults to DEFAULT_TOLERANCE_PCT (10 %). */
  tolerancePct?: number
}): LineMatchResult {
  const { invoiceLine, poLine, grLine, tolerancePct = DEFAULT_TOLERANCE_PCT } = params

  const priceVarianceAbs = round4(invoiceLine.unitPrice - poLine.unitPrice)
  const priceVariancePct = round4(pctVariance(invoiceLine.unitPrice, poLine.unitPrice))

  if (grLine === null) {
    return {
      invoiceLineId: invoiceLine.id,
      poLineId: poLine.id,
      grLineId: null,
      qtyVariancePct: 100,
      priceVariancePct,
      qtyVarianceAbs: invoiceLine.invoicedQty,
      priceVarianceAbs,
      priceImpactValue: round2(priceVarianceAbs * invoiceLine.invoicedQty),
      status: "NO_GR",
    }
  }

  const qtyVarianceAbs = round4(invoiceLine.invoicedQty - grLine.receivedQty)
  const qtyVariancePct  = round4(pctVariance(invoiceLine.invoicedQty, grLine.receivedQty))
  const priceImpactValue = round2(priceVarianceAbs * invoiceLine.invoicedQty)

  let status: LineMatchStatus
  if (qtyVariancePct <= ROUNDING_EPSILON_PCT && priceVariancePct <= ROUNDING_EPSILON_PCT) {
    status = "MATCHED"
  } else if (qtyVariancePct <= tolerancePct && priceVariancePct <= tolerancePct) {
    status = "WITHIN_TOLERANCE"
  } else {
    status = "EXCEEDS_TOLERANCE"
  }

  return {
    invoiceLineId: invoiceLine.id,
    poLineId: poLine.id,
    grLineId: grLine.id,
    qtyVariancePct,
    priceVariancePct,
    qtyVarianceAbs,
    priceVarianceAbs,
    priceImpactValue,
    status,
  }
}

// ─────────────────────────────────────────────
// computeInvoiceMatch — aggregate across all lines
// ─────────────────────────────────────────────

/**
 * Compute the full three-way match for an entire invoice.
 *
 * Matching is keyed on `poLineId`.  Any invoice line whose `poLineId` is not
 * found in `poLines` is skipped (the caller should ensure referential
 * integrity before calling).
 *
 * PO lines with no corresponding invoice line are counted as NO_INVOICE.
 *
 * @param poLines      All PO lines on the order.
 * @param grLines      All GR lines for the order (may be partial / multi-GR).
 * @param invoiceLines All lines on the vendor invoice being matched.
 * @param tolerancePct Tolerance band in percent. Default: 10.
 */
export function computeInvoiceMatch(params: {
  poLines: PoLineInput[]
  grLines: GrLineInput[]
  invoiceLines: InvoiceLineInput[]
  tolerancePct?: number
}): InvoiceMatchSummary {
  const { poLines, grLines, invoiceLines, tolerancePct = DEFAULT_TOLERANCE_PCT } = params

  // Build lookup maps for O(1) access
  const poById = new Map(poLines.map((p) => [p.id, p]))
  // GR lines: pick the first (or aggregate) per poLineId.
  // Real world may have multiple GR lines per PO line — we sum received quantities.
  const grByPoLineId = new Map<string, GrLineInput & { _receivedQtySum: number }>()
  for (const gr of grLines) {
    const existing = grByPoLineId.get(gr.poLineId)
    if (existing) {
      existing._receivedQtySum += gr.receivedQty
    } else {
      grByPoLineId.set(gr.poLineId, { ...gr, _receivedQtySum: gr.receivedQty })
    }
  }

  // Track which PO lines have been invoiced
  const invoicedPoLineIds = new Set(invoiceLines.map((inv) => inv.poLineId))

  // Match each invoice line
  const lines: LineMatchResult[] = invoiceLines.map((inv) => {
    const po = poById.get(inv.poLineId)
    if (!po) {
      // Invoice references a PO line we don't have — treat as NO_GR (data issue)
      return {
        invoiceLineId: inv.id,
        poLineId: inv.poLineId,
        grLineId: null,
        qtyVariancePct: 100,
        priceVariancePct: 100,
        qtyVarianceAbs: inv.invoicedQty,
        priceVarianceAbs: inv.unitPrice,
        priceImpactValue: round2(inv.unitPrice * inv.invoicedQty),
        status: "NO_GR" as LineMatchStatus,
      }
    }
    const grEntry = grByPoLineId.get(inv.poLineId)
    // Synthesise a consolidated GR line if multiple receipts exist
    const grLine: GrLineInput | null = grEntry
      ? { ...grEntry, receivedQty: grEntry._receivedQtySum }
      : null
    return computeLineMatch({ invoiceLine: inv, poLine: po, grLine, tolerancePct })
  })

  // PO lines with no invoice line
  const noInvoiceLines = poLines.filter((p) => !invoicedPoLineIds.has(p.id)).length

  // Aggregate counts
  let matchedLines = 0
  let withinToleranceLines = 0
  let exceedsToleranceLines = 0
  let noGrLines = 0
  let totalQtyVarianceAbs = 0
  let totalPriceImpactValue = 0

  for (const line of lines) {
    switch (line.status) {
      case "MATCHED":           matchedLines++;           break
      case "WITHIN_TOLERANCE":  withinToleranceLines++;   break
      case "EXCEEDS_TOLERANCE": exceedsToleranceLines++;  break
      case "NO_GR":             noGrLines++;              break
      // NO_INVOICE counted separately (PO-centric)
    }
    totalQtyVarianceAbs    += line.qtyVarianceAbs
    totalPriceImpactValue  += line.priceImpactValue
  }

  // Determine overall status
  let overallStatus: InvoiceMatchSummary["overallStatus"]
  if (noGrLines > 0) {
    overallStatus = "NEEDS_GR"
  } else if (exceedsToleranceLines > 0) {
    overallStatus = "HAS_EXCEPTIONS"
  } else if (withinToleranceLines > 0) {
    overallStatus = "TOLERANCES_APPLIED"
  } else {
    overallStatus = "CLEAN"
  }

  const autoApprove =
    lines.length > 0 &&
    noGrLines === 0 &&
    exceedsToleranceLines === 0 &&
    noInvoiceLines === 0

  return {
    totalLines: lines.length,
    matchedLines,
    withinToleranceLines,
    exceedsToleranceLines,
    noGrLines,
    noInvoiceLines,
    totalQtyVarianceAbs:   round4(totalQtyVarianceAbs),
    totalPriceImpactValue: round2(totalPriceImpactValue),
    overallStatus,
    canAutoApprove: autoApprove,
    lines,
  }
}

// ─────────────────────────────────────────────
// describeVariance — human-readable summary
// ─────────────────────────────────────────────

/**
 * Returns a short Hebrew description of the invoice match summary,
 * suitable for toast messages, audit log entries, or email subjects.
 *
 * Examples:
 *   "3-Way Match: תקין (5 שורות)"
 *   "3-Way Match: 2 שורות חריגות, 1 בתוך סובלנות (5 שורות)"
 *   "3-Way Match: חסרה קבלת סחורה ל-2 שורות"
 */
export function describeVariance(summary: InvoiceMatchSummary): string {
  const total = summary.totalLines
  if (total === 0) return "3-Way Match: אין שורות להשוות"

  if (summary.overallStatus === "NEEDS_GR") {
    return `3-Way Match: חסרה קבלת סחורה ל-${summary.noGrLines} שורה/שורות`
  }
  if (summary.overallStatus === "CLEAN") {
    return `3-Way Match: תקין (${total} שורות)`
  }

  const parts: string[] = []
  if (summary.exceedsToleranceLines > 0)
    parts.push(`${summary.exceedsToleranceLines} שורות חריגות`)
  if (summary.withinToleranceLines > 0)
    parts.push(`${summary.withinToleranceLines} בתוך סובלנות`)

  return `3-Way Match: ${parts.join(", ")} (${total} שורות)`
}

// ══════════════════════════════════════════════════════════════════════════════
// LAYER 2 — Supabase DB integration
// ══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// Legacy DB-backed types (kept for backward compat with existing API routes)
// ─────────────────────────────────────────────

/** DB-backed summary (from RPC or direct table reads). */
export type MatchSummary = {
  invoiceId: string
  invoiceStatus: ErpVendorInvoiceStatus
  totalInvoiceLines: number
  matchedLines: number
  perfectLines: number
  qtyVarianceLines: number
  priceVarianceLines: number
  mixedVarianceLines: number
  unmatchedLines: number
  totalQtyDiff: number
  totalPriceDiffValue: number
  /** true אם כל שורה matched ואין שום variance. */
  isPerfectMatch: boolean
}

export type MatchLine = {
  id: string
  invoiceLineId: string
  poLineId: string
  grLineId: string | null
  invoiceQty: number
  invoiceUnitPrice: number
  poUnitPrice: number
  poOrderedQty: number
  grReceivedQty: number
  qtyDiff: number
  priceDiff: number
  /** price_diff * invoice_qty = ההשפעה הכספית על השורה */
  priceImpactValue: number
  matchStatus: ErpInvoiceMatchLineStatus
  notes: string | null
}

export type ThreeWayMatchResult =
  | { ok: true; summary: MatchSummary }
  | { ok: false; error: string }

// ─────────────────────────────────────────────
// RPC Row shape (snake_case מ-Postgres)
// ─────────────────────────────────────────────

type MatchRpcRow = {
  invoice_id: string
  new_invoice_status: string
  total_invoice_lines: number
  matched_lines: number
  perfect_lines: number
  qty_variance_lines: number
  price_variance_lines: number
  mixed_variance_lines: number
  unmatched_lines: number
  total_qty_diff: number | string
  total_price_diff_value: number | string
}

type MatchLineRow = {
  id: string
  invoice_line_id: string
  po_line_id: string
  gr_line_id: string | null
  invoice_qty: number | string
  invoice_unit_price: number | string
  po_unit_price: number | string
  po_ordered_qty: number | string
  gr_received_qty: number | string
  qty_diff: number | string
  price_diff: number | string
  match_status: ErpInvoiceMatchLineStatus
  notes: string | null
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function rpcRowToSummary(row: MatchRpcRow): MatchSummary {
  const perfectLines = row.perfect_lines
  const totalMatched = row.matched_lines
  const totalLines = row.total_invoice_lines

  return {
    invoiceId: row.invoice_id,
    invoiceStatus: row.new_invoice_status as ErpVendorInvoiceStatus,
    totalInvoiceLines: totalLines,
    matchedLines: totalMatched,
    perfectLines,
    qtyVarianceLines: row.qty_variance_lines,
    priceVarianceLines: row.price_variance_lines,
    mixedVarianceLines: row.mixed_variance_lines,
    unmatchedLines: row.unmatched_lines,
    totalQtyDiff: Number(row.total_qty_diff),
    totalPriceDiffValue: Number(row.total_price_diff_value),
    isPerfectMatch:
      totalLines > 0 &&
      totalMatched === totalLines &&
      perfectLines === totalMatched,
  }
}

function dbLineToMatchLine(row: MatchLineRow): MatchLine {
  const invQty = Number(row.invoice_qty)
  const priceDiff = Number(row.price_diff)
  return {
    id: row.id,
    invoiceLineId: row.invoice_line_id,
    poLineId: row.po_line_id,
    grLineId: row.gr_line_id,
    invoiceQty: invQty,
    invoiceUnitPrice: Number(row.invoice_unit_price),
    poUnitPrice: Number(row.po_unit_price),
    poOrderedQty: Number(row.po_ordered_qty),
    grReceivedQty: Number(row.gr_received_qty),
    qtyDiff: Number(row.qty_diff),
    priceDiff,
    priceImpactValue: Math.round(priceDiff * invQty * 100) / 100,
    matchStatus: row.match_status,
    notes: row.notes,
  }
}

// ─────────────────────────────────────────────
// Core: performMatch
// ─────────────────────────────────────────────

/**
 * מריץ את ה-RPC `erp_perform_3way_match` לחשבונית נתונה.
 *
 * Idempotent — ניתן לקרוא כמה פעמים ללא תופעות לוואי.
 * ה-RPC חוסם על CANCELLED ועל חשבוניות שאין לך גישה אליהן.
 */
export async function performMatch(
  supabase: SupabaseClient,
  params: {
    companyId: string
    invoiceId: string
  }
): Promise<ThreeWayMatchResult> {
  const { invoiceId } = params

  const { data, error } = await supabase.rpc("erp_perform_3way_match", {
    p_invoice_id: invoiceId,
  })

  if (error) {
    return { ok: false, error: `3-Way Match RPC failed: ${error.message}` }
  }

  const rows = (data ?? []) as MatchRpcRow[]
  const row = rows[0]
  if (!row) {
    return { ok: false, error: "RPC החזיר תוצאה ריקה — חשבונית לא נמצאה." }
  }

  return { ok: true, summary: rpcRowToSummary(row) }
}

// ─────────────────────────────────────────────
// Read: fetchMatchSummary
// ─────────────────────────────────────────────

/**
 * קורא את מצב ה-match הנוכחי מהטבלאות ישירות, ללא הרצת RPC.
 * שימושי להצגת status bar, badge, ושאר read-only views.
 */
export async function fetchMatchSummary(
  supabase: SupabaseClient,
  params: {
    companyId: string
    invoiceId: string
  }
): Promise<ThreeWayMatchResult> {
  const { companyId, invoiceId } = params

  // שלב 1: header
  const { data: invData, error: invErr } = await supabase
    .from("erp_vendor_invoices")
    .select("id,status,total_amount,price_variance_amount")
    .eq("id", invoiceId)
    .eq("company_id", companyId)
    .single()

  if (invErr || !invData) {
    return {
      ok: false,
      error: invErr?.message ?? "חשבונית לא נמצאה",
    }
  }

  // שלב 2: ספירת שורות חשבונית
  const { count: totalLines, error: linesErr } = await supabase
    .from("erp_vendor_invoice_lines")
    .select("id", { count: "exact", head: true })
    .eq("vendor_invoice_id", invoiceId)
    .eq("company_id", companyId)

  if (linesErr) {
    return { ok: false, error: `שגיאה בקריאת שורות חשבונית: ${linesErr.message}` }
  }

  // שלב 3: ספירת match rows לפי סטטוס
  const { data: matchRows, error: matchErr } = await supabase
    .from("erp_invoice_po_line_matches")
    .select("match_status,qty_diff,price_diff,invoice_qty")
    .eq("invoice_id", invoiceId)
    .eq("company_id", companyId)

  if (matchErr) {
    return {
      ok: false,
      error: `שגיאה בקריאת match lines: ${matchErr.message}`,
    }
  }

  const rows = (matchRows ?? []) as Array<{
    match_status: ErpInvoiceMatchLineStatus
    qty_diff: number | string
    price_diff: number | string
    invoice_qty: number | string
  }>

  let perfectLines = 0
  let qtyVarianceLines = 0
  let priceVarianceLines = 0
  let mixedVarianceLines = 0
  let totalQtyDiff = 0
  let totalPriceDiffValue = 0

  for (const r of rows) {
    const qtyDiff = Number(r.qty_diff)
    const priceDiff = Number(r.price_diff)
    const invoiceQty = Number(r.invoice_qty)

    totalQtyDiff += qtyDiff
    totalPriceDiffValue += Math.round(priceDiff * invoiceQty * 100) / 100

    switch (r.match_status) {
      case "PERFECT":
        perfectLines++
        break
      case "QTY_VARIANCE":
        qtyVarianceLines++
        break
      case "PRICE_VARIANCE":
        priceVarianceLines++
        break
      case "MIXED_VARIANCE":
        mixedVarianceLines++
        break
    }
  }

  const matchedLines = rows.length
  const total = totalLines ?? 0
  const unmatchedLines = Math.max(0, total - matchedLines)

  const summary: MatchSummary = {
    invoiceId,
    invoiceStatus: invData.status as ErpVendorInvoiceStatus,
    totalInvoiceLines: total,
    matchedLines,
    perfectLines,
    qtyVarianceLines,
    priceVarianceLines,
    mixedVarianceLines,
    unmatchedLines,
    totalQtyDiff: Math.round(totalQtyDiff * 1000) / 1000,
    totalPriceDiffValue: Math.round(totalPriceDiffValue * 100) / 100,
    isPerfectMatch:
      total > 0 && matchedLines === total && perfectLines === matchedLines,
  }

  return { ok: true, summary }
}

// ─────────────────────────────────────────────
// Read: fetchMatchLines
// ─────────────────────────────────────────────

/**
 * מחזיר את כל שורות ה-match לחשבונית, ממוינות לפי match_status
 * (variances ראשונות לצורך UX).
 */
export async function fetchMatchLines(
  supabase: SupabaseClient,
  params: {
    companyId: string
    invoiceId: string
  }
): Promise<{ ok: true; lines: MatchLine[] } | { ok: false; error: string }> {
  const { companyId, invoiceId } = params

  const { data, error } = await supabase
    .from("erp_invoice_po_line_matches")
    .select(
      "id,invoice_line_id,po_line_id,gr_line_id," +
        "invoice_qty,invoice_unit_price,po_unit_price,po_ordered_qty,gr_received_qty," +
        "qty_diff,price_diff,match_status,notes"
    )
    .eq("invoice_id", invoiceId)
    .eq("company_id", companyId)
    .order("match_status", { ascending: true }) // MIXED_VARIANCE < PERFECT < PRICE_VARIANCE < QTY_VARIANCE

  if (error) {
    return { ok: false, error: `fetchMatchLines failed: ${error.message}` }
  }

  const lines = ((data ?? []) as unknown as MatchLineRow[]).map(dbLineToMatchLine)
  return { ok: true, lines }
}

// ─────────────────────────────────────────────
// Pure Guard: canAutoApprove
// ─────────────────────────────────────────────

/**
 * Pure — ללא I/O. Kept for backward compatibility.
 * מחזיר true אם ניתן לאשר את החשבונית אוטומטית.
 *
 * For new code, prefer `InvoiceMatchSummary.canAutoApprove` from the pure layer.
 */
export function canAutoApprove(summary: MatchSummary): boolean {
  return (
    summary.totalInvoiceLines > 0 &&
    summary.unmatchedLines === 0 &&
    summary.qtyVarianceLines === 0 &&
    summary.priceVarianceLines === 0 &&
    summary.mixedVarianceLines === 0
  )
}

// ─────────────────────────────────────────────
// Workflow: resolveInvoiceForPayment
// ─────────────────────────────────────────────

export type ResolveForPaymentResult =
  | { ok: true; finalStatus: ErpVendorInvoiceStatus }
  | { ok: false; error: string }

/**
 * זרימת אישור מלאה לחשבונית:
 *   1. מריץ (re-runs) את ה-3-Way Match לקבל מצב מעודכן.
 *   2. אם `canAutoApprove` — מקדם ל-APPROVED ואז ל-READY_FOR_PAYMENT.
 *   3. אחרת — מחזיר שגיאה עם פירוט הסיבה (variances, unmatched).
 *
 * אישור ידני (כאשר יש variances) — יש לשנות סטטוס ישירות דרך ה-invoice API
 * (`/api/finance/invoices/[id]/approve`) שמוסיף הערת override.
 */
export async function resolveInvoiceForPayment(
  supabase: SupabaseClient,
  params: {
    companyId: string
    invoiceId: string
  }
): Promise<ResolveForPaymentResult> {
  const { companyId, invoiceId } = params

  // שלב 1: match
  const matchResult = await performMatch(supabase, { companyId, invoiceId })
  if (!matchResult.ok) return matchResult

  const { summary } = matchResult

  // שלב 2: guard
  if (!canAutoApprove(summary)) {
    const reasons: string[] = []
    if (summary.unmatchedLines > 0)
      reasons.push(`${summary.unmatchedLines} שורות לא מקושרות ל-PO`)
    if (summary.qtyVarianceLines > 0)
      reasons.push(`${summary.qtyVarianceLines} שורות עם חריגת כמות`)
    if (summary.priceVarianceLines > 0)
      reasons.push(`${summary.priceVarianceLines} שורות עם חריגת מחיר`)
    if (summary.mixedVarianceLines > 0)
      reasons.push(`${summary.mixedVarianceLines} שורות עם חריגה מעורבת`)
    return {
      ok: false,
      error: `לא ניתן לאשר אוטומטית: ${reasons.join("; ")}`,
    }
  }

  // שלב 3: APPROVED
  const { error: approveErr } = await supabase
    .from("erp_vendor_invoices")
    .update({
      status: "APPROVED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId)
    .eq("company_id", companyId)
    .in("status", ["MATCHED"]) // מאפשר רק ממצב MATCHED

  if (approveErr) {
    return {
      ok: false,
      error: `עדכון ל-APPROVED נכשל: ${approveErr.message}`,
    }
  }

  // שלב 4: READY_FOR_PAYMENT
  const { error: readyErr } = await supabase
    .from("erp_vendor_invoices")
    .update({
      status: "READY_FOR_PAYMENT",
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId)
    .eq("company_id", companyId)
    .eq("status", "APPROVED")

  if (readyErr) {
    return {
      ok: false,
      error: `עדכון ל-READY_FOR_PAYMENT נכשל: ${readyErr.message}`,
    }
  }

  return { ok: true, finalStatus: "READY_FOR_PAYMENT" }
}

// ─────────────────────────────────────────────
// Re-export for convenience
// ─────────────────────────────────────────────

export type { ErpPerform3WayMatchResult }
