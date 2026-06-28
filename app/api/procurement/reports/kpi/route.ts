/**
 * GET /api/procurement/reports/kpi
 *
 * Phase 9.1 — Procurement KPI Engine
 *
 * Returns aggregate performance metrics for the active company over a
 * configurable date range. All monetary values are in the company's base
 * currency (ILS unless overridden per PO).
 *
 * ## Metrics returned
 *   avgApprovalTimeDays    — median calendar days from PO created_at → issued_at
 *   pctPosOnBudget         — % of approved/closed POs without escalation flag
 *   costSavingsAmount      — savings where unit_price < market (negative deviation)
 *   pctDeliveredOnTime     — % of closed POs where ALL goods were received by the
 *                            latest supply_date across PO lines. Denominator is
 *                            POs that have at least one line with a supply_date.
 *   totalPOs               — count of POs in the window
 *   totalSpend             — sum of total_amount_gross (committed statuses)
 *   avgPoValue             — totalSpend / totalPOs
 *   draftCount / pendingCount / approvedCount / closedCount / cancelledCount
 *   releaseOrderCount      — POs where is_release_order = true
 *   maverickCount          — POs without a contract (not on framework)
 *
 * ## Query params
 *   ?from=YYYY-MM-DD   — start of window (default: 12 months ago)
 *   ?to=YYYY-MM-DD     — end of window (default: today)
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Statuses that represent "committed" spend (not DRAFT / CANCELLED)
const SPEND_STATUSES = [
  "PENDING", "PENDING_APPROVAL", "PENDING_PRICE_APPROVAL", "PENDING_CEO_APPROVAL",
  "APPROVED", "ISSUED", "SENT_TO_SUPPLIER", "ON_SHIP",
  "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "RECEIVED", "CLOSED",
]

// Statuses that count as "approved" (reached the approval milestone)
const APPROVED_STATUSES = [
  "APPROVED", "ISSUED", "SENT_TO_SUPPLIER", "ON_SHIP",
  "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "RECEIVED", "CLOSED",
]

export type ProcurementKpiDto = {
  // ── Four headline KPIs ──────────────────────────────────────────────────
  avgApprovalTimeDays: number | null
  pctPosOnBudget: number | null
  costSavingsAmount: number
  pctDeliveredOnTime: number | null   // % of eligible POs received on/before supply_date
  // ── Volume ──────────────────────────────────────────────────────────────
  totalPOs: number
  totalSpend: number
  avgPoValue: number | null
  // ── Status breakdown ────────────────────────────────────────────────────
  draftCount: number
  pendingCount: number
  approvedCount: number
  closedCount: number
  cancelledCount: number
  // ── Phase 8 insights ────────────────────────────────────────────────────
  releaseOrderCount: number
  maverickCount: number
  releaseOrderSpend: number
  maverickSpend: number
  // ── Period ──────────────────────────────────────────────────────────────
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

export async function GET(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const from = req.nextUrl.searchParams.get("from") || defaultFrom()
  const to = req.nextUrl.searchParams.get("to") || defaultTo()
  const toEndOfDay = `${to}T23:59:59.999Z`

  // ── 1. Fetch all POs in the window ────────────────────────────────────────
  const { data: pos, error: posErr } = await supabase
    .from("erp_purchase_orders")
    .select(
      "id,status,total_amount_gross,total_amount_net,created_at,issued_at," +
      "requires_po_escalation,contract_id,is_release_order",
    )
    .eq("company_id", activeCompanyId)
    .gte("created_at", from)
    .lte("created_at", toEndOfDay)

  if (posErr) {
    return NextResponse.json({ error: posErr.message }, { status: 500 })
  }

  type PoKpiRow = {
    id: string
    status: string
    total_amount_gross: number | null
    total_amount_net: number | null
    created_at: string
    issued_at: string | null
    requires_po_escalation: boolean
    contract_id: string | null
    is_release_order: boolean
  }

  const allPos = (pos ?? []) as unknown as PoKpiRow[]
  const totalPOs = allPos.length

  // ── 2. Status breakdown ───────────────────────────────────────────────────
  const draftCount = allPos.filter((p) => p.status === "DRAFT").length
  const pendingCount = allPos.filter((p) =>
    ["PENDING", "PENDING_APPROVAL", "PENDING_PRICE_APPROVAL", "PENDING_CEO_APPROVAL"].includes(p.status as string)
  ).length
  const approvedCount = allPos.filter((p) =>
    APPROVED_STATUSES.includes(p.status as string)
  ).length
  const closedCount = allPos.filter((p) =>
    ["CLOSED", "FULLY_RECEIVED", "RECEIVED"].includes(p.status as string)
  ).length
  const cancelledCount = allPos.filter((p) =>
    ["CANCELLED", "CANCELED", "REJECTED"].includes(p.status as string)
  ).length

  // ── 3. Total spend (approved/committed) ───────────────────────────────────
  const spendPos = allPos.filter((p) => SPEND_STATUSES.includes(p.status as string))
  const totalSpend = spendPos.reduce(
    (sum, p) => sum + Number(p.total_amount_gross ?? p.total_amount_net ?? 0),
    0,
  )
  const avgPoValue = spendPos.length > 0 ? totalSpend / spendPos.length : null

  // ── 4. % POs on budget ────────────────────────────────────────────────────
  // "On budget" = did not trigger requires_po_escalation (no excessive deviation)
  const closedOrApprovedPos = allPos.filter((p) =>
    ["APPROVED", "ISSUED", "SENT_TO_SUPPLIER", "PARTIALLY_RECEIVED",
     "FULLY_RECEIVED", "RECEIVED", "CLOSED"].includes(p.status as string)
  )
  const onBudgetCount = closedOrApprovedPos.filter(
    (p) => !(p.requires_po_escalation as boolean)
  ).length
  const pctPosOnBudget =
    closedOrApprovedPos.length > 0
      ? Math.round((onBudgetCount / closedOrApprovedPos.length) * 10000) / 100
      : null

  // ── 5. Avg approval time ──────────────────────────────────────────────────
  // Approx: issued_at (date) - created_at (timestamptz) in days.
  // Only counts POs that reached ISSUED/APPROVED status.
  const approvalTimes: number[] = []
  for (const po of allPos) {
    const issuedAt = po.issued_at as string | null
    const createdAt = po.created_at as string
    if (!issuedAt) continue
    const ms = new Date(issuedAt).getTime() - new Date(createdAt).getTime()
    const days = ms / (1000 * 60 * 60 * 24)
    if (days >= 0 && days < 365) approvalTimes.push(days)
  }
  let avgApprovalTimeDays: number | null = null
  if (approvalTimes.length > 0) {
    approvalTimes.sort((a, b) => a - b)
    const mid = Math.floor(approvalTimes.length / 2)
    // Median is more robust than mean for approval times
    avgApprovalTimeDays =
      approvalTimes.length % 2 === 0
        ? Math.round(((approvalTimes[mid - 1]! + approvalTimes[mid]!) / 2) * 10) / 10
        : Math.round(approvalTimes[mid]! * 10) / 10
  }

  // ── 6. Cost savings from PO lines ─────────────────────────────────────────
  // Lines with negative price_deviation_pct → we paid below market price
  const poIds = allPos.map((p) => p.id as string)
  let costSavingsAmount = 0
  if (poIds.length > 0) {
    const { data: lines } = await supabase
      .from("erp_purchase_order_lines")
      .select("quantity,unit_price,price_deviation_pct")
      .eq("company_id", activeCompanyId)
      .in("purchase_order_id", poIds)
      .not("price_deviation_pct", "is", null)
      .lt("price_deviation_pct", 0) // negative = below market = saving

    for (const line of lines ?? []) {
      const qty = Number(line.quantity ?? 0)
      const unitPrice = Number(line.unit_price ?? 0)
      const devPct = Number(line.price_deviation_pct ?? 0)
      // Saving = what we would have paid at market - what we paid
      // market_price = unitPrice / (1 + devPct/100)
      const marketPrice = unitPrice / (1 + devPct / 100)
      costSavingsAmount += (marketPrice - unitPrice) * qty
    }
    costSavingsAmount = Math.round(costSavingsAmount * 100) / 100
  }

  // ── 7. On-time delivery ───────────────────────────────────────────────────
  // Eligible POs: closed/received and have at least one line with a supply_date.
  // "On time" = the last GR receipt_date for that PO ≤ max(supply_date) on its lines.
  let pctDeliveredOnTime: number | null = null
  const closedPoIds = allPos
    .filter((p) =>
      ["FULLY_RECEIVED", "RECEIVED", "CLOSED", "PARTIALLY_RECEIVED"].includes(p.status as string)
    )
    .map((p) => p.id as string)

  if (closedPoIds.length > 0) {
    // Fetch PO lines with supply_date for closed POs
    const { data: lineRows } = await supabase
      .from("erp_purchase_order_lines")
      .select("purchase_order_id,supply_date")
      .eq("company_id", activeCompanyId)
      .in("purchase_order_id", closedPoIds)
      .not("supply_date", "is", null)

    // Fetch GR headers for closed POs (last receipt per PO)
    const { data: grRows } = await supabase
      .from("erp_goods_receipts")
      .select("purchase_order_id,receipt_date")
      .eq("company_id", activeCompanyId)
      .in("purchase_order_id", closedPoIds)
      .not("receipt_date", "is", null)

    if (lineRows && grRows) {
      // Build map: poId → max supply_date across lines
      const supplyDateByPo = new Map<string, string>()
      for (const row of lineRows) {
        const pid = row.purchase_order_id as string
        const sd = row.supply_date as string
        const existing = supplyDateByPo.get(pid)
        if (!existing || sd > existing) supplyDateByPo.set(pid, sd)
      }

      // Build map: poId → max receipt_date across GRs
      const receiptDateByPo = new Map<string, string>()
      for (const row of grRows) {
        const pid = row.purchase_order_id as string
        const rd = row.receipt_date as string
        const existing = receiptDateByPo.get(pid)
        if (!existing || rd > existing) receiptDateByPo.set(pid, rd)
      }

      // Evaluate each eligible PO (has both a supply_date and at least one GR)
      let eligibleCount = 0
      let onTimeCount = 0
      for (const [poId, supplyDate] of supplyDateByPo) {
        const receiptDate = receiptDateByPo.get(poId)
        if (!receiptDate) continue // no GR yet → skip
        eligibleCount++
        if (receiptDate <= supplyDate) onTimeCount++
      }

      if (eligibleCount > 0) {
        pctDeliveredOnTime = Math.round((onTimeCount / eligibleCount) * 10000) / 100
      }
    }
  }

  // ── 8. Release order vs maverick metrics ──────────────────────────────────
  const releaseOrders = allPos.filter((p) => p.is_release_order === true)
  const maverickPos = spendPos.filter((p) => !p.is_release_order && !p.contract_id)

  const releaseOrderCount = releaseOrders.length
  const maverickCount = maverickPos.length
  const releaseOrderSpend = releaseOrders
    .filter((p) => SPEND_STATUSES.includes(p.status as string))
    .reduce((sum, p) => sum + Number(p.total_amount_gross ?? p.total_amount_net ?? 0), 0)
  const maverickSpend = maverickPos.reduce(
    (sum, p) => sum + Number(p.total_amount_gross ?? p.total_amount_net ?? 0),
    0,
  )

  const dto: ProcurementKpiDto = {
    avgApprovalTimeDays,
    pctPosOnBudget,
    costSavingsAmount,
    pctDeliveredOnTime,
    totalPOs,
    totalSpend: Math.round(totalSpend * 100) / 100,
    avgPoValue: avgPoValue !== null ? Math.round(avgPoValue * 100) / 100 : null,
    draftCount,
    pendingCount,
    approvedCount,
    closedCount,
    cancelledCount,
    releaseOrderCount,
    maverickCount,
    releaseOrderSpend: Math.round(releaseOrderSpend * 100) / 100,
    maverickSpend: Math.round(maverickSpend * 100) / 100,
    periodFrom: from,
    periodTo: to,
  }

  return NextResponse.json({ data: dto })
}
