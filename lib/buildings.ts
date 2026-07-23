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

type BuildingRpcRow = {
  id: string
  name: string
  address_line1: string
  address_line2: string | null
  city: string
  region: string | null
  postal_code: string | null
  country: string
  created_at: string
  updated_at: string
  apartment_count: number
  parking_spot_count: number
}

export async function getBuildingsWithCounts(): Promise<{
  data: BuildingListItem[] | null
  error: string | null
}> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase.rpc("get_buildings_with_counts")

    if (error) {
      return { data: null, error: error.message }
    }

    const rows = (data ?? []) as BuildingRpcRow[]
    const mapped: BuildingListItem[] = rows.map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      address_line1: String(row.address_line1 ?? ""),
      address_line2: row.address_line2 == null ? null : String(row.address_line2),
      city: String(row.city ?? ""),
      region: row.region == null ? null : String(row.region),
      postal_code: row.postal_code == null ? null : String(row.postal_code),
      country: String(row.country ?? "IL"),
      created_at: String(row.created_at ?? ""),
      updated_at: String(row.updated_at ?? ""),
      apartmentCount: Number(row.apartment_count) || 0,
      parkingSpotCount: Number(row.parking_spot_count) || 0,
    }))

    return { data: mapped, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא ידועה"
    return { data: null, error: message }
  }
}
