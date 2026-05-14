"use server"

/**
 * Sprint T8 — Executive Cash-Flow & Financial Cockpit server actions.
 *
 * Real-data only. Every action is read-only, defensively coded so that the
 * dashboard renders gracefully even on a fresh / partially-migrated DB.
 *
 * Source tables:
 *   - AR open / overdue / aging : erp_tax_invoices (status, paid_amount,
 *     grand_total, payment_status, due_date, customer_id, customer_name_at_issue)
 *   - AR inflow                 : erp_ar_receipts (receipt_date, total_amount)
 *   - AP open                   : erp_vendor_invoices (status, total_amount,
 *     paid_amount). Fallback: open erp_purchase_orders (status not in
 *     CLOSED/CANCELLED) when erp_vendor_invoices is empty.
 *   - AP outflow                : erp_ap_payments (payment_date, amount,
 *     status='EXECUTED').
 */

import { createSupabaseServiceRoleClientSafe } from "@/lib/supabase/service-role"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CockpitKpis {
  arOpenTotal: number
  arOverdueTotal: number
  arInvoiceCount: number
  apOpenTotal: number
  apBillCount: number
  cashOnHand: number
  dso: number
  asOf: string
  apSource: "VENDOR_INVOICES" | "PURCHASE_ORDERS_FALLBACK" | "EMPTY"
}

export interface CashFlowPoint {
  date: string
  inflow: number
  outflow: number
  net: number
  cumulative: number
}

export interface TopDebtorRow {
  customerId: string | null
  name: string
  openAmount: number
  overdueAmount: number
  invoiceCount: number
}

export interface AgingBuckets {
  current: number
  d1_30: number
  d31_60: number
  d61_90: number
  d90plus: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : 0
}

