import { createSupabaseServerClient } from "@/lib/supabase/server"

/** סיכום עמדות טעינה חיות — לדשבורד הולדן */
export async function getEvChargingLiveSummary(): Promise<{
  evReadySpots: number
  activeChargingSessions: number
  error: string | null
}> {
  try {
    const supabase = createSupabaseServerClient()
    const [spotsRes, activeRes] = await Promise.all([
      supabase
        .from("parking_spots")
        .select("id", { count: "exact", head: true })
        .eq("ev_ready", true),
      supabase
        .from("ev_charging_sessions")
        .select("id", { count: "exact", head: true })
        .is("ended_at", null),
    ])

    if (spotsRes.error) {
      return {
        evReadySpots: 0,
        activeChargingSessions: 0,
        error: spotsRes.error.message,
      }
    }
    if (activeRes.error) {
      return {
        evReadySpots: spotsRes.count ?? 0,
        activeChargingSessions: 0,
        error: activeRes.error.message,
      }
    }

    return {
      evReadySpots: spotsRes.count ?? 0,
      activeChargingSessions: activeRes.count ?? 0,
      error: null,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { evReadySpots: 0, activeChargingSessions: 0, error: message }
  }
}

export type EvSessionWithSpot = {
  id: string
  started_at: string
  ended_at: string | null
  kwh: number
  spot_label: string
}

export type EvMonthlyBillWithSpot = {
  id: string
  period_start: string
  period_end: string
  kwh_total: number
  total_amount: number
  currency: string
  spot_label: string
}

function spotLabelFromEmbed(
  embed: unknown
): string {
  if (embed == null) return "—"
  const first = Array.isArray(embed) ? embed[0] : embed
  if (first && typeof first === "object" && "label" in first) {
    const label = (first as { label: unknown }).label
    if (typeof label === "string" && label.trim()) return label.trim()
  }
  return "—"
}

export async function getEvChargingSessionsWithSpots(): Promise<{
  data: EvSessionWithSpot[]
  error: string | null
}> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from("ev_charging_sessions")
    .select(
      `
      id,
      started_at,
      ended_at,
      kwh,
      parking_spots!inner (
        label
      )
    `
    )
    .order("started_at", { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  const rows = (data ?? []) as Record<string, unknown>[]
  return {
    data: rows.map((row) => ({
      id: String(row.id ?? ""),
      started_at: String(row.started_at ?? ""),
      ended_at:
        row.ended_at == null ? null : String(row.ended_at),
      kwh: Number(row.kwh ?? 0),
      spot_label: spotLabelFromEmbed(row.parking_spots),
    })),
    error: null,
  }
}

export async function getEvMonthlyBillsWithSpots(): Promise<{
  data: EvMonthlyBillWithSpot[]
  error: string | null
}> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from("ev_monthly_bills")
    .select(
      `
      id,
      period_start,
      period_end,
      kwh_total,
      total_amount,
      currency,
      parking_spots!inner (
        label
      )
    `
    )
    .order("period_start", { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  const rows = (data ?? []) as Record<string, unknown>[]
  return {
    data: rows.map((row) => ({
      id: String(row.id ?? ""),
      period_start: String(row.period_start ?? ""),
      period_end: String(row.period_end ?? ""),
      kwh_total: Number(row.kwh_total ?? 0),
      total_amount: Number(row.total_amount ?? 0),
      currency:
        typeof row.currency === "string" && row.currency.trim()
          ? row.currency.trim()
          : "ILS",
      spot_label: spotLabelFromEmbed(row.parking_spots),
    })),
    error: null,
  }
}
