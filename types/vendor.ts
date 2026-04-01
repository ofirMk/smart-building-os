/** Row from public.vendors */
export type VendorRow = {
  id: string
  name: string
  profession: string | null
  phone: string | null
  email: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}
