import { addDays, startOfDay } from "date-fns"
import { TZDate } from "@date-fns/tz"

import { createSupabaseServerClient } from "@/lib/supabase/server"

const TZ_IL = "Asia/Jerusalem"

export type TicketStatusKey =
  | "open"
  | "in_progress"
  | "resolved"
  | "closed"

export type TicketStatusDatum = {
  status: TicketStatusKey
  count: number
  labelHe: string
}

const STATUS_ORDER: TicketStatusKey[] = [
  "open",
  "in_progress",
  "resolved",
  "closed",
]

const STATUS_LABELS: Record<TicketStatusKey, string> = {
  open: "פתוח",
  in_progress: "בטיפול",
  resolved: "טופל",
  closed: "סגור",
}

export async function getDashboardTicketsByStatus(): Promise<
  TicketStatusDatum[]
> {
  const empty = (): TicketStatusDatum[] =>
    STATUS_ORDER.map((status) => ({
      status,
      count: 0,
      labelHe: STATUS_LABELS[status],
    }))

  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase.from("tickets").select("status")

    const counts: Record<TicketStatusKey, number> = {
      open: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0,
    }

    if (!error && data) {
      for (const row of data as { status: string }[]) {
        const s = row.status as TicketStatusKey
        if (s in counts) counts[s] += 1
      }
    } else if (error) {
      console.error("[getDashboardTicketsByStatus]", error.message)
    }

    return STATUS_ORDER.map((status) => ({
      status,
      count: counts[status],
      labelHe: STATUS_LABELS[status],
    }))
  } catch (e) {
    console.error("[getDashboardTicketsByStatus]", e)
    return empty()
  }
}

export type EvDailyKwhDatum = {
  dateKey: string
  labelHe: string
  kwh: number
}

export type TicketBuildingBar = {
  buildingId: string
  label: string
  percentage: number
  color: string
}

const BUILDING_BAR_COLORS = [
  "bg-blue-500",
  "bg-cyan-400",
  "bg-teal-400",
  "bg-gray-600",
  "bg-violet-500",
  "bg-amber-500",
] as const

/**
 * פילוח קריאות לפי בניין (אחוזים מסה״כ הקריאות).
 */
export async function getDashboardTicketsByBuilding(): Promise<
  TicketBuildingBar[]
> {
  try {
    const supabase = createSupabaseServerClient()
    const [{ data: buildings, error: bErr }, { data: tickets, error: tErr }] =
      await Promise.all([
        supabase.from("buildings").select("id, name").order("name"),
        supabase.from("tickets").select("building_id"),
      ])

    if (bErr) {
      console.error("[getDashboardTicketsByBuilding]", bErr.message)
      return []
    }
    if (tErr) {
      console.error("[getDashboardTicketsByBuilding]", tErr.message)
      return []
    }

    const nameById = new Map<string, string>()
    for (const b of (buildings ?? []) as { id: string; name: string }[]) {
      nameById.set(b.id, b.name?.trim() || "בניין")
    }

    const counts = new Map<string, number>()
    for (const row of (tickets ?? []) as { building_id: string }[]) {
      const id = row.building_id
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }

    const total = [...counts.values()].reduce((a, n) => a + n, 0)
    if (total === 0) {
      return []
    }

    const rows: { id: string; count: number; label: string }[] = []
    for (const [id, count] of counts) {
      rows.push({
        id,
        count,
        label: nameById.get(id) ?? "בניין",
      })
    }
    rows.sort((a, b) => b.count - a.count)

    return rows.map((r, i) => ({
      buildingId: r.id,
      label: r.label,
      percentage: Math.round((r.count / total) * 100),
      color: BUILDING_BAR_COLORS[i % BUILDING_BAR_COLORS.length],
    }))
  } catch (e) {
    console.error("[getDashboardTicketsByBuilding]", e)
    return []
  }
}

export async function getEvKwhLast7DaysByDate(): Promise<EvDailyKwhDatum[]> {
  const z = new TZDate(Date.now(), TZ_IL)
  const todayStart = startOfDay(z)
  const rangeStart = addDays(todayStart, -6)
  const rangeEndExclusive = addDays(todayStart, 1)

  const buildEmptySeries = (): EvDailyKwhDatum[] => {
    const series: EvDailyKwhDatum[] = []
    for (let i = 0; i < 7; i++) {
      const d = addDays(rangeStart, i)
      const dateKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ_IL,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d)
      const labelHe = new Intl.DateTimeFormat("he-IL", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: TZ_IL,
      }).format(d)
      series.push({ dateKey, labelHe, kwh: 0 })
    }
    return series
  }

  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from("ev_charging_sessions")
      .select("started_at, kwh")
      .gte("started_at", rangeStart.toISOString())
      .lt("started_at", rangeEndExclusive.toISOString())

    const sums = new Map<string, number>()

    if (!error && data) {
      for (const row of data as {
        started_at: string
        kwh: string | number | null
      }[]) {
        const key = new Intl.DateTimeFormat("en-CA", {
          timeZone: TZ_IL,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(row.started_at))
        const kwh = Number(row.kwh ?? 0)
        sums.set(key, (sums.get(key) ?? 0) + kwh)
      }
    } else if (error) {
      console.error("[getEvKwhLast7DaysByDate]", error.message)
    }

    const series: EvDailyKwhDatum[] = []
    for (let i = 0; i < 7; i++) {
      const d = addDays(rangeStart, i)
      const dateKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ_IL,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d)
      const labelHe = new Intl.DateTimeFormat("he-IL", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: TZ_IL,
      }).format(d)
      series.push({
        dateKey,
        labelHe,
        kwh: Math.round((sums.get(dateKey) ?? 0) * 1000) / 1000,
      })
    }

    return series
  } catch (e) {
    console.error("[getEvKwhLast7DaysByDate]", e)
    return buildEmptySeries()
  }
}