function ymd(d: Date): string {
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${d.getFullYear()}-${m < 10 ? "0" : ""}${m}-${day < 10 ? "0" : ""}${day}`
}

function diffDays(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000)
}

// ===========================================================================
// 1. KPIs
// ===========================================================================

export async function getCockpitKpisAction(input: {
  companyId: string
}): Promise<{ ok: true; data: CockpitKpis } | { ok: false; error: string }> {
  const guard = createSupabaseServiceRoleClientSafe()
  if (!guard.ok) return { ok: false, error: guard.error }
  const supabase = guard.client
  const now = new Date()
  const todayStr = ymd(now)
  const ytdStart = ymd(new Date(now.getFullYear(), 0, 1))

  // --- AR side ------------------------------------------------------------
  let arOpenTotal = 0
  let arOverdueTotal = 0
  let arInvoiceCount = 0
  let arRevenueYtd = 0

  const { data: invRows, error: invErr } = await supabase
    .from("erp_tax_invoices")
    .select(
      "id, grand_total, paid_amount, payment_status, status, due_date, issue_date",
    )
    .eq("company_id", input.companyId)
    .neq("status", "CANCELLED")

  if (invErr) {
    console.warn("[t8] erp_tax_invoices read failed:", invErr.message)
  } else {
    for (const r of invRows ?? []) {
      const grand = num((r as { grand_total: unknown }).grand_total)
      const paid = num((r as { paid_amount: unknown }).paid_amount)
      const status = (r as { status: string }).status
      const dueRaw = (r as { due_date: string | null }).due_date
      const issueRaw = (r as { issue_date: string | null }).issue_date
      const open = Math.max(0, grand - paid)

      if (status !== "DRAFT" && status !== "PENDING_ALLOCATION") {
        if (open > 0.005) {
          arOpenTotal += open
          arInvoiceCount += 1
          if (dueRaw && dueRaw < todayStr) {
            arOverdueTotal += open
          }
        }
        if (issueRaw && issueRaw >= ytdStart) {
          arRevenueYtd += grand
        }
      }
    }
  }

  // --- AP side: vendor invoices ------------------------------------------
  let apOpenTotal = 0
  let apBillCount = 0
  let apSource: CockpitKpis["apSource"] = "EMPTY"

  const { data: vendInv, error: vendErr } = await supabase
    .from("erp_vendor_invoices")
    .select("id, total_amount, paid_amount, status")
    .eq("company_id", input.companyId)

  if (vendErr) {
    console.warn("[t8] erp_vendor_invoices read failed:", vendErr.message)
  } else if (vendInv && vendInv.length > 0) {
    for (const r of vendInv) {
      const total = num((r as { total_amount: unknown }).total_amount)
      const paid = num((r as { paid_amount: unknown }).paid_amount)
      const status = (r as { status: string }).status
      if (status === "PAID" || status === "CANCELLED" || status === "VOID") continue
      const open = Math.max(0, total - paid)
      if (open > 0.005) {
        apOpenTotal += open
        apBillCount += 1
      }
    }
    if (apBillCount > 0) apSource = "VENDOR_INVOICES"
  }

  if (apBillCount === 0) {
    // Fallback: open purchase orders (best-effort — schema variations are
    // tolerated; we only read columns guaranteed since the early PO sprints).
    const { data: poRows, error: poErr } = await supabase
      .from("erp_purchase_orders")
      .select("id, total_amount, status")
      .eq("company_id", input.companyId)
    if (poErr) {
      console.warn("[t8] erp_purchase_orders fallback read failed:", poErr.message)
    } else {
      for (const r of poRows ?? []) {
        const status = String((r as { status: unknown }).status ?? "")
        if (
          status === "CLOSED" ||
          status === "CANCELLED" ||
          status === "REJECTED" ||
          status === "DRAFT"
        )
          continue
        const total = num((r as { total_amount: unknown }).total_amount)
        if (total > 0.005) {
          apOpenTotal += total
          apBillCount += 1
        }
      }
      if (apBillCount > 0) apSource = "PURCHASE_ORDERS_FALLBACK"
    }
  }

  // --- Cash on hand (YTD): receipts in − payments out --------------------
  let cashIn = 0
  let cashOut = 0

  const { data: rcptRows, error: rcptErr } = await supabase
    .from("erp_ar_receipts")
    .select("total_amount, receipt_date")
    .eq("company_id", input.companyId)
    .gte("receipt_date", ytdStart)
  if (rcptErr) {
    console.warn("[t8] erp_ar_receipts read failed:", rcptErr.message)
  } else {
    for (const r of rcptRows ?? []) cashIn += num((r as { total_amount: unknown }).total_amount)
  }

  const { data: payRows, error: payErr } = await supabase
    .from("erp_ap_payments")
    .select("amount, payment_date, status")
    .eq("company_id", input.companyId)
    .gte("payment_date", ytdStart)
  if (payErr) {
    console.warn("[t8] erp_ap_payments read failed:", payErr.message)
  } else {
    for (const r of payRows ?? []) {
      const status = (r as { status: string }).status
      if (status === "CANCELLED" || status === "FAILED") continue
      cashOut += num((r as { amount: unknown }).amount)
    }
  }

  const cashOnHand = cashIn - cashOut

  // --- DSO (Days Sales Outstanding) -------------------------------------
  // DSO = (AR Open / Revenue YTD) * days in YTD. Falls back to 0 when no
  // revenue has been booked yet.
  const daysYtd = Math.max(1, diffDays(now, new Date(now.getFullYear(), 0, 1)) + 1)
  const dso = arRevenueYtd > 0 ? Math.round((arOpenTotal / arRevenueYtd) * daysYtd) : 0

  return {
    ok: true,
    data: {
      arOpenTotal: Math.round(arOpenTotal * 100) / 100,
      arOverdueTotal: Math.round(arOverdueTotal * 100) / 100,
      arInvoiceCount,
      apOpenTotal: Math.round(apOpenTotal * 100) / 100,
      apBillCount,
      cashOnHand: Math.round(cashOnHand * 100) / 100,
      dso,
      asOf: now.toISOString(),
      apSource,
    },
  }
}

// ===========================================================================
// 2. Cash-flow series
// ===========================================================================

export async function getCashFlowSeriesAction(input: {
  companyId: string
  days?: number
}): Promise<{ ok: true; data: CashFlowPoint[] } | { ok: false; error: string }> {
  const guard = createSupabaseServiceRoleClientSafe()
  if (!guard.ok) return { ok: false, error: guard.error }
  const supabase = guard.client

  const days = Math.max(1, Math.min(365, input.days ?? 90))
  const now = new Date()
  const start = new Date(now)
  start.setDate(start.getDate() - (days - 1))
  start.setHours(0, 0, 0, 0)
  const startStr = ymd(start)

  // Build a date → {in,out} map.
  const buckets = new Map<string, { inflow: number; outflow: number }>()
  for (let i = 0; i < days; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    buckets.set(ymd(d), { inflow: 0, outflow: 0 })
  }

  const { data: rcptRows, error: rcptErr } = await supabase
    .from("erp_ar_receipts")
    .select("total_amount, receipt_date")
    .eq("company_id", input.companyId)
    .gte("receipt_date", startStr)
  if (rcptErr) console.warn("[t8] receipts series read failed:", rcptErr.message)
  for (const r of rcptRows ?? []) {
    const k = String((r as { receipt_date: unknown }).receipt_date).slice(0, 10)
    const b = buckets.get(k)
    if (b) b.inflow += num((r as { total_amount: unknown }).total_amount)
  }

  const { data: payRows, error: payErr } = await supabase
    .from("erp_ap_payments")
    .select("amount, payment_date, status")
    .eq("company_id", input.companyId)
    .gte("payment_date", startStr)
  if (payErr) console.warn("[t8] ap_payments series read failed:", payErr.message)
  for (const r of payRows ?? []) {
    const status = (r as { status: string }).status
    if (status === "CANCELLED" || status === "FAILED") continue
    const k = String((r as { payment_date: unknown }).payment_date).slice(0, 10)
    const b = buckets.get(k)
    if (b) b.outflow += num((r as { amount: unknown }).amount)
  }

  let cumulative = 0
  const data: CashFlowPoint[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const k = ymd(d)
    const { inflow, outflow } = buckets.get(k) ?? { inflow: 0, outflow: 0 }
    const net = inflow - outflow
    cumulative += net
    data.push({
      date: k,
      inflow: Math.round(inflow * 100) / 100,
      outflow: Math.round(outflow * 100) / 100,
      net: Math.round(net * 100) / 100,
      cumulative: Math.round(cumulative * 100) / 100,
    })
  }

  return { ok: true, data }
}

// ===========================================================================
// 3. Top debtors
// ===========================================================================

export async function getTopDebtorsAction(input: {
  companyId: string
  limit?: number
}): Promise<{ ok: true; data: TopDebtorRow[] } | { ok: false; error: string }> {
  const guard = createSupabaseServiceRoleClientSafe()
  if (!guard.ok) return { ok: false, error: guard.error }
  const supabase = guard.client
  const limit = Math.max(1, Math.min(50, input.limit ?? 5))
  const todayStr = ymd(new Date())

  const { data, error } = await supabase
    .from("erp_tax_invoices")
    .select(
      "customer_id, customer_name_at_issue, grand_total, paid_amount, status, due_date",
    )
    .eq("company_id", input.companyId)
    .neq("status", "CANCELLED")
    .neq("status", "DRAFT")
    .neq("status", "PENDING_ALLOCATION")

  if (error) {
    console.warn("[t8] top debtors read failed:", error.message)
    return { ok: true, data: [] }
  }

  const map = new Map<string, TopDebtorRow>()
  for (const r of data ?? []) {
    const customerId =
      ((r as { customer_id: string | null }).customer_id ?? null) || null
    const name =
      (r as { customer_name_at_issue: string | null }).customer_name_at_issue ??
      "לקוח לא ידוע"
    const grand = num((r as { grand_total: unknown }).grand_total)
    const paid = num((r as { paid_amount: unknown }).paid_amount)
    const due = (r as { due_date: string | null }).due_date
    const open = Math.max(0, grand - paid)
    if (open <= 0.005) continue

    const key = customerId ?? `name:${name}`
    const row = map.get(key) ?? {
      customerId,
      name,
      openAmount: 0,
      overdueAmount: 0,
      invoiceCount: 0,
    }
    row.openAmount += open
    if (due && due < todayStr) row.overdueAmount += open
    row.invoiceCount += 1
    map.set(key, row)
  }

  const rows = Array.from(map.values())
    .map((r) => ({
      ...r,
      openAmount: Math.round(r.openAmount * 100) / 100,
      overdueAmount: Math.round(r.overdueAmount * 100) / 100,
    }))
    .sort((a, b) => b.openAmount - a.openAmount)
    .slice(0, limit)

  return { ok: true, data: rows }
}

// ===========================================================================
// 4. Aging buckets
// ===========================================================================

export async function getAgingBucketsAction(input: {
  companyId: string
}): Promise<{ ok: true; data: AgingBuckets } | { ok: false; error: string }> {
  const guard = createSupabaseServiceRoleClientSafe()
  if (!guard.ok) return { ok: false, error: guard.error }
  const supabase = guard.client
  const now = new Date()

  const { data, error } = await supabase
    .from("erp_tax_invoices")
    .select("grand_total, paid_amount, status, due_date")
    .eq("company_id", input.companyId)
    .neq("status", "CANCELLED")
    .neq("status", "DRAFT")
    .neq("status", "PENDING_ALLOCATION")

  const buckets: AgingBuckets = {
    current: 0,
    d1_30: 0,
    d31_60: 0,
    d61_90: 0,
    d90plus: 0,
  }
  if (error) {
    console.warn("[t8] aging read failed:", error.message)
    return { ok: true, data: buckets }
  }

  for (const r of data ?? []) {
    const grand = num((r as { grand_total: unknown }).grand_total)
    const paid = num((r as { paid_amount: unknown }).paid_amount)
    const due = (r as { due_date: string | null }).due_date
    const open = Math.max(0, grand - paid)
    if (open <= 0.005) continue

    if (!due) {
      buckets.current += open
      continue
    }
    const dueDt = new Date(`${due}T00:00:00`)
    const overdueDays = diffDays(now, dueDt)
    if (overdueDays <= 0) buckets.current += open
    else if (overdueDays <= 30) buckets.d1_30 += open
    else if (overdueDays <= 60) buckets.d31_60 += open
    else if (overdueDays <= 90) buckets.d61_90 += open
    else buckets.d90plus += open
  }

  return {
    ok: true,
    data: {
      current: Math.round(buckets.current * 100) / 100,
      d1_30: Math.round(buckets.d1_30 * 100) / 100,
      d31_60: Math.round(buckets.d31_60 * 100) / 100,
      d61_90: Math.round(buckets.d61_90 * 100) / 100,
      d90plus: Math.round(buckets.d90plus * 100) / 100,
    },
  }
}
