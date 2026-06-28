/**
 * GET /api/procurement/reports/variance
 *
 * Phase 9.4 — Price Variance Report
 *
 * Identifies PO lines where the actual unit price deviates more than the
 * configured threshold (default 5%) from the benchmark price.
 *
 * Two sources of variance are unified:
 *   a) Lines with price_deviation_pct != null — deviation from cross-supplier
 *      market price benchmark (Phase 7.5 Smart Pricing engine).
 *   b) Lines with contract_unit_price != null — deviation from the framework
 *      contract locked price (Phase 8.3 price lock).
 *
 * ## Response
 *   rows      — array of VarianceRow sorted by |variancePct| desc
 *   summary   — count, totalVarianceAmount, avgVariancePct, worst
 *   histogram — distribution bucketed at 5%, 10%, 20%, 50%, 100%+
 *
 * ## Query params
 *   ?threshold=5       — minimum |variance %| to include (default: 5)
 *   ?from=YYYY-MM-DD   (default: 12 months ago)
 *   ?to=YYYY-MM-DD     (default: today)
 *   ?direction=over    — "over" (above price), "under" (below), default = both
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export type VarianceRow = {
  poId: string
  poNumber: string
  lineId: string
  description: string
  supplierId: string
  supplierName: string
  projectId: string
  projectName: string
  quantity: number
  uom: string | null
  actualUnitPrice: number
  benchmarkUnitPrice: number
  /** Positive = we paid over benchmark; negative = we paid under */
  variancePct: number
  varianceAmount: number  // total absolute variance: |actual - benchmark| * qty
  source: "MARKET_PRICE" | "CONTRACT_PRICE"
  createdAt: string
  poStatus: string
}

export type VarianceSummaryDto = {
  rows: VarianceRow[]
  summary: {
    totalLines: number
    overpriceLines: number
    underpriceLines: number
    totalOverVarianceAmount: number
    totalUnderVarianceAmount: number
    avgVariancePct: number | null
    worstVariancePct: number | null
  }
  histogram: Array<{ bucket: string; count: number; totalAmount: number }>
  threshold: number
  periodFrom: string
  periodTo: string
}

function defaultFrom(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  return d.toISOString().slice(0, 10)
}

function defaultTo(): string {
  return new Date().toISOString().slice(0, 10)
}

function histogramBucket(absPct: number): string {
  if (absPct < 10) return "5–10%"
  if (absPct < 20) return "10–20%"
  if (absPct < 50) return "20–50%"
  if (absPct < 100) return "50–100%"
  return "100%+"
}

