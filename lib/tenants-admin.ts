import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { TenantCrmRow, TenantCrmStatus } from "@/types/tenant-admin"

type TenantRpcRow = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  is_active: boolean | null
  unit_number: string | null
  building_name: string | null
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
    const { data, error } = await supabase.rpc("get_tenants_for_crm")

    if (error) {
      return { data: [], error: error.message }
    }

    const rows = (data ?? []) as TenantRpcRow[]
    const mapped: TenantCrmRow[] = rows.map((row) => {
      const hasApartment = row.unit_number != null
      const status = deriveStatus(row.is_active, hasApartment)
      return {
        id: row.id,
        full_name: row.full_name?.trim() || null,
        email: row.email?.trim() || null,
        phone: row.phone?.trim() || null,
        building_name: row.building_name ?? null,
        unit_number: row.unit_number ?? null,
        status,
      }
    })

    return { data: mapped, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא ידועה"
    return { data: [], error: message }
  }
}
