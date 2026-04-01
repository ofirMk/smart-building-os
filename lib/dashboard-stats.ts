import {
  addDays,
  addMonths,
  format,
  startOfDay,
  startOfMonth,
} from "date-fns"
import { TZDate } from "@date-fns/tz"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export { formatNisHe } from "@/lib/format-nis"

/** מדדי דשבורד ראשיים — ‎RPC ‎dashboard_stats‎ (או גיבוי שאילתות) */
export type DashboardRpcMetrics = {
  totalTenants: number
  openTickets: number
  pendingMaintenance: number
  /** סכום חובות בשקלים (חשבוניות pending) */
  unpaidInvoices: number
}

/** כרטיסי משנה בדשבורד (לא ב-RPC) */
export type SecondaryDashboardStats = {
  buildings: number
  evKwhMonth: number
  amenityBookingsToday: number
}

const TZ_IL = "Asia/Jerusalem"

function jerusalemDayBoundsUtc(ref: Date = new Date()): {
  start: string
  endExclusive: string
} {
  const z = new TZDate(ref.getTime(), TZ_IL)
  const dayStart = startOfDay(z)
  const nextLocalDay = addDays(dayStart, 1)
  return {
    start: dayStart.toISOString(),
    endExclusive: nextLocalDay.toISOString(),
  }
}

function jerusalemMonthBoundsUtc(ref: Date = new Date()): {
  start: string
  endExclusive: string
} {
  const z = new TZDate(ref.getTime(), TZ_IL)
  const monthStart = startOfMonth(z)
  const nextMonthStart = addMonths(monthStart, 1)
  return {
    start: monthStart.toISOString(),
    endExclusive: nextMonthStart.toISOString(),
  }
}

const ZERO_RPC: DashboardRpcMetrics = {
  totalTenants: 0,
  openTickets: 0,
  pendingMaintenance: 0,
  unpaidInvoices: 0,
}

const ZERO_SECONDARY: SecondaryDashboardStats = {
  buildings: 0,
  evKwhMonth: 0,
  amenityBookingsToday: 0,
}

type RpcMetricsPayload = {
  total_tenants?: unknown
  open_tickets?: unknown
  pending_maintenance?: unknown
  unpaid_invoices?: unknown
}

function parseRpcMetrics(data: unknown): DashboardRpcMetrics | null {
  let payload: unknown = data
  if (typeof data === "string") {
    try {
      payload = JSON.parse(data) as unknown
    } catch {
      return null
    }
  }
  if (payload == null || typeof payload !== "object") return null
  const row = payload as RpcMetricsPayload
  const rawUnpaid = row.unpaid_invoices
  let unpaid = 0
  if (typeof rawUnpaid === "number") {
    unpaid = rawUnpaid
  } else if (typeof rawUnpaid === "string") {
    unpaid = parseFloat(rawUnpaid) || 0
  } else {
    unpaid = Number(rawUnpaid ?? 0) || 0
  }
  return {
    totalTenants: Number(row.total_tenants) || 0,
    openTickets: Number(row.open_tickets) || 0,
    pendingMaintenance: Number(row.pending_maintenance) || 0,
    unpaidInvoices: Number.isFinite(unpaid) ? unpaid : 0,
  }
}

