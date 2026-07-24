import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { BuildingListItem } from "@/types/building"

export type BuildingOption = {
  id: string
  name: string
}

export type ApartmentRow = {
  id: string
  unit_number: string
  floor: number | null
  bedrooms: number | null
  tenant_id: string | null
  tenant_name: string | null
  tenant_email: string | null
}

export type BuildingDetail = {
  id: string
  name: string
  address_line1: string | null
  address_line2: string | null
  city: string | null
  region: string | null
  postal_code: string | null
  country: string | null
  created_at: string
  updated_at: string
  apartments: ApartmentRow[]
  parkingSpotCount: number
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
  address_line1: string | null
  address_line2: string | null
  city: string | null
  region: string | null
  postal_code: string | null
  country: string | null
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

export async function getBuildingDetail(id: string): Promise<{
  data: BuildingDetail | null
  error: string | null
}> {
  try {
    const supabase = createSupabaseServerClient()

    const { data: bldg, error: bldgErr } = await supabase
      .from("buildings")
      .select("id, name, address_line1, address_line2, city, region, postal_code, country, created_at, updated_at")
      .eq("id", id)
      .single()

    if (bldgErr || !bldg) {
      return { data: null, error: bldgErr?.message ?? "הבניין לא נמצא" }
    }

    const { data: apts } = await supabase
      .from("apartments")
      .select("id, unit_number, floor, bedrooms, tenant_id")
      .eq("building_id", id)
      .order("unit_number", { ascending: true })

    const aptRows = (apts ?? []) as Array<{
      id: string; unit_number: string; floor: number | null
      bedrooms: number | null; tenant_id: string | null
    }>

    const tenantIds = aptRows.map((a) => a.tenant_id).filter(Boolean) as string[]
    let tenantMap: Record<string, { full_name: string | null; email: string | null }> = {}
    if (tenantIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", tenantIds)
      for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
        tenantMap[p.id] = { full_name: p.full_name, email: p.email }
      }
    }

    const { count: parkingCount } = await supabase
      .from("parking_spots")
      .select("id", { count: "exact", head: true })
      .eq("building_id", id)

    const apartments: ApartmentRow[] = aptRows.map((a) => ({
      id: a.id,
      unit_number: a.unit_number,
      floor: a.floor,
      bedrooms: a.bedrooms,
      tenant_id: a.tenant_id,
      tenant_name: a.tenant_id ? (tenantMap[a.tenant_id]?.full_name ?? null) : null,
      tenant_email: a.tenant_id ? (tenantMap[a.tenant_id]?.email ?? null) : null,
    }))

    const b = bldg as Record<string, unknown>
    return {
      data: {
        id: String(b.id ?? ""),
        name: String(b.name ?? ""),
        address_line1: b.address_line1 ? String(b.address_line1) : null,
        address_line2: b.address_line2 ? String(b.address_line2) : null,
        city: b.city ? String(b.city) : null,
        region: b.region ? String(b.region) : null,
        postal_code: b.postal_code ? String(b.postal_code) : null,
        country: b.country ? String(b.country) : null,
        created_at: String(b.created_at ?? ""),
        updated_at: String(b.updated_at ?? ""),
        apartments,
        parkingSpotCount: parkingCount ?? 0,
      },
      error: null,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא ידועה"
    return { data: null, error: message }
  }
}