export async function GET(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const from = req.nextUrl.searchParams.get("from") || defaultFrom()
  const to = req.nextUrl.searchParams.get("to") || defaultTo()
  const toEndOfDay = `${to}T23:59:59.999Z`
  const thresholdParam = parseFloat(req.nextUrl.searchParams.get("threshold") ?? "5")
  const threshold = Number.isFinite(thresholdParam) && thresholdParam >= 0 ? thresholdParam : 5
  const direction = req.nextUrl.searchParams.get("direction") ?? "both"

  // ── 1. Fetch PO headers in window ─────────────────────────────────────────
  const { data: pos, error: posErr } = await supabase
    .from("erp_purchase_orders")
    .select(
      "id,po_number,status,created_at,supplier_id,project_id," +
      "erp_md_suppliers!supplier_id(id,name)," +
      "erp_proj_projects!project_id(id,name)",
    )
    .eq("company_id", activeCompanyId)
    .gte("created_at", from)
    .lte("created_at", toEndOfDay)

  if (posErr) {
    return NextResponse.json({ error: posErr.message }, { status: 500 })
  }

  type Join<T> = T | T[] | null
  type Sup = { id: string; name: string }
  type Proj = { id: string; name: string }

  function pickOne<T>(val: T | T[] | null): T | null {
    if (!val) return null
    if (Array.isArray(val)) return val[0] ?? null
    return val
  }

  const poMap = new Map<string, {
    poNumber: string
    status: string
    createdAt: string
    supplierId: string
    supplierName: string
    projectId: string
    projectName: string
  }>()
  for (const po of pos ?? []) {
    const supplier = pickOne(po.erp_md_suppliers as Join<Sup>)
    const project = pickOne(po.erp_proj_projects as Join<Proj>)
    poMap.set(po.id as string, {
      poNumber: po.po_number as string,
      status: po.status as string,
      createdAt: po.created_at as string,
      supplierId: po.supplier_id as string,
      supplierName: supplier?.name ?? "—",
      projectId: po.project_id as string,
      projectName: project?.name ?? "—",
    })
  }

  if (poMap.size === 0) {
    const dto: VarianceSummaryDto = {
      rows: [],
      summary: {
        totalLines: 0, overpriceLines: 0, underpriceLines: 0,
        totalOverVarianceAmount: 0, totalUnderVarianceAmount: 0,
        avgVariancePct: null, worstVariancePct: null,
      },
      histogram: [],
      threshold,
      periodFrom: from,
      periodTo: to,
    }
    return NextResponse.json({ data: dto })
  }

  const poIds = Array.from(poMap.keys())

  // ── 2. Fetch lines with any variance data ──────────────────────────────────
  const { data: lines, error: linesErr } = await supabase
    .from("erp_purchase_order_lines")
    .select(
      "id,purchase_order_id,description,quantity,unit_price,uom," +
      "price_deviation_pct,contract_unit_price,price_override_reason",
    )
    .eq("company_id", activeCompanyId)
    .in("purchase_order_id", poIds)

  if (linesErr) {
    return NextResponse.json({ error: linesErr.message }, { status: 500 })
  }

  // ── 3. Build variance rows ─────────────────────────────────────────────────
  const rows: VarianceRow[] = []

  for (const line of lines ?? []) {
    const poMeta = poMap.get(line.purchase_order_id as string)
    if (!poMeta) continue

    const qty = Number(line.quantity ?? 0)
    const actualUnitPrice = Number(line.unit_price ?? 0)
    const contractUnitPrice = line.contract_unit_price !== null
      ? Number(line.contract_unit_price)
      : null
    const marketDeviationPct = line.price_deviation_pct !== null
      ? Number(line.price_deviation_pct)
      : null

    // Build variance entries — one per available benchmark
    const candidates: Array<{
      benchmarkUnitPrice: number
      variancePct: number
      source: VarianceRow["source"]
    }> = []

    // Contract price benchmark
    if (contractUnitPrice !== null && contractUnitPrice > 0) {
      const pct = ((actualUnitPrice - contractUnitPrice) / contractUnitPrice) * 100
      candidates.push({ benchmarkUnitPrice: contractUnitPrice, variancePct: pct, source: "CONTRACT_PRICE" })
    }

    // Market price benchmark (derived from price_deviation_pct: actual = market * (1 + dev/100))
    if (marketDeviationPct !== null && actualUnitPrice > 0) {
      // market_price = actual / (1 + dev/100)
      const marketPrice = actualUnitPrice / (1 + marketDeviationPct / 100)
      if (marketPrice > 0) {
        candidates.push({ benchmarkUnitPrice: marketPrice, variancePct: marketDeviationPct, source: "MARKET_PRICE" })
      }
    }

    for (const { benchmarkUnitPrice, variancePct, source } of candidates) {
      if (Math.abs(variancePct) < threshold) continue
      if (direction === "over" && variancePct <= 0) continue
      if (direction === "under" && variancePct >= 0) continue

      const varianceAmount = Math.abs(actualUnitPrice - benchmarkUnitPrice) * qty

      rows.push({
        poId: line.purchase_order_id as string,
        poNumber: poMeta.poNumber,
        lineId: line.id as string,
        description: line.description as string,
        supplierId: poMeta.supplierId,
        supplierName: poMeta.supplierName,
        projectId: poMeta.projectId,
        projectName: poMeta.projectName,
        quantity: qty,
        uom: (line.uom as string | null) ?? null,
        actualUnitPrice,
        benchmarkUnitPrice: Math.round(benchmarkUnitPrice * 100) / 100,
        variancePct: Math.round(variancePct * 100) / 100,
        varianceAmount: Math.round(varianceAmount * 100) / 100,
        source,
        createdAt: poMeta.createdAt,
        poStatus: poMeta.status,
      })
    }
  }

  // Sort by |variancePct| descending
  rows.sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct))

  // ── 4. Summary ────────────────────────────────────────────────────────────
  const overpriceRows = rows.filter((r) => r.variancePct > 0)
  const underpriceRows = rows.filter((r) => r.variancePct < 0)
  const allVariancePcts = rows.map((r) => r.variancePct)
  const avgVariancePct =
    allVariancePcts.length > 0
      ? Math.round(
          (allVariancePcts.reduce((a, b) => a + b, 0) / allVariancePcts.length) * 100,
        ) / 100
      : null
  const worstVariancePct =
    rows.length > 0 ? rows[0]!.variancePct : null

  // ── 5. Histogram ──────────────────────────────────────────────────────────
  const histMap = new Map<string, { count: number; totalAmount: number }>()
  for (const row of rows) {
    const bkt = histogramBucket(Math.abs(row.variancePct))
    const prev = histMap.get(bkt) ?? { count: 0, totalAmount: 0 }
    histMap.set(bkt, { count: prev.count + 1, totalAmount: prev.totalAmount + row.varianceAmount })
  }
  const HIST_ORDER = ["5–10%", "10–20%", "20–50%", "50–100%", "100%+"]
  const histogram = HIST_ORDER
    .filter((b) => histMap.has(b))
    .map((bucket) => ({
      bucket,
      count: histMap.get(bucket)!.count,
      totalAmount: Math.round(histMap.get(bucket)!.totalAmount * 100) / 100,
    }))

  const dto: VarianceSummaryDto = {
    rows,
    summary: {
      totalLines: rows.length,
      overpriceLines: overpriceRows.length,
      underpriceLines: underpriceRows.length,
      totalOverVarianceAmount: Math.round(
        overpriceRows.reduce((s, r) => s + r.varianceAmount, 0) * 100,
      ) / 100,
      totalUnderVarianceAmount: Math.round(
        underpriceRows.reduce((s, r) => s + r.varianceAmount, 0) * 100,
      ) / 100,
      avgVariancePct,
      worstVariancePct,
    },
    histogram,
    threshold,
    periodFrom: from,
    periodTo: to,
  }

  return NextResponse.json({ data: dto })
}
