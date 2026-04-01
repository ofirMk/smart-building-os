import { createSupabaseServerClient } from "@/lib/supabase/server"

export type TenantAmenity = {
  id: string
  name: string
  type: string
  capacity_per_slot: number
  slot_minutes: number
}

export async function getTenantAmenities(): Promise<{
  data: TenantAmenity[]
  error: string | null
}> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from("amenities")
      .select("id, name, type, capacity_per_slot, slot_minutes")
      .eq("is_active", true)
      .order("name", { ascending: true })

    if (error) {
      return { data: [], error: error.message }
    }

    const rows = (data ?? []) as Record<string, unknown>[]
    return {
      data: rows.map((row) => ({
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
        type: typeof row.type === "string" ? row.type : "",
        capacity_per_slot: Math.max(
          1,
          Math.floor(Number(row.capacity_per_slot ?? 1))
        ),
        slot_minutes: Math.max(
          15,
          Math.floor(Number(row.slot_minutes ?? 60))
        ),
      })),
      error: null,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא ידועה"
    return { data: [], error: message }
  }
}
