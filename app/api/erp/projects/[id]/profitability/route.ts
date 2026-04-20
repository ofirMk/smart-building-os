import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { normalizeRouteParams } from "@/lib/erp/procurement-api"
import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"
import { formatPricingDeltaPercent } from "@/lib/erp/notifications"

const coerceNumberSchema = z.coerce.number()

function n(value: unknown): number {
  const parsed = coerceNumberSchema.parse(value ?? 0)
  if (!Number.isFinite(parsed)) return 0
  return parsed
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString()
}

function addDays(baseIso: string | null, days: number): string | null {
  if (!baseIso) return null
  const base = new Date(baseIso)
  if (Number.isNaN(base.getTime())) return null
  const next = new Date(base)
  next.setUTCDate(next.getUTCDate() + Math.max(0, Math.round(days)))
  return next.toISOString()
}

function dayDiff(startIso: string | null, endIso: string | null): number | null {
  if (!startIso || !endIso) return null
  const start = new Date(startIso)
  const end = new Date(endIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

const profitabilityResponseSchema = z.object({
  budgetVsActual: z.array(
    z.object({
      category: z.enum(["Subcontractors", "Materials", "Overhead"]),
      budget: z.coerce.number(),
      actual: z.coerce.number(),
    })
  ),
  submittedVsApproved: z.object({
    submittedTotal: z.coerce.number(),
    approvedTotal: z.coerce.number(),
    gap: z.coerce.number(),
  }),
  profitMarginHeatmap: z.array(
    z.object({
      subChapter: z.string(),
      expectedRevenue: z.coerce.number(),
      expectedCost: z.coerce.number(),
      lineCount: z.coerce.number(),
      marginPct: z.coerce.number(),
      risk: z.enum(["LOW", "MEDIUM", "HIGH"]),
    })
  ),
  netProfitability: z.coerce.number(),
  totalApprovedClientAmount: z.coerce.number(),
  totalSubcontractorBills: z.coerce.number(),
  directMaterialCosts: z.coerce.number(),
  totalOffsetsAndCommissions: z.coerce.number(),
  offsetExposure: z.coerce.number(),
  currentMarginPct: z.coerce.number(),
  targetMarginPct: z.coerce.number(),
  billingVariance: z.array(
    z.object({
      label: z.string(),
      period: z.string().nullable(),
      submittedTotal: z.coerce.number(),
      approvedTotal: z.coerce.number(),
    })
  ),
  profitabilityScore: z.object({
    currentMarginPct: z.coerce.number(),
    targetMarginPct: z.coerce.number(),
    deltaPctFormatted: z.string(),
  }),
  riskMap: z.object({
    openOffsetsCount: z.coerce.number(),
    openOffsetsAmount: z.coerce.number(),
    highVarianceOverridesCount: z.coerce.number(),
    highestVariancePct: z.string(),
  }),
  healthScore: z.coerce.number(),
  healthScoreBreakdown: z.object({
    marginVsTargetScore: z.coerce.number(),
    cashFlowVelocityScore: z.coerce.number(),
    priceOverrideScore: z.coerce.number(),
  }),
  cashFlowForecast: z.object({
    haircutFactor: z.coerce.number(),
    monthlyApprovedRunRate: z.coerce.number(),
    forecast90d: z.coerce.number(),
    averageApprovalLagDays: z.coerce.number(),
    lookaheadDays: z.coerce.number(),
    totals: z.object({
      confirmedInflow: z.coerce.number(),
      expectedInflow: z.coerce.number(),
      totalInflow: z.coerce.number(),
    }),
    timeline: z.array(
      z.object({
        billId: z.string(),
        billNumber: z.string(),
        contractId: z.string(),
        forecastType: z.enum(["CONFIRMED", "EXPECTED"]),
        amount: z.coerce.number(),
        approvalDate: z.string().nullable(),
        cashArrivalDate: z.string(),
        paymentTermsDays: z.coerce.number(),
      })
    ),
  }),
  subcontractorPerformance: z.array(
    z.object({
      subcontractorId: z.string(),
      subcontractorName: z.string(),
      revenueLeakage: z.coerce.number(),
      overrideCount: z.coerce.number(),
      avgVariancePct: z.coerce.number(),
      historicalSampleCount: z.coerce.number(),
    })
  ),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: projectId } = await normalizeRouteParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const projectCheck = await supabase
    .from("erp_proj_projects")
    .select("id,target_margin_pct")
    .eq("id", projectId)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (projectCheck.error) {
    return NextResponse.json({ error: projectCheck.error.message }, { status: 500 })
  }
  if (!projectCheck.data) {
    return NextResponse.json({ error: "Project not found for active company" }, { status: 404 })
  }

  const contractsRes = await supabase
    .from("erp_client_contracts")
    .select("id,payment_terms_days")
    .eq("company_id", activeCompanyId)
    .eq("project_id", projectId)
  if (contractsRes.error) {
    return NextResponse.json({ error: contractsRes.error.message }, { status: 500 })
  }
  const contractRows = (contractsRes.data ?? []) as Array<{ id: string; payment_terms_days?: number | null }>
  const contractIds = contractRows.map((row) => row.id)
  const paymentTermsByContractId = new Map<string, number>(
    contractRows.map((row) => [row.id, Math.max(0, Math.round(n(row.payment_terms_days ?? 30)))])
  )

  const [budgetRes, poLinesRes, subBillsRes, progressBillsRes, contractLinesRes] = await Promise.all([
    supabase
      .from("erp_project_budget_lines")
      .select("resource_id,budget_sub_chapter,total_budget")
      .eq("company_id", activeCompanyId)
      .eq("project_id", projectId),
    supabase
      .from("erp_purchase_order_lines")
      .select(
        "id,resource_id,budget_sub_chapter,total_price,subcontractor_id,is_offset,item_sku,unit_price,effective_unit_price,quantity,erp_purchase_orders!inner(id,price_override_status,status)"
      )
      .eq("company_id", activeCompanyId)
      .eq("project_id", projectId),
    supabase
      .from("erp_subcontractor_bills")
      .select("submitted_amount,approved_amount,budget_sub_chapter")
      .eq("company_id", activeCompanyId)
      .eq("project_id", projectId),
    contractIds.length > 0
      ? supabase
          .from("erp_client_progress_bills")
          .select(
            "id,client_contract_id,bill_number,status,period_end,created_at,submitted_at,approved_at,submitted_total_amount,approved_total_amount"
          )
          .eq("company_id", activeCompanyId)
          .in("client_contract_id", contractIds)
      : Promise.resolve({ data: [], error: null }),
    contractIds.length > 0
      ? supabase
          .from("erp_client_contract_lines")
          .select("boq_ref,quantity,unit_price,expected_unit_cost,profitability_pct,erp_client_contracts!inner(project_id)")
          .eq("company_id", activeCompanyId)
          .eq("erp_client_contracts.project_id", projectId)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (budgetRes.error) return NextResponse.json({ error: budgetRes.error.message }, { status: 500 })
  if (poLinesRes.error) return NextResponse.json({ error: poLinesRes.error.message }, { status: 500 })
  if (subBillsRes.error) return NextResponse.json({ error: subBillsRes.error.message }, { status: 500 })
  if (progressBillsRes.error) {
    return NextResponse.json({ error: progressBillsRes.error.message }, { status: 500 })
  }
  if (contractLinesRes.error) {
    return NextResponse.json({ error: contractLinesRes.error.message }, { status: 500 })
  }

  const categoryOf = (resourceId: string | null | undefined): "Subcontractors" | "Materials" | "Overhead" => {
    const resource = String(resourceId ?? "").toLowerCase()
    if (resource.includes("sub") || resource.includes("contractor") || resource.includes("קבל")) {
      return "Subcontractors"
    }
    if (
      resource.includes("material") ||
      resource.includes("inventory") ||
      resource.includes("item") ||
      resource.includes("חומר")
    ) {
      return "Materials"
    }
    return "Overhead"
  }

  const categories: Record<"Subcontractors" | "Materials" | "Overhead", { budget: number; actual: number }> =
    {
      Subcontractors: { budget: 0, actual: 0 },
      Materials: { budget: 0, actual: 0 },
      Overhead: { budget: 0, actual: 0 },
    }
  for (const row of budgetRes.data ?? []) {
    const category = categoryOf((row as { resource_id?: string | null }).resource_id)
    categories[category].budget += n((row as { total_budget?: number | null }).total_budget)
  }
  for (const row of poLinesRes.data ?? []) {
    const r = row as {
      resource_id?: string | null
      total_price?: number | null
      subcontractor_id?: string | null
    }
    const category = r.subcontractor_id ? "Subcontractors" : categoryOf(r.resource_id)
    categories[category].actual += n(r.total_price)
  }
  const totalSubcontractorBills = (subBillsRes.data ?? []).reduce(
    (sum, row) =>
      sum +
      n(
        (row as { approved_amount?: number | null; submitted_amount?: number | null })
          .approved_amount ??
          (row as { submitted_amount?: number | null }).submitted_amount
      ),
    0
  )
  for (const row of subBillsRes.data ?? []) {
    categories.Subcontractors.actual += n(
      (row as { approved_amount?: number | null; submitted_amount?: number | null }).approved_amount ??
        (row as { submitted_amount?: number | null }).submitted_amount
    )
  }

  const billingVariance = (progressBillsRes.data ?? []).map((row, idx) => ({
    label: String((row as { bill_number?: string | null }).bill_number ?? `Bill ${idx + 1}`),
    period:
      (row as { period_end?: string | null }).period_end ??
      (row as { created_at?: string | null }).created_at ??
      null,
    submittedTotal: n((row as { submitted_total_amount?: number | null }).submitted_total_amount),
    approvedTotal: n((row as { approved_total_amount?: number | null }).approved_total_amount),
  }))

  const submittedTotal = (progressBillsRes.data ?? []).reduce(
    (sum, row) => sum + n((row as { submitted_total_amount?: number | null }).submitted_total_amount),
    0
  )
  const approvedTotal = (progressBillsRes.data ?? []).reduce(
    (sum, row) => sum + n((row as { approved_total_amount?: number | null }).approved_total_amount),
    0
  )

  const progressBillRows = (progressBillsRes.data ?? []) as Array<{
    id: string
    client_contract_id: string
    bill_number: string | null
    status: "DRAFT" | "SUBMITTED" | "PARTIALLY_APPROVED" | "APPROVED"
    created_at: string | null
    submitted_at: string | null
    approved_at: string | null
    submitted_total_amount: number | null
    approved_total_amount: number | null
  }>
  const recentApprovedForLag = [...progressBillRows]
    .filter((row) => row.status === "APPROVED")
    .filter((row) => row.submitted_at && row.approved_at)
    .sort(
      (a, b) =>
        new Date(b.approved_at ?? b.created_at ?? 0).getTime() -
        new Date(a.approved_at ?? a.created_at ?? 0).getTime()
    )
    .slice(0, 3)
  const averageApprovalLagDaysRaw =
    recentApprovedForLag.length > 0
      ? recentApprovedForLag.reduce((sum, row) => sum + (dayDiff(row.submitted_at, row.approved_at) ?? 0), 0) /
        recentApprovedForLag.length
      : 14
  const averageApprovalLagDays = Number(averageApprovalLagDaysRaw.toFixed(2))

  const recentApprovedForHaircut = [...progressBillRows]
    .filter((row) => row.status === "APPROVED")
    .filter((row) => n(row.submitted_total_amount) > 0)
    .sort(
      (a, b) =>
        new Date(b.approved_at ?? b.created_at ?? 0).getTime() -
        new Date(a.approved_at ?? a.created_at ?? 0).getTime()
    )
    .slice(0, 3)
  const haircutFactorRaw =
    recentApprovedForHaircut.length > 0
      ? recentApprovedForHaircut.reduce((sum, row) => sum + n(row.approved_total_amount), 0) /
        recentApprovedForHaircut.reduce((sum, row) => sum + n(row.submitted_total_amount), 0)
      : submittedTotal > 0
        ? approvedTotal / submittedTotal
        : 0.9
  const haircutFactor = clamp(haircutFactorRaw, 0, 1.2)

  const now = new Date()
  const horizon = new Date(now)
  horizon.setUTCDate(horizon.getUTCDate() + 90)
  const cashFlowTimeline: Array<{
    billId: string
    billNumber: string
    contractId: string
    forecastType: "CONFIRMED" | "EXPECTED"
    amount: number
    approvalDate: string | null
    cashArrivalDate: string
    paymentTermsDays: number
  }> = []

  for (const row of progressBillRows) {
    const paymentTermsDays = paymentTermsByContractId.get(row.client_contract_id) ?? 30
    if (row.status === "APPROVED") {
      const approvalDate = toIsoDate(row.approved_at ?? row.created_at)
      const cashArrivalDate = addDays(approvalDate, paymentTermsDays)
      if (!cashArrivalDate) continue
      const arrivalMs = new Date(cashArrivalDate).getTime()
      if (arrivalMs < now.getTime() || arrivalMs > horizon.getTime()) continue
      cashFlowTimeline.push({
        billId: row.id,
        billNumber: String(row.bill_number ?? row.id.slice(0, 8)),
        contractId: row.client_contract_id,
        forecastType: "CONFIRMED",
        amount: Number(n(row.approved_total_amount).toFixed(2)),
        approvalDate,
        cashArrivalDate,
        paymentTermsDays,
      })
      continue
    }

    if (row.status === "SUBMITTED") {
      const projectedApprovalBase = toIsoDate(
        row.status === "SUBMITTED" ? row.submitted_at ?? row.created_at : row.created_at
      )
      const projectedApprovalDate = addDays(projectedApprovalBase, averageApprovalLagDays)
      const cashArrivalDate = addDays(projectedApprovalDate, paymentTermsDays)
      if (!cashArrivalDate) continue
      const arrivalMs = new Date(cashArrivalDate).getTime()
      if (arrivalMs < now.getTime() || arrivalMs > horizon.getTime()) continue
      cashFlowTimeline.push({
        billId: row.id,
        billNumber: String(row.bill_number ?? row.id.slice(0, 8)),
        contractId: row.client_contract_id,
        forecastType: "EXPECTED",
        amount: Number((n(row.submitted_total_amount) * haircutFactor).toFixed(2)),
        approvalDate: projectedApprovalDate,
        cashArrivalDate,
        paymentTermsDays,
      })
    }
  }
  cashFlowTimeline.sort((a, b) => new Date(a.cashArrivalDate).getTime() - new Date(b.cashArrivalDate).getTime())
  const confirmedInflow = cashFlowTimeline
    .filter((entry) => entry.forecastType === "CONFIRMED")
    .reduce((sum, entry) => sum + entry.amount, 0)
  const expectedInflow = cashFlowTimeline
    .filter((entry) => entry.forecastType === "EXPECTED")
    .reduce((sum, entry) => sum + entry.amount, 0)

  type HeatmapEntry = {
    subChapter: string
    expectedRevenue: number
    expectedCost: number
    lineCount: number
    marginPct: number
    risk: "LOW" | "MEDIUM" | "HIGH"
  }
  const heatmapBySubChapter = new Map<string, HeatmapEntry>()
  for (const row of contractLinesRes.data ?? []) {
    const r = row as {
      boq_ref?: string | null
      quantity?: number | null
      unit_price?: number | null
      expected_unit_cost?: number | null
      profitability_pct?: number | null
    }
    const subChapter = String(r.boq_ref ?? "UNASSIGNED")
    const quantity = n(r.quantity)
    const revenue = quantity * n(r.unit_price)
    const cost = quantity * n(r.expected_unit_cost)
    const current = heatmapBySubChapter.get(subChapter) ?? {
      subChapter,
      expectedRevenue: 0,
      expectedCost: 0,
      lineCount: 0,
      marginPct: 0,
      risk: "LOW" as const,
    }
    current.expectedRevenue += revenue
    current.expectedCost += cost
    current.lineCount += 1
    heatmapBySubChapter.set(subChapter, current)
  }
  for (const entry of heatmapBySubChapter.values()) {
    entry.marginPct =
      entry.expectedRevenue > 0
        ? Number((((entry.expectedRevenue - entry.expectedCost) / entry.expectedRevenue) * 100).toFixed(2))
        : 0
    entry.risk = entry.marginPct < 5 ? "HIGH" : entry.marginPct < 15 ? "MEDIUM" : "LOW"
  }

  const totalApprovedClientAmount = approvedTotal
  const directMaterialCosts = categories.Materials.actual
  const totalOffsetsAndCommissions = 0
  const offsetExposure = (poLinesRes.data ?? []).reduce((sum, row) => {
    const r = row as {
      subcontractor_id?: string | null
      is_offset?: boolean | null
      total_price?: number | null
    }
    if (!r.subcontractor_id || r.is_offset === true) return sum
    return sum + n(r.total_price)
  }, 0)
  const netProfitability =
    n(totalApprovedClientAmount) -
    n(totalSubcontractorBills) -
    n(directMaterialCosts) +
    n(totalOffsetsAndCommissions)
  const currentMarginPct =
    totalApprovedClientAmount > 0
      ? (netProfitability / totalApprovedClientAmount) * 100
      : 0
  const targetMarginPct = n(
    (projectCheck.data as { target_margin_pct?: number | null }).target_margin_pct
  )
  const marginDeltaRatio = (currentMarginPct - targetMarginPct) / 100

  const highVarianceOverridesRes = await supabase
    .from("mo_audit_logs")
    .select("new_data")
    .eq("project_id", projectId)
    .in("table_name", ["erp_purchase_order_lines", "erp_change_orders", "erp_client_contract_lines"])
  if (highVarianceOverridesRes.error) {
    return NextResponse.json({ error: highVarianceOverridesRes.error.message }, { status: 500 })
  }
  const overrideVariances = (highVarianceOverridesRes.data ?? [])
    .map((row) => {
      const newData = (row as { new_data?: Record<string, unknown> | null }).new_data ?? {}
      const entered = n(newData.enteredPrice)
      const effective = n(newData.effectivePrice)
      if (entered <= 0 || effective <= 0) return null
      const variance = (entered - effective) / effective
      return variance > 0.2 ? variance : null
    })
    .filter((value): value is number => value !== null)
  const highestVarianceRatio = overrideVariances.length > 0 ? Math.max(...overrideVariances) : 0

  const poSubcontractorIds = Array.from(
    new Set(
      (poLinesRes.data ?? [])
        .map((row) => (row as { subcontractor_id?: string | null }).subcontractor_id)
        .filter((value): value is string => Boolean(value))
    )
  )
  const poSkus = Array.from(
    new Set(
      (poLinesRes.data ?? [])
        .map((row) => (row as { item_sku?: string | null }).item_sku)
        .filter((value): value is string => Boolean(value))
    )
  )

  const [subcontractorNameRes, itemLookupRes] = await Promise.all([
    poSubcontractorIds.length
      ? supabase
          .from("erp_md_suppliers")
          .select("id,name")
          .eq("company_id", activeCompanyId)
          .in("id", poSubcontractorIds)
      : Promise.resolve({ data: [], error: null }),
    poSkus.length
      ? supabase
          .from("erp_md_items")
          .select("id,item_number,item_name")
          .eq("company_id", activeCompanyId)
          .in("item_number", poSkus)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (subcontractorNameRes.error) {
    return NextResponse.json({ error: subcontractorNameRes.error.message }, { status: 500 })
  }
  if (itemLookupRes.error) {
    return NextResponse.json({ error: itemLookupRes.error.message }, { status: 500 })
  }

  const subcontractorNameById = new Map<string, string>()
  for (const row of subcontractorNameRes.data ?? []) {
    subcontractorNameById.set(
      String((row as { id?: string }).id ?? ""),
      String((row as { name?: string | null }).name ?? "Unknown subcontractor")
    )
  }

  const itemBySku = new Map<string, { id: string; name: string }>()
  for (const row of itemLookupRes.data ?? []) {
    itemBySku.set(String((row as { item_number?: string }).item_number ?? ""), {
      id: String((row as { id?: string }).id ?? ""),
      name: String((row as { item_name?: string | null }).item_name ?? ""),
    })
  }

  const historicalByItemId = new Map<string, { avgPrice: number; sampleCount: number }>()
  for (const [_, item] of itemBySku) {
    const statsRes = await supabase.rpc("erp_get_historical_price_stats", {
      p_item_id: item.id,
      p_company_id: activeCompanyId,
    })
    if (statsRes.error) continue
    const statsRow = ((statsRes.data ?? [])[0] ?? null) as
      | { avg_price?: number | null; sample_count?: number | null }
      | null
    historicalByItemId.set(item.id, {
      avgPrice: n(statsRow?.avg_price),
      sampleCount: Math.round(n(statsRow?.sample_count)),
    })
  }

  type SubcontractorPerformanceAccumulator = {
    subcontractorId: string
    subcontractorName: string
    revenueLeakage: number
    overrideCount: number
    variancePctTotal: number
    historicalSampleCountTotal: number
  }
  const subcontractorAccumulator = new Map<string, SubcontractorPerformanceAccumulator>()
  const historicalVarianceRatios: number[] = []
  for (const row of poLinesRes.data ?? []) {
    const line = row as {
      subcontractor_id?: string | null
      item_sku?: string | null
      unit_price?: number | null
      effective_unit_price?: number | null
      quantity?: number | null
      erp_purchase_orders?: { price_override_status?: string | null } | null
    }
    const priceOverrideStatus = String(line.erp_purchase_orders?.price_override_status ?? "NONE")
    if (priceOverrideStatus !== "APPROVED") continue
    if (!line.subcontractor_id) continue
    const item = line.item_sku ? itemBySku.get(line.item_sku) : null
    const historical = item ? historicalByItemId.get(item.id) : null
    const baselinePrice = n(historical?.avgPrice) || n(line.effective_unit_price)
    if (baselinePrice <= 0) continue

    const enteredPrice = n(line.unit_price)
    const variancePct = baselinePrice > 0 ? ((enteredPrice - baselinePrice) / baselinePrice) * 100 : 0
    if (variancePct <= 0) continue

    const leakage = (enteredPrice - baselinePrice) * n(line.quantity)
    if (leakage <= 0) continue
    historicalVarianceRatios.push((enteredPrice - baselinePrice) / baselinePrice)

    const current = subcontractorAccumulator.get(line.subcontractor_id) ?? {
      subcontractorId: line.subcontractor_id,
      subcontractorName:
        subcontractorNameById.get(line.subcontractor_id) ?? "Unknown subcontractor",
      revenueLeakage: 0,
      overrideCount: 0,
      variancePctTotal: 0,
      historicalSampleCountTotal: 0,
    }
    current.revenueLeakage += leakage
    current.overrideCount += 1
    current.variancePctTotal += variancePct
    current.historicalSampleCountTotal += Math.round(n(historical?.sampleCount))
    subcontractorAccumulator.set(line.subcontractor_id, current)
  }

  const subcontractorPerformance = Array.from(subcontractorAccumulator.values())
    .map((entry) => ({
      subcontractorId: entry.subcontractorId,
      subcontractorName: entry.subcontractorName,
      revenueLeakage: Number(entry.revenueLeakage.toFixed(2)),
      overrideCount: entry.overrideCount,
      avgVariancePct:
        entry.overrideCount > 0
          ? Number((entry.variancePctTotal / entry.overrideCount).toFixed(2))
          : 0,
      historicalSampleCount: entry.historicalSampleCountTotal,
    }))
    .sort((a, b) => b.revenueLeakage - a.revenueLeakage)

  const marginVsTargetScore =
    targetMarginPct > 0
      ? clamp((currentMarginPct / targetMarginPct) * 100, 0, 100)
      : clamp(currentMarginPct + 50, 0, 100)
  const cashFlowVelocityScore = clamp(haircutFactor * 100, 0, 100)
  const totalLeakage = subcontractorPerformance.reduce((sum, row) => sum + row.revenueLeakage, 0)
  const leakagePressurePct =
    totalApprovedClientAmount > 0 ? (totalLeakage / totalApprovedClientAmount) * 100 : 0
  const highVarianceHistoricalCount = historicalVarianceRatios.filter((ratio) => ratio > 0.2).length
  const historicalVariancePenaltyPct =
    historicalVarianceRatios.length > 0
      ? (highVarianceHistoricalCount / historicalVarianceRatios.length) * 100
      : 0
  const priceOverrideScore = clamp(100 - leakagePressurePct * 2.5 - historicalVariancePenaltyPct * 0.9, 0, 100)
  const healthScore = clamp(
    marginVsTargetScore * 0.4 + cashFlowVelocityScore * 0.3 + priceOverrideScore * 0.3,
    0,
    100
  )
  const monthlyApprovedRunRate =
    billingVariance.length > 0 ? approvedTotal / billingVariance.length : approvedTotal
  const forecast90d = confirmedInflow + expectedInflow

  const responsePayload = profitabilityResponseSchema.parse({
    budgetVsActual: [
      { category: "Subcontractors", budget: categories.Subcontractors.budget, actual: categories.Subcontractors.actual },
      { category: "Materials", budget: categories.Materials.budget, actual: categories.Materials.actual },
      { category: "Overhead", budget: categories.Overhead.budget, actual: categories.Overhead.actual },
    ],
    submittedVsApproved: {
      submittedTotal,
      approvedTotal,
      gap: submittedTotal - approvedTotal,
    },
    profitMarginHeatmap: Array.from(heatmapBySubChapter.values()).sort((a, b) =>
      a.subChapter.localeCompare(b.subChapter)
    ),
    netProfitability: Number(netProfitability.toFixed(2)),
    totalApprovedClientAmount: Number(totalApprovedClientAmount.toFixed(2)),
    totalSubcontractorBills: Number(totalSubcontractorBills.toFixed(2)),
    directMaterialCosts: Number(directMaterialCosts.toFixed(2)),
    totalOffsetsAndCommissions: Number(totalOffsetsAndCommissions.toFixed(2)),
    offsetExposure: Number(offsetExposure.toFixed(2)),
    currentMarginPct: Number(currentMarginPct.toFixed(2)),
    targetMarginPct: Number(targetMarginPct.toFixed(2)),
    profitabilityScore: {
      currentMarginPct: Number(currentMarginPct.toFixed(1)),
      targetMarginPct: Number(targetMarginPct.toFixed(1)),
      deltaPctFormatted: formatPricingDeltaPercent(marginDeltaRatio),
    },
    riskMap: {
      openOffsetsCount: (poLinesRes.data ?? []).filter((row) => {
        const r = row as { subcontractor_id?: string | null; is_offset?: boolean | null }
        return Boolean(r.subcontractor_id) && r.is_offset !== true
      }).length,
      openOffsetsAmount: Number(offsetExposure.toFixed(2)),
      highVarianceOverridesCount: overrideVariances.length,
      highestVariancePct: formatPricingDeltaPercent(highestVarianceRatio),
    },
    billingVariance,
    healthScore: Number(healthScore.toFixed(2)),
    healthScoreBreakdown: {
      marginVsTargetScore: Number(marginVsTargetScore.toFixed(2)),
      cashFlowVelocityScore: Number(cashFlowVelocityScore.toFixed(2)),
      priceOverrideScore: Number(priceOverrideScore.toFixed(2)),
    },
    cashFlowForecast: {
      haircutFactor: Number(haircutFactor.toFixed(4)),
      monthlyApprovedRunRate: Number(monthlyApprovedRunRate.toFixed(2)),
      forecast90d: Number(forecast90d.toFixed(2)),
      averageApprovalLagDays,
      lookaheadDays: 90,
      totals: {
        confirmedInflow: Number(confirmedInflow.toFixed(2)),
        expectedInflow: Number(expectedInflow.toFixed(2)),
        totalInflow: Number((confirmedInflow + expectedInflow).toFixed(2)),
      },
      timeline: cashFlowTimeline,
    },
    subcontractorPerformance,
  })

  return NextResponse.json({
    data: responsePayload,
  })
}
