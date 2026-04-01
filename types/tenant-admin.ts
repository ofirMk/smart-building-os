export type TenantCrmStatus = "active" | "pending" | "inactive"

export type TenantCrmRow = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  building_name: string | null
  unit_number: string | null
  status: TenantCrmStatus
}
