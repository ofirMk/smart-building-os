/** Shared column lists for lean Marker Ofek Supabase selects */

export const COMPANY_PROFILE_COLUMNS =
  "id, company_name, legal_id, address, phone, email, deductions_file_number, default_vat_rate_percent, default_retention_percent, indexation_source_note, brand_logo_url, created_at" as const

export const ITEMS_CATALOG_COLUMNS =
  "id, sku, description, unit, category, default_price, is_inventory, created_at" as const

/** public.suppliers — ללא legal_id (תאימות ל-DB לפני הוספת העמודה) */
export const SUPPLIERS_TABLE_SELECT_MINIMAL = "id, name, contact_info" as const

/** public.suppliers — מלא כש־legal_id קיים */
export const SUPPLIERS_TABLE_SELECT_WITH_LEGAL_ID =
  "id, name, legal_id, contact_info" as const

/**
 * PostgREST/Postgres — למשל `column suppliers.legal_id does not exist`
 * כשהמיגרציה עדיין לא רצה בפרודקשן.
 */
export function isMissingSuppliersLegalIdColumnError(err: unknown): boolean {
  const o = err as { message?: string; details?: string; hint?: string }
  const raw = [o?.message, o?.details, o?.hint].filter(Boolean).join(" ")
  const m = raw.toLowerCase()
  if (!m.includes("legal_id")) return false
  return (
    m.includes("does not exist") ||
    m.includes("undefined column") ||
    /column\s+[\w.]+\.legal_id/.test(m)
  )
}
