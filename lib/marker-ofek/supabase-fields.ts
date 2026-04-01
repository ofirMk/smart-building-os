/** Shared column lists for lean Marker Ofek Supabase selects */

export const COMPANY_PROFILE_COLUMNS =
  "id, company_name, legal_id, address, phone, email, deductions_file_number, created_at" as const

export const ITEMS_CATALOG_COLUMNS =
  "id, sku, description, unit, category, default_price, is_inventory, created_at" as const
