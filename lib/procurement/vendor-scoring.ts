/**
 * Vendor Scoring Engine — Phase 7.1
 *
 * Computes supplier performance metrics from historical GR + PO data.
 *
 * ## Metrics
 *
 *   on_time_delivery_pct  — % of GR lines delivered on or before the
 *     PO line's supply_date. A GR line is "on time" if its parent GR's
 *     receipt_date ≤ the linked PO line's supply_date.
 *     NULL when fewer than MIN_GRS_FOR_SCORE GRs are available.
 *
 *   quality_score  — % of accepted quantity across all GR lines in
 *     the rolling window:
 *     (SUM(quantity - rejected_qty) / SUM(quantity)) * 100
 *     NULL when no GR lines exist.
 *
 *   price_variance_pct  — average % by which GR line unit_price deviates
 *     from the linked PO line's unit_price:
 *     AVG((gr_unit_price - po_unit_price) / po_unit_price * 100)
 *     NULL when no matched GR↔PO line pairs exist.
 *
 *   avg_lead_time_days  — average calendar days from PO issued_at to
 *     GR receipt_date (only COMPLETED GRs with both dates present).
 *
 * ## Rolling window
 *   Default: 12 months back from "now".  Configurable via periodMonths param.
 *
 * ## Design
 *   - Runs as service-role to bypass RLS.
 *   - Results are written (upserted) into erp_md_supplier_scores for caching.
 *   - The API route calls computeAndCacheScore() on each request and returns
 *     the result — no separate cron required.
 *   - MIN_GRS_FOR_SCORE = 3: below this threshold individual metrics are NULL
 *     to avoid misleading scores based on trivial sample sizes.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

/** Minimum number of evaluated GRs required to produce a non-null metric. */
const MIN_GRS_FOR_SCORE = 3

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type SupplierScore = {
  supplierId: string
  companyId: string
  /** % of GRs received on time. NULL if < MIN_GRS_FOR_SCORE data points. */
  onTimeDeliveryPct: number | null
  /** % of quantity accepted (not rejected). NULL if no GR lines. */
  qualityScore: number | null
  /**
   * Avg % deviation of invoice price from PO price.
   * Positive = overcharged; negative = undercharged.
   * NULL if no matched GR↔PO line pairs.
   */
  priceVariancePct: number | null
  /** Average lead time in calendar days. NULL if < 3 data points. */
  avgLeadTimeDays: number | null
  /** Number of COMPLETED GRs evaluated. */
  totalGrsEvaluated: number
  /** Number of GR lines that had a linked PO supply_date for on-time calc. */
  totalLinesWithDate: number
  /** Rolling window in months. */
  scorePeriodMonths: number
  lastCalculatedAt: string
}

export type ScoreResult =
  | { ok: true; score: SupplierScore }
  | { ok: false; error: string }

// ─────────────────────────────────────────────
// Scoring engine
// ─────────────────────────────────────────────

/**
 * Computes all vendor performance metrics for the given supplier within the
 * rolling window, upserts the result into erp_md_supplier_scores, and returns
 * the computed score.
 */
