/**
 * Cross-entity lookup helpers.
 *
 * When an importer references an entity by its natural key (e.g.
 * `project_number → project_id`), we resolve the UUID at commit time
 * rather than dry-run time, because:
 *   - Dry-run is pure (no DB calls).
 *   - The dry-run -> commit gap may include other imports that change the
 *     reference graph; we want the LATEST resolution at commit.
 *
 * All lookups are batch-friendly: they fetch all candidate keys in one
 * query and return a Map for O(1) per-row resolution.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import type { RowError } from "./types"

export type LookupMap = Map<string, string>

/** Resolve `project_number → project_id` for a list of project numbers. */
export async function resolveProjectIds(
  client: SupabaseClient,
  companyId: string,
  projectNumbers: readonly string[],
): Promise<LookupMap> {
  const unique = [...new Set(projectNumbers.filter((n) => n))]
  if (unique.length === 0) return new Map()

  const { data, error } = await client
    .from("erp_proj_projects")
    .select("id,project_number")
    .eq("company_id", companyId)
    .in("project_number", unique)

  if (error) throw new Error(`שגיאה בטעינת פרויקטים: ${error.message}`)

  const map: LookupMap = new Map()
  for (const row of (data ?? []) as { id: string; project_number: string }[]) {
    map.set(row.project_number, row.id)
  }
  return map
}

/** Resolve `supplier_number → supplier_id`. */
export async function resolveSupplierIds(
  client: SupabaseClient,
  companyId: string,
  supplierNumbers: readonly string[],
): Promise<LookupMap> {
  const unique = [...new Set(supplierNumbers.filter((n) => n))]
  if (unique.length === 0) return new Map()

  const { data, error } = await client
    .from("erp_md_suppliers")
    .select("id,supplier_number")
    .eq("company_id", companyId)
    .in("supplier_number", unique)

  if (error) throw new Error(`שגיאה בטעינת ספקים: ${error.message}`)

  const map: LookupMap = new Map()
  for (const row of (data ?? []) as { id: string; supplier_number: string }[]) {
    map.set(row.supplier_number, row.id)
  }
  return map
}

/** Resolve `family_code → product_family_id`. */
export async function resolveProductFamilyIds(
  client: SupabaseClient,
  companyId: string,
  familyCodes: readonly string[],
): Promise<LookupMap> {
  const unique = [...new Set(familyCodes.filter((n) => n))]
  if (unique.length === 0) return new Map()

  const { data, error } = await client
    .from("erp_md_product_families")
    .select("id,family_code")
    .eq("company_id", companyId)
    .in("family_code", unique)

  if (error) throw new Error(`שגיאה בטעינת משפחות מוצר: ${error.message}`)

  const map: LookupMap = new Map()
  for (const row of (data ?? []) as { id: string; family_code: string }[]) {
    map.set(row.family_code, row.id)
  }
  return map
}

/** Resolve `account_number → { id, account_type }`. */
export async function resolveAccountIds(
  client: SupabaseClient,
  companyId: string,
  accountNumbers: readonly string[],
): Promise<Map<string, { id: string; account_type: string }>> {
  const unique = [...new Set(accountNumbers.filter((n) => n))]
  if (unique.length === 0) return new Map()

  const { data, error } = await client
    .from("erp_gl_accounts")
    .select("id,account_number,account_type")
    .eq("company_id", companyId)
    .in("account_number", unique)

  if (error) throw new Error(`שגיאה בטעינת חשבונות: ${error.message}`)

  const map = new Map<string, { id: string; account_type: string }>()
  for (const row of (data ?? []) as {
    id: string
    account_number: string
    account_type: string
  }[]) {
    map.set(row.account_number, { id: row.id, account_type: row.account_type })
  }
  return map
}

/** Resolve `contract_number → contract_id` (subcontractor contracts). */
export async function resolveSubcontractorContractIds(
  client: SupabaseClient,
  companyId: string,
  contractNumbers: readonly string[],
): Promise<LookupMap> {
  const unique = [...new Set(contractNumbers.filter((n) => n))]
  if (unique.length === 0) return new Map()

  const { data, error } = await client
    .from("erp_subcontractor_contracts")
    .select("id,contract_number")
    .eq("company_id", companyId)
    .in("contract_number", unique)

  if (error) throw new Error(`שגיאה בטעינת חוזים: ${error.message}`)

  const map: LookupMap = new Map()
  for (const row of (data ?? []) as { id: string; contract_number: string }[]) {
    map.set(row.contract_number, row.id)
  }
  return map
}

/**
 * Compose a row-level error for a missing lookup target. Use this from
 * within `spec.upsert` when a referenced natural key doesn't resolve.
 */
export function makeMissingLookupError(
  rowNumber: number,
  field: string,
  rawValue: string,
  entityLabel: string,
): RowError {
  return {
    rowNumber,
    field,
    message: `לא נמצא ${entityLabel} עם המזהה "${rawValue}". יש לייבא אותו תחילה.`,
    rawValue,
  }
}