async function fetchRpcMetricsFallback(): Promise<DashboardRpcMetrics> {
  const supabase = createSupabaseServerClient()
  const z = new TZDate(Date.now(), TZ_IL)
  const maintenanceDueBefore = format(
    addDays(startOfDay(z), 30),
    "yyyy-MM-dd"
  )

  try {
    const [
      tenantsRes,
      ticketsRes,
      maintenanceRes,
      invoicesRes,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "tenant")
        .or("is_active.is.null,is_active.eq.true"),
      supabase
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .eq("status", "open"),
      supabase
        .from("preventive_tasks")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending")
        .lte("next_due_date", maintenanceDueBefore),
      supabase.from("invoices").select("amount").eq("status", "pending"),
    ])

    let totalTenants = 0
    if (tenantsRes.error) {
      console.error("[dashboard tenants]", tenantsRes.error.message)
    } else {
      totalTenants = tenantsRes.count ?? 0
    }

    let openTickets = 0
    if (ticketsRes.error) {
      console.error("[dashboard open tickets]", ticketsRes.error.message)
    } else {
      openTickets = ticketsRes.count ?? 0
    }

    let pendingMaintenance = 0
    if (maintenanceRes.error) {
      console.error("[dashboard maintenance]", maintenanceRes.error.message)
    } else {
      pendingMaintenance = maintenanceRes.count ?? 0
    }

    let unpaidInvoices = 0
    if (invoicesRes.error) {
      console.error("[dashboard invoices]", invoicesRes.error.message)
    } else if (invoicesRes.data?.length) {
      unpaidInvoices = invoicesRes.data.reduce(
        (acc, r) => acc + Number(r.amount ?? 0),
        0
      )
    }

    return {
      totalTenants,
      openTickets,
      pendingMaintenance,
      unpaidInvoices,
    }
  } catch (e) {
    console.error("[fetchRpcMetricsFallback]", e)
    return ZERO_RPC
  }
}

/**
 * מדדי דשבורד מ־‎supabase.rpc('dashboard_stats')‎ — JSON עם
 * ‎total_tenants, open_tickets, pending_maintenance, unpaid_invoices‎.
 * בכשל RPC נופלים לשאילתות גיבוי (ללא אזהרת קונסול).
 */
export async function getDashboardRpcMetrics(): Promise<DashboardRpcMetrics> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase.rpc("dashboard_stats")

    if (!error) {
      const parsed = parseRpcMetrics(data)
      if (parsed) return parsed
    }

    return await fetchRpcMetricsFallback()
  } catch (e) {
    console.error("[getDashboardRpcMetrics]", e)
    try {
      return await fetchRpcMetricsFallback()
    } catch {
      return ZERO_RPC
    }
  }
}

async function fetchSecondaryStatsFallback(): Promise<SecondaryDashboardStats> {
  const supabase = createSupabaseServerClient()
  const { start: monthStart, endExclusive: monthEnd } = jerusalemMonthBoundsUtc()
  const { start: dayStart, endExclusive: dayEnd } = jerusalemDayBoundsUtc()

  const [buildingsRes, sessionsRes, bookingsRes] = await Promise.all([
    supabase.from("buildings").select("*", { count: "exact", head: true }),
    supabase
      .from("ev_charging_sessions")
      .select("kwh")
      .gte("started_at", monthStart)
      .lt("started_at", monthEnd),
    supabase
      .from("amenity_bookings")
      .select("*", { count: "exact", head: true })
      .gte("starts_at", dayStart)
      .lt("starts_at", dayEnd),
  ])

  let buildings = 0
  if (buildingsRes.error) {
    console.error("[dashboard buildings]", buildingsRes.error.message)
  } else {
    buildings = buildingsRes.count ?? 0
  }

  let evKwhMonth = 0
  if (sessionsRes.error) {
    console.error("[dashboard ev]", sessionsRes.error.message)
  } else if (sessionsRes.data?.length) {
    evKwhMonth = sessionsRes.data.reduce(
      (acc, row) => acc + Number(row.kwh ?? 0),
      0
    )
  }

  let amenityBookingsToday = 0
  if (bookingsRes.error) {
    console.error("[dashboard bookings]", bookingsRes.error.message)
  } else {
    amenityBookingsToday = bookingsRes.count ?? 0
  }

  return { buildings, evKwhMonth, amenityBookingsToday }
}

export async function getSecondaryDashboardStats(): Promise<SecondaryDashboardStats> {
  try {
    return await fetchSecondaryStatsFallback()
  } catch (e) {
    console.error("[getSecondaryDashboardStats]", e)
    return ZERO_SECONDARY
  }
}

export function formatKwhHe(value: number): string {
  if (!Number.isFinite(value)) return "0 קוט״ש"
  const formatted = value.toLocaleString("he-IL", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  })
  return `${formatted} קוט״ש`
}

export function formatCountHe(value: number): string {
  if (!Number.isFinite(value)) return "0"
  return value.toLocaleString("he-IL")
}