export async function computeAndCacheScore(params: {
  supplierId: string
  companyId: string
  periodMonths?: number
}): Promise<ScoreResult> {
  const { supplierId, companyId, periodMonths = 12 } = params
  const svc = createSupabaseServiceRoleClient()

  const windowStart = new Date()
  windowStart.setMonth(windowStart.getMonth() - periodMonths)
  const windowStartIso = windowStart.toISOString().split("T")[0]

  // ── 1. Fetch all COMPLETED GRs for this supplier in the window ─────────
  // We join through erp_purchase_orders to filter by supplier_id.
  const { data: grs, error: grsErr } = await svc
    .from("erp_goods_receipts")
    .select(
      `id,
       receipt_date,
       status,
       purchase_order_id,
       erp_purchase_orders!purchase_order_id (
         id,
         issued_at,
         supplier_id
       )`,
    )
    .eq("company_id", companyId)
    .gte("created_at", windowStartIso)
    .in("status", ["FINAL", "COMPLETED"])

  if (grsErr) {
    return { ok: false, error: `GR query failed: ${grsErr.message}` }
  }

  // Filter to this supplier's GRs only (PostgREST doesn't allow nested WHERE
  // on joins without a view; we filter in TS to keep the query simple).
  type PoJoin = { id: string; issued_at: string | null; supplier_id: string } | null
  const supplierGrs = (grs ?? []).filter((gr) => {
    const po = Array.isArray(gr.erp_purchase_orders)
      ? (gr.erp_purchase_orders[0] as PoJoin)
      : (gr.erp_purchase_orders as PoJoin)
    return po?.supplier_id === supplierId
  })

  const totalGrsEvaluated = supplierGrs.length

  // ── 2. Fetch all GR lines for these GRs ───────────────────────────────
  let onTimeDeliveryPct: number | null = null
  let qualityScore: number | null = null
  let priceVariancePct: number | null = null
  let avgLeadTimeDays: number | null = null
  let totalLinesWithDate = 0

  if (totalGrsEvaluated > 0) {
    const grIds = supplierGrs.map((g) => g.id as string)

    const { data: grLines, error: linesErr } = await svc
      .from("erp_goods_receipt_lines")
      .select(
        `id,
         goods_receipt_id,
         purchase_order_line_id,
         quantity,
         rejected_qty,
         unit_price`,
      )
      .eq("company_id", companyId)
      .in("goods_receipt_id", grIds)

    if (linesErr) {
      return { ok: false, error: `GR lines query failed: ${linesErr.message}` }
    }

    const lines = grLines ?? []

    // ── 2a. Quality score ─────────────────────────────────────────────
    // (accepted qty / total qty) * 100 across all lines.
    let totalQty = 0
    let acceptedQty = 0
    for (const l of lines) {
      const qty = Number(l.quantity ?? 0)
      const rejected = Number((l as { rejected_qty?: number | null }).rejected_qty ?? 0)
      totalQty += qty
      acceptedQty += Math.max(0, qty - rejected)
    }
    if (totalQty > 0) {
      qualityScore = Math.min(100, Math.round((acceptedQty / totalQty) * 10000) / 100)
    }

    // ── 2b. Price variance & on-time delivery (require PO line join) ────
    const poLineIds = lines
      .map((l) => l.purchase_order_line_id as string | null)
      .filter((id): id is string => id !== null)

    if (poLineIds.length > 0) {
      const { data: poLines, error: poLinesErr } = await svc
        .from("erp_purchase_order_lines")
        .select("id, unit_price, supply_date")
        .eq("company_id", companyId)
        .in("id", poLineIds)

      if (!poLinesErr && poLines) {
        const poLineMap = new Map(
          (poLines as Array<{ id: string; unit_price: number | string; supply_date: string | null }>)
            .map((p) => [p.id, p]),
        )

        // Price variance
        const variances: number[] = []
        for (const l of lines) {
          if (!l.purchase_order_line_id) continue
          const pol = poLineMap.get(l.purchase_order_line_id as string)
          if (!pol) continue
          const poPrice = Number(pol.unit_price)
          if (poPrice <= 0) continue
          const grPrice = Number(l.unit_price)
          variances.push(((grPrice - poPrice) / poPrice) * 100)
        }
        if (variances.length > 0) {
          const sum = variances.reduce((a, b) => a + b, 0)
          priceVariancePct = Math.round((sum / variances.length) * 10000) / 10000
        }

        // On-time delivery — per GR line against its PO line supply_date.
        // A GR is "on time" if receipt_date ≤ supply_date.
        const grReceiptMap = new Map(
          supplierGrs.map((g) => [g.id as string, g.receipt_date as string | null]),
        )
        let onTimeCount = 0
        let totalWithDate = 0
        for (const l of lines) {
          if (!l.purchase_order_line_id) continue
          const pol = poLineMap.get(l.purchase_order_line_id as string)
          if (!pol?.supply_date) continue
          const receiptDate = grReceiptMap.get(l.goods_receipt_id as string)
          if (!receiptDate) continue
          totalWithDate++
          if (receiptDate <= pol.supply_date) onTimeCount++
        }
        totalLinesWithDate = totalWithDate
        if (totalGrsEvaluated >= MIN_GRS_FOR_SCORE && totalWithDate > 0) {
          onTimeDeliveryPct =
            Math.min(100, Math.round((onTimeCount / totalWithDate) * 10000) / 100)
        }
      }
    }

    // ── 2c. Average lead time ─────────────────────────────────────────
    // From PO issued_at to GR receipt_date.
    const leadTimes: number[] = []
    for (const gr of supplierGrs) {
      const receiptDate = gr.receipt_date as string | null
      if (!receiptDate) continue
      const po = Array.isArray(gr.erp_purchase_orders)
        ? (gr.erp_purchase_orders[0] as PoJoin)
        : (gr.erp_purchase_orders as PoJoin)
      const issuedAt = po?.issued_at
      if (!issuedAt) continue
      const ms =
        new Date(receiptDate).getTime() - new Date(issuedAt).getTime()
      const days = ms / (1000 * 60 * 60 * 24)
      if (days >= 0) leadTimes.push(days)
    }
    if (leadTimes.length >= MIN_GRS_FOR_SCORE) {
      const avg = leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length
      avgLeadTimeDays = Math.round(avg * 10) / 10
    }
  }

  // ── 3. Upsert score into cache ─────────────────────────────────────────
  const now = new Date().toISOString()

  const { error: upsertErr } = await svc
    .from("erp_md_supplier_scores")
    .upsert(
      {
        company_id: companyId,
        supplier_id: supplierId,
        on_time_delivery_pct: onTimeDeliveryPct,
        quality_score: qualityScore,
        price_variance_pct: priceVariancePct,
        avg_lead_time_days: avgLeadTimeDays,
        total_grs_evaluated: totalGrsEvaluated,
        total_lines_with_date: totalLinesWithDate,
        score_period_months: periodMonths,
        last_calculated_at: now,
      },
      { onConflict: "company_id,supplier_id" },
    )

  if (upsertErr) {
    // Non-fatal: return the computed score even if caching fails.
    console.error("[vendor-scoring] score upsert failed:", upsertErr.message)
  }

  const score: SupplierScore = {
    supplierId,
    companyId,
    onTimeDeliveryPct,
    qualityScore,
    priceVariancePct,
    avgLeadTimeDays,
    totalGrsEvaluated,
    totalLinesWithDate,
    scorePeriodMonths: periodMonths,
    lastCalculatedAt: now,
  }

  return { ok: true, score }
}

