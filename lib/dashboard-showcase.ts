import { addDays, addMonths, startOfDay, startOfMonth } from "date-fns"
import { TZDate } from "@date-fns/tz"

import { formatCountHe, formatKwhHe } from "@/lib/dashboard-stats"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const TZ_IL = "Asia/Jerusalem"

/** מוק QA — כשאין גישה לטבלאות או כשל שאילתה */
export const SHOWCASE_MOCK = {
  facilitiesValue: "4 / 4",
  facilitiesSub: "כל הבניינים מחוברים ופעילים",
  openTicketsValue: "5",
  openTicketsSub: "2 בטיפול דחוף (SLA)",
  energyValue: "70.5 קוט״ש",
  energySub: "מגמה: עלייה של 2% משבוע שעבר",
  slaValue: "98.2%",
  slaSub: "עמידה בזמני תגובה מול הדיירים",
  powerHeightsPct: [40, 65, 45, 80, 55, 90, 70] as const,
  powerLabels: ["יום 1", "יום 2", "יום 3", "יום 4", "יום 5", "יום 6", "יום 7"],
  buildingRows: [
    { label: "בניין A", percentage: 45, barColor: "bg-blue-500" },
    { label: "בניין B", percentage: 25, barColor: "bg-cyan-400" },
    { label: "בניין C", percentage: 20, barColor: "bg-teal-400" },
    { label: "בניין D", percentage: 10, barColor: "bg-gray-600" },
  ],
} as const

const BUILDING_COLORS = [
  "bg-blue-500",
  "bg-cyan-400",
  "bg-teal-400",
  "bg-gray-600",
  "bg-violet-500",
  "bg-amber-500",
] as const

type TicketStatusRow = { status: string }

function countNotResolved(rows: TicketStatusRow[]): number {
  return rows.filter((r) => r.status !== "resolved").length
}

function countInProgress(rows: TicketStatusRow[]): number {
  return rows.filter((r) => r.status === "in_progress").length
}

function closureRatePct(rows: TicketStatusRow[]): string | null {
  const total = rows.length
  if (total === 0) return null
  const closed = rows.filter((r) => r.status === "closed").length
  const resolved = rows.filter((r) => r.status === "resolved").length
  const done = closed + resolved
  return ((done / total) * 100).toFixed(1)
}

/** סדרת טעינה 7 ימים — ללא console (לשימוש בדשבורד) */
async function fetchEvSeriesSilent(): Promise<
  { dateKey: string; labelHe: string; kwh: number }[] | null
> {
  const z = new TZDate(Date.now(), TZ_IL)
  const todayStart = startOfDay(z)
  const rangeStart = addDays(todayStart, -6)
  const rangeEndExclusive = addDays(todayStart, 1)

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
    }

    const series: { dateKey: string; labelHe: string; kwh: number }[] = []
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
  } catch {
    return null
  }
}

async function fetchBuildingBarsSilent(): Promise<
  | {
      label: string
      percentage: number
      barColor: string
    }[]
  | null
> {
  try {
    const supabase = createSupabaseServerClient()
    const [{ data: buildings, error: bErr }, { data: tickets, error: tErr }] =
      await Promise.all([
        supabase.from("buildings").select("id, name").order("name"),
        supabase.from("tickets").select("building_id"),
      ])

    if (bErr || tErr) return null

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
    if (total === 0) return null

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
      label: r.label,
      percentage: Math.round((r.count / total) * 100),
      barColor: BUILDING_COLORS[i % BUILDING_COLORS.length],
    }))
  } catch {
    return null
  }
}

