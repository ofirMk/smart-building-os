import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { BuildingListItem } from "@/types/building"

export type BuildingOption = {
  id: string
  name: string
}

export async function getBuildingsList(): Promise<{
  data: BuildingOption[]
  error: string | null
}> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from("buildings")
      .select("id, name")
      .order("name", { ascending: true })

    if (error) {
      return { data: [], error: error.message }
    }

    const rows = (data ?? []) as { id: string; name: string }[]
    return {
      data: rows.map((r) => ({
        id: r.id,
        name: r.name?.trim() || "ללא שם",
      })),
      error: null,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא ידועה"
    return { data: [], error: message }
  }
}

function nestedCount(embed: unknown): number {
  if (embed == null) return 0
  if (Array.isArray(embed)) {
    const first = embed[0]
    if (first && typeof first === "object" && "count" in first) {
      return Number((first as { count: unknown }).count) || 0
    }
    return embed.length
  }
  if (typeof embed === "object" && "count" in embed) {
    return Number((embed as { count: unknown }).count) || 0
  }
  return 0
}

export async function getBuildingsWithCounts(): Promise<{
  data: BuildingListItem[] | null
  error: string | null
}> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from("buildings")
      .select(
        `
        id,
        name,
        address_line1,
        address_line2,
        city,
        region,
        postal_code,
        country,
        created_at,
        updated_at,
        apartments (count),
        parking_spots (count)
      `
      )
      .order("name", { ascending: true })

    if (error) {
      return { data: null, error: error.message }
    }

    const rows = (data ?? []) as Record<string, unknown>[]
    const mapped: BuildingListItem[] = rows.map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      address_line1: String(row.address_line1 ?? ""),
      address_line2:
        row.address_line2 == null ? null : String(row.address_line2),
      city: String(row.city ?? ""),
      region: row.region == null ? null : String(row.region),
      postal_code:
        row.postal_code == null ? null : String(row.postal_code),
      country: String(row.country ?? "IL"),
      created_at: String(row.created_at ?? ""),
      updated_at: String(row.updated_at ?? ""),
      apartmentCount: nestedCount(row.apartments),
      parkingSpotCount: nestedCount(row.parking_spots),
    }))

    return { data: mapped, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא ידועה"
    return { data: null, error: message }
  }
}