// ─────────────────────────────────────────────
// Stale-cache read (fast path)
// ─────────────────────────────────────────────

/**
 * Reads the cached score without recomputing.
 * Returns null if no cached score exists.
 */
export async function readCachedScore(params: {
  supplierId: string
  companyId: string
}): Promise<SupplierScore | null> {
  const { supplierId, companyId } = params
  const svc = createSupabaseServiceRoleClient()

  const { data } = await svc
    .from("erp_md_supplier_scores")
    .select(
      "supplier_id,company_id,on_time_delivery_pct,quality_score,price_variance_pct,"
      + "avg_lead_time_days,total_grs_evaluated,total_lines_with_date,"
      + "score_period_months,last_calculated_at",
    )
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId)
    .maybeSingle()

  if (!data) return null

  type ScoreRow = {
    supplier_id: string; company_id: string; on_time_delivery_pct: number | null
    quality_score: number | null; price_variance_pct: number | null
    avg_lead_time_days: number | null; total_grs_evaluated: number
    total_lines_with_date: number; score_period_months: number; last_calculated_at: string
  }
  const row = data as unknown as ScoreRow

  return {
    supplierId: row.supplier_id,
    companyId: row.company_id,
    onTimeDeliveryPct: row.on_time_delivery_pct !== null ? Number(row.on_time_delivery_pct) : null,
    qualityScore: row.quality_score !== null ? Number(row.quality_score) : null,
    priceVariancePct: row.price_variance_pct !== null ? Number(row.price_variance_pct) : null,
    avgLeadTimeDays: row.avg_lead_time_days !== null ? Number(row.avg_lead_time_days) : null,
    totalGrsEvaluated: Number(row.total_grs_evaluated ?? 0),
    totalLinesWithDate: Number(row.total_lines_with_date ?? 0),
    scorePeriodMonths: Number(row.score_period_months ?? 12),
    lastCalculatedAt: row.last_calculated_at,
  }
}

// ─────────────────────────────────────────────
// Derived helpers (used by UI)
// ─────────────────────────────────────────────

export type NegotiationSignal = "OVERPRICED" | "FAIRLY_PRICED" | "BELOW_MARKET" | "INSUFFICIENT_DATA"

/**
 * Returns a negotiation advisor signal based on price variance trend.
 *   > +5%  → OVERPRICED     (supplier consistently charges above PO)
 *   -5% .. +5% → FAIRLY_PRICED
 *   < -5%  → BELOW_MARKET   (supplier often discounts vs PO)
 *   null variance → INSUFFICIENT_DATA
 */
export function getNegotiationSignal(priceVariancePct: number | null): NegotiationSignal {
  if (priceVariancePct === null) return "INSUFFICIENT_DATA"
  if (priceVariancePct > 5) return "OVERPRICED"
  if (priceVariancePct < -5) return "BELOW_MARKET"
  return "FAIRLY_PRICED"
}