async function fetchSecondarySilent(): Promise<{
  buildings: number
  evKwhMonth: number
} | null> {
  try {
    const supabase = createSupabaseServerClient()
    const z = new TZDate(Date.now(), TZ_IL)
    const monthStart = startOfMonth(z)
    const nextMonthStart = addMonths(monthStart, 1)

    const [buildingsRes, sessionsRes] = await Promise.all([
      supabase.from("buildings").select("*", { count: "exact", head: true }),
      supabase
        .from("ev_charging_sessions")
        .select("kwh")
        .gte("started_at", monthStart.toISOString())
        .lt("started_at", nextMonthStart.toISOString()),
    ])

    let buildings = 0
    if (!buildingsRes.error) {
      buildings = buildingsRes.count ?? 0
    }

    let evKwhMonth = 0
    if (!sessionsRes.error && sessionsRes.data?.length) {
      evKwhMonth = sessionsRes.data.reduce(
        (acc, row) => acc + Number((row as { kwh: unknown }).kwh ?? 0),
        0
      )
    }

    return { buildings, evKwhMonth }
  } catch {
    return null
  }
}

export type DashboardShowcaseVm =
  | { useFallback: true }
  | {
      useFallback: false
      facilitiesValue: string
      facilitiesSub: string
      openTicketsValue: string
      openTicketsSub: string
      energyValue: string
      energySub: string
      slaValue: string
      slaSub: string
      powerHeightsPct: number[]
      powerLabels: string[]
      buildingRows: {
        label: string
        percentage: number
        barColor: string
      }[]
    }

/**
 * טוען נתונים לדשבורד מרקר אופק. כשל בטעינת ‎tickets‎ ⇒ גיבוי מוק מלא.
 * שאר השאילתות בשקט — בכשל משתמשים במוק לגרפים/שדות החסרים.
 */
export async function loadDashboardShowcase(): Promise<DashboardShowcaseVm> {
  let ticketRows: TicketStatusRow[] = []

  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase.from("tickets").select("status")
    if (error) {
      return { useFallback: true }
    }
    ticketRows = (data ?? []) as TicketStatusRow[]
  } catch {
    return { useFallback: true }
  }

  const [secondary, evSeries, buildingBars] = await Promise.all([
    fetchSecondarySilent(),
    fetchEvSeriesSilent(),
    fetchBuildingBarsSilent(),
  ])

  const notResolved = countNotResolved(ticketRows)
  const inProg = countInProgress(ticketRows)
  const openTicketsValue = formatCountHe(notResolved)
  const openTicketsSub =
    inProg > 0
      ? `${formatCountHe(inProg)} בטיפול דחוף (SLA)`
      : "אין קריאות בטיפול דחוף כרגע"

  const buildings = secondary?.buildings ?? 0
  const facilitiesValue =
    buildings > 0 ? `${formatCountHe(buildings)} / ${formatCountHe(buildings)}` : "0 / 0"
  const facilitiesSub =
    buildings > 0
      ? SHOWCASE_MOCK.facilitiesSub
      : "בניינים בניהול — אין נתונים זמינים"

  const energyValue =
    secondary != null ? formatKwhHe(secondary.evKwhMonth) : SHOWCASE_MOCK.energyValue
  const energySub =
    secondary != null
      ? "צריכת טעינת רכב מצטברת מתחילת החודש"
      : SHOWCASE_MOCK.energySub

  const slaPct = closureRatePct(ticketRows)
  const slaValue =
    slaPct != null ? `${slaPct}%` : SHOWCASE_MOCK.slaValue
  const slaSub =
    slaPct != null
      ? "שיעור קריאות סגורות או טופלו מכלל הקריאות"
      : SHOWCASE_MOCK.slaSub

  let powerHeightsPct: number[] = [...SHOWCASE_MOCK.powerHeightsPct]
  let powerLabels: string[] = [...SHOWCASE_MOCK.powerLabels]

  if (evSeries && evSeries.length === 7) {
    const maxKwh = Math.max(1, ...evSeries.map((d) => d.kwh))
    powerHeightsPct = evSeries.map((d) =>
      Math.max(4, (d.kwh / maxKwh) * 100)
    )
    powerLabels = evSeries.map((d) => d.labelHe)
  }

  const buildingRows =
    buildingBars && buildingBars.length > 0
      ? buildingBars
      : [...SHOWCASE_MOCK.buildingRows]

  return {
    useFallback: false,
    facilitiesValue,
    facilitiesSub,
    openTicketsValue,
    openTicketsSub,
    energyValue,
    energySub,
    slaValue,
    slaSub,
    powerHeightsPct,
    powerLabels,
    buildingRows,
  }
}
