import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { TenantCrmRow, TenantCrmStatus } from "@/types/tenant-admin"

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  is_active: boolean | null
  apartments:
    | {
        unit_number: string | null
        buildings: { name: string | null } | { name: string | null }[] | null
      }[]
    | null
}

function mapApartment(
  apartments: ProfileRow["apartments"]
): { unit: string | null; building: string | null } {
  if (!apartments || !Array.isArray(apartments) || apartments.length === 0) {
    return { unit: null, building: null }
  }
  const ap = apartments[0] as {
    unit_number?: string | null
    buildings?: { name?: string | null } | { name?: string | null }[] | null
  }
  const unit = ap.unit_number ?? null
  const b = ap.buildings
  let building: string | null = null
  if (b != null) {
    if (Array.isArray(b)) {
      building = b[0]?.name ?? null
    } else if (typeof b === "object" && "name" in b) {
      building = (b as { name: string | null }).name ?? null
    }
  }
  return { unit, building }
}

function deriveStatus(
  isActive: boolean | null | undefined,
  hasApartment: boolean
): TenantCrmStatus {
  if (isActive === false) return "inactive"
  if (hasApartment) return "active"
  return "pending"
}

export async function getTenantsForCrm(): Promise<{
  data: TenantCrmRow[]
  error: string | null
}> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from("profiles")
      .select(
        `
        id,
        full_name,
        email,
        phone,
        is_active,
        apartments (
          unit_number,
          buildings ( name )
        )
      `
      )
      .eq("role", "tenant")
      .order("full_name", { ascending: true })

    if (error) {
      return { data: [], error: error.message }
    }

    const rows = (data ?? []) as ProfileRow[]
    const mapped: TenantCrmRow[] = rows.map((row) => {
      const { unit, building } = mapApartment(row.apartments)
      const hasApartment = unit != null
      const status = deriveStatus(row.is_active, hasApartment)

      return {
        id: row.id,
        full_name: row.full_name?.trim() || null,
        email: row.email?.trim() || null,
        phone: row.phone?.trim() || null,
        building_name: building,
        unit_number: unit,
        status,
      }
    })

    return { data: mapped, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא ידועה"
    return { data: [], error: message }
  }
}
