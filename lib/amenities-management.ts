import { createSupabaseServerClient } from "@/lib/supabase/server"

export type AmenityRecord = {
  id: string
  name: string
  capacity_per_slot: number
  is_active: boolean
  type: string
}

export type AmenityBookingWithName = {
  id: string
  starts_at: string
  ends_at: string
  party_size: number
  health_declaration_version: string | null
  amenity_name: string
}

function amenityNameFromEmbed(embed: unknown): string {
  if (embed == null) return "—"
  const first = Array.isArray(embed) ? embed[0] : embed
  if (first && typeof first === "object" && "name" in first) {
    const name = (first as { name: unknown }).name
    if (typeof name === "string" && name.trim()) return name.trim()
  }
  return "—"
}

export async function getAmenities(): Promise<{
  data: AmenityRecord[]
  error: string | null
}> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from("amenities")
    .select("id, name, capacity_per_slot, is_active, type")
    .order("name", { ascending: true })

  if (error) {
    return { data: [], error: error.message }
  }

  const rows = (data ?? []) as Record<string, unknown>[]
  return {
    data: rows.map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      capacity_per_slot: Math.max(
        0,
        Math.floor(Number(row.capacity_per_slot ?? 0))
      ),
      is_active: Boolean(row.is_active),
      type: typeof row.type === "string" ? row.type : "",
    })),
    error: null,
  }
}

export async function getAmenityBookingsWithAmenities(): Promise<{
  data: AmenityBookingWithName[]
  error: string | null
}> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from("amenity_bookings")
    .select(
      `
      id,
      starts_at,
      ends_at,
      party_size,
      health_declaration_version,
      amenities!inner (
        name
      )
    `
    )
    .order("starts_at", { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  const rows = (data ?? []) as Record<string, unknown>[]
  return {
    data: rows.map((row) => ({
      id: String(row.id ?? ""),
      starts_at: String(row.starts_at ?? ""),
      ends_at: String(row.ends_at ?? ""),
      party_size: Math.max(0, Math.floor(Number(row.party_size ?? 0))),
      health_declaration_version:
        row.health_declaration_version == null
          ? null
          : String(row.health_declaration_version),
      amenity_name: amenityNameFromEmbed(row.amenities),
    })),
    error: null,
  }
}
