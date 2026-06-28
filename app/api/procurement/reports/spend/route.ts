/**
 * GET /api/procurement/reports/spend
 *
 * Phase 9.2 — Spend Analysis Cube
 *
 * Aggregates PO spend by supplier and by project. Also identifies
 * "Maverick Buying" — purchases made outside of framework contracts.
 *
 * ## Response
 *   bySupplier   — [{ supplierId, supplierName, totalSpend, poCount, avgPoValue, isMaverick }]
 *   byProject    — [{ projectId, projectName, totalSpend, poCount }]
 *   topCategories — spend grouped by budget_sub_chapter (top 10)
 *   maverick     — { count, totalSpend, pct } — summary of off-contract spend
 *   monthly      — [{ month: "YYYY-MM", spend: number }] — 12-month trend
 *
 * ## Query params
 *   ?from=YYYY-MM-DD  (default: 12 months ago)
 *   ?to=YYYY-MM-DD    (default: today)
 *   ?minAmount=N      — min spend threshold for maverick alert (default: 10000)
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const COMMITTED_STATUSES = [
  "PENDING", "PENDING_APPROVAL", "PENDING_PRICE_APPROVAL", "PENDING_CEO_APPROVAL",
  "APPROVED", "ISSUED", "SENT_TO_SUPPLIER", "ON_SHIP",
  "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "RECEIVED", "CLOSED",
]

export type SpendByDimension = {
  id: string
  name: string
  totalSpend: number
  poCount: number
  avgPoValue: number
}

export type MaverickSummary = {
  count: number
  totalSpend: number
  pctOfTotal: number
  topSuppliers: Array<{ supplierId: string; supplierName: string; spend: number }>
}

export type MonthlySpendPoint = {
  month: string  // "YYYY-MM"
  spend: number
  poCount: number
}

export type SpendAnalysisDto = {
  bySupplier: SpendByDimension[]
  byProject: SpendByDimension[]
  topCategories: Array<{ category: string; spend: number; poCount: number }>
  maverick: MaverickSummary
  monthly: MonthlySpendPoint[]
  totalSpend: number
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

  // ── 1. Fetch committed POs with supplier + project data ─────────────────
  const { data: pos, error: posErr } = await supabase
    .from("erp_purchase_orders")
    .select(
      "id,status,total_amount_gross,total_amount_net,created_at,supplier_id,project_id," +
      "contract_id,is_release_order," +
      "erp_md_suppliers!supplier_id(id,name)," +
      "erp_proj_projects!project_id(id,name)",
    )
    .eq("company_id", activeCompanyId)
    .in("status", COMMITTED_STATUSES)
    .gte("created_at", from)
    .lte("created_at", toEndOfDay)

  if (posErr) {
    return NextResponse.json({ error: posErr.message }, { status: 500 })
  }

  type SupplierJoin = { id: string; name: string } | Array<{ id: string; name: string }> | null
  type ProjectJoin = { id: string; name: string } | Array<{ id: string; name: string }> | null

  const allPos = (pos ?? []) as Array<{
    id: string
    status: string
    total_amount_gross: number | string | null
    total_amount_net: number | string | null
    created_at: string
    supplier_id: string
    project_id: string
    contract_id: string | null
    is_release_order: boolean | null
    erp_md_suppliers: SupplierJoin
    erp_proj_projects: ProjectJoin
  }>

  function getSpend(po: (typeof allPos)[number]): number {
    return Number(po.total_amount_gross ?? po.total_amount_net ?? 0)
  }

  function pickOne<T>(val: T | T[] | null): T | null {
    if (!val) return null
    if (Array.isArray(val)) return val[0] ?? null
    return val
  }

  const totalSpend = allPos.reduce((sum, p) => sum + getSpend(p), 0)

  // ── 2. Group by supplier ──────────────────────────────────────────────────
  const supplierMap = new Map<string, { name: string; spend: number; count: number }>()
  for (const po of allPos) {
    const supplier = pickOne(po.erp_md_suppliers)
    const sid = po.supplier_id
    const name = supplier?.name ?? "ספק לא ידוע"
    const spend = getSpend(po)
    const prev = supplierMap.get(sid) ?? { name, spend: 0, count: 0 }
    supplierMap.set(sid, { name, spend: prev.spend + spend, count: prev.count + 1 })
  }
  const bySupplier: SpendByDimension[] = Array.from(supplierMap.entries())
    .map(([id, { name, spend, count }]) => ({
      id,
      name,
      totalSpend: Math.round(spend * 100) / 100,
      poCount: count,
      avgPoValue: count > 0 ? Math.round((spend / count) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend)

  // ── 3. Group by project ───────────────────────────────────────────────────
  const projectMap = new Map<string, { name: string; spend: number; count: number }>()
  for (const po of allPos) {
    const project = pickOne(po.erp_proj_projects)
    const pid = po.project_id
    const name = project?.name ?? "פרויקט לא ידוע"
    const spend = getSpend(po)
    const prev = projectMap.get(pid) ?? { name, spend: 0, count: 0 }
    projectMap.set(pid, { name, spend: prev.spend + spend, count: prev.count + 1 })
  }
  const byProject: SpendByDimension[] = Array.from(projectMap.entries())
    .map(([id, { name, spend, count }]) => ({
      id,
      name,
      totalSpend: Math.round(spend * 100) / 100,
      poCount: count,
      avgPoValue: count > 0 ? Math.round((spend / count) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend)

  // ── 4. Top categories (budget_sub_chapter) ────────────────────────────────
  const poIds = allPos.map((p) => p.id)
  const categoryMap = new Map<string, { spend: number; count: number }>()
  if (poIds.length > 0) {
    const { data: lines } = await supabase
      .from("erp_purchase_order_lines")
      .select("budget_sub_chapter,total_price,purchase_order_id")
      .eq("company_id", activeCompanyId)
      .in("purchase_order_id", poIds)

    for (const line of lines ?? []) {
      const cat = (line.budget_sub_chapter as string) || "—"
      const spend = Number(line.total_price ?? 0)
      const prev = categoryMap.get(cat) ?? { spend: 0, count: 0 }
      // Count unique POs per category
      categoryMap.set(cat, { spend: prev.spend + spend, count: prev.count + 1 })
    }
  }
  const topCategories = Array.from(categoryMap.entries())
    .map(([category, { spend, count }]) => ({
      category,
      spend: Math.round(spend * 100) / 100,
      poCount: count,
    }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10)

  // ── 5. Maverick buying (off-contract spend) ───────────────────────────────
  const maverickPos = allPos.filter((p) => !p.contract_id && !p.is_release_order)
  const maverickSpend = maverickPos.reduce((sum, p) => sum + getSpend(p), 0)
  const pctOfTotal = totalSpend > 0 ? (maverickSpend / totalSpend) * 100 : 0

  // Top maverick suppliers
  const maverickSupplierMap = new Map<string, { name: string; spend: number }>()
  for (const po of maverickPos) {
    const supplier = pickOne(po.erp_md_suppliers)
    const sid = po.supplier_id
    const name = supplier?.name ?? "ספק לא ידוע"
    const spend = getSpend(po)
    const prev = maverickSupplierMap.get(sid) ?? { name, spend: 0 }
    maverickSupplierMap.set(sid, { name, spend: prev.spend + spend })
  }
  const topMaverickSuppliers = Array.from(maverickSupplierMap.entries())
    .map(([supplierId, { name, spend }]) => ({
      supplierId,
      supplierName: name,
      spend: Math.round(spend * 100) / 100,
    }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5)

  const maverick: MaverickSummary = {
    count: maverickPos.length,
    totalSpend: Math.round(maverickSpend * 100) / 100,
    pctOfTotal: Math.round(pctOfTotal * 100) / 100,
    topSuppliers: topMaverickSuppliers,
  }

  // ── 6. Monthly spend trend ────────────────────────────────────────────────
  const monthMap = new Map<string, { spend: number; count: number }>()
  for (const po of allPos) {
    const month = (po.created_at as string).slice(0, 7) // "YYYY-MM"
    const spend = getSpend(po)
    const prev = monthMap.get(month) ?? { spend: 0, count: 0 }
    monthMap.set(month, { spend: prev.spend + spend, count: prev.count + 1 })
  }
  const monthly: MonthlySpendPoint[] = Array.from(monthMap.entries())
    .map(([month, { spend, count }]) => ({
      month,
      spend: Math.round(spend * 100) / 100,
      poCount: count,
    }))
    .sort((a, b) => a.month.localeCompare(b.month))

  const dto: SpendAnalysisDto = {
    bySupplier,
    byProject,
    topCategories,
    maverick,
    monthly,
    totalSpend: Math.round(totalSpend * 100) / 100,
    periodFrom: from,
    periodTo: to,
  }

  return NextResponse.json({ data: dto })
}
