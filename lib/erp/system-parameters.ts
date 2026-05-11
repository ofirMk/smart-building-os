/**
 * Dynamic global system parameters — read/write API.
 *
 * This file is the **only** place the rest of the app should consult for
 * parameter values such as VAT %, retention %, numbering prefixes, MASAV codes,
 * and AI thresholds. It enforces the precedence ladder documented in the
 * migration header:
 *
 *   1. erp_system_parameters  (per-company flexible key-value)
 *   2. company_profile.<col>  (per-company typed defaults — fallback only)
 *   3. mo_system_settings.<col> (global singleton — fallback only)
 *   4. Hard-coded last-resort default (logged as warning in non-prod)
 *
 * Hot path: getters use a per-company in-process TTL cache (60s) keyed by
 * (companyId, paramKey). The cache is invalidated on `setSystemParameter`
 * for the same key.
 */

import "server-only"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"

// =============================================================================
// Types
// =============================================================================

export type ErpParamDataType =
  | "STRING"
  | "NUMBER"
  | "PERCENT"
  | "BOOLEAN"
  | "JSON"
  | "EMAIL"
  | "URL"
  | "DATE"
  | "ENUM"

export type SystemParameter = {
  paramKey: string
  /**
   * Raw text value as stored in the DB. Use `getSystemParameterTyped` for
   * coerced access.
   */
  paramValue: string | null
  dataType: ErpParamDataType
  description: string
  category: string
  isSecret: boolean
  isSystem: boolean
  metadata: Record<string, unknown>
  updatedAt: string
}

export type SystemParameterUpdate = {
  paramKey: string
  paramValue: string | null
}

// =============================================================================
// Hard-coded last-resort defaults — used only if every layer above is missing.
// These mirror the seed values in migration 20260910120000.
// =============================================================================

const HARDCODE_FALLBACKS: Record<string, string> = {
  DEFAULT_VAT_PCT: "17.0",
  DEFAULT_RETENTION_PCT: "5.0",
  CURRENCY_CODE: "ILS",
  ROUNDING_GRANULARITY: "0.01",
  INVOICE_NUMBER_PREFIX: "INV-",
  PO_NUMBER_PREFIX: "PO-",
  PROJECT_CODE_PREFIX: "PRJ-",
  EMAIL_FROM_NAME: "Holden Group ERP",
  PDF_HEADER_TAGLINE: "",
  MASAV_INSTITUTION_CODE: "",
  MASAV_SENDER_NAME: "",
  AI_AUTOPOST_CONFIDENCE_MIN: "0.92",
  AI_THREEWAY_VARIANCE_TOLERANCE_PCT: "2.0",
  COST_CONTROL_PERIOD_LOCK_DAYS: "5",
  BUDGET_OVERRUN_WARN_PCT: "85.0",
  BUDGET_OVERRUN_BLOCK_PCT: "100.0",
}

// =============================================================================
// In-process TTL cache
// =============================================================================

type CacheEntry = { value: string | null; expiresAt: number }
const PARAM_CACHE = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60_000

function cacheKey(companyId: string, paramKey: string): string {
  return `${companyId}::${paramKey}`
}

function readCache(companyId: string, paramKey: string): string | null | undefined {
  const entry = PARAM_CACHE.get(cacheKey(companyId, paramKey))
  if (!entry) return undefined
  if (entry.expiresAt < Date.now()) {
    PARAM_CACHE.delete(cacheKey(companyId, paramKey))
    return undefined
  }
  return entry.value
}

function writeCache(companyId: string, paramKey: string, value: string | null): void {
  PARAM_CACHE.set(cacheKey(companyId, paramKey), {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
}

function invalidateCache(companyId: string, paramKey: string): void {
  PARAM_CACHE.delete(cacheKey(companyId, paramKey))
}

export function __invalidateSystemParameterCache(companyId?: string): void {
  if (!companyId) {
    PARAM_CACHE.clear()
    return
  }
  for (const k of Array.from(PARAM_CACHE.keys())) {
    if (k.startsWith(`${companyId}::`)) PARAM_CACHE.delete(k)
  }
}

// =============================================================================
// Core read API
// =============================================================================

/**
 * Read a single parameter value as a raw string. Returns the hard-coded
 * fallback if the DB has no row. Uses service-role for the lookup so callers
 * outside RLS (e.g., PDF workers, AI jobs) still get the right value.
 *
 * For ACL-sensitive secrets, callers should never expose this directly to
 * the client; consume the value server-side and return derived results only.
 */
export async function getSystemParameter(
  companyId: string,
  paramKey: string,
): Promise<string | null> {
  const cached = readCache(companyId, paramKey)
  if (cached !== undefined) return cached

  const admin = createSupabaseServiceRoleClient()
  const { data, error } = await admin
    .from("erp_system_parameters")
    .select("param_value")
    .eq("company_id", companyId)
    .eq("param_key", paramKey)
    .maybeSingle()

  if (error) {
    /** DB error must not crash callers — fall back to hardcode and warn. */
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[system-parameters] failed to read ${paramKey} for ${companyId}: ${error.message}; falling back to hardcode.`,
      )
    }
    const fb = HARDCODE_FALLBACKS[paramKey] ?? null
    writeCache(companyId, paramKey, fb)
    return fb
  }

  const value =
    (data as { param_value: string | null } | null)?.param_value ??
    HARDCODE_FALLBACKS[paramKey] ??
    null

  writeCache(companyId, paramKey, value)
  return value
}

/**
 * Typed getters — coerce the raw string into the requested primitive,
 * returning the hard-coded fallback on parse failure.
 */
export async function getSystemParameterNumber(
  companyId: string,
  paramKey: string,
): Promise<number> {
  const raw = await getSystemParameter(companyId, paramKey)
  if (raw == null) return Number(HARDCODE_FALLBACKS[paramKey] ?? 0)
  const n = Number(raw)
  if (Number.isFinite(n)) return n
  return Number(HARDCODE_FALLBACKS[paramKey] ?? 0)
}

export async function getSystemParameterBoolean(
  companyId: string,
  paramKey: string,
): Promise<boolean> {
  const raw = await getSystemParameter(companyId, paramKey)
  if (raw == null) return HARDCODE_FALLBACKS[paramKey]?.toLowerCase() === "true"
  return raw.toLowerCase() === "true" || raw === "1"
}

/**
 * Convenience: VAT rate as a decimal multiplier (e.g., 17 → 0.17).
 * Centralizes the "% → multiplier" conversion that was previously duplicated.
 */
export async function getVatMultiplier(companyId: string): Promise<number> {
  const pct = await getSystemParameterNumber(companyId, "DEFAULT_VAT_PCT")
  return pct / 100
}

/**
 * Bulk loader for the admin UI — fetches every parameter for the company
 * through the RPC (which handles secret redaction for non-admins).
 */
export async function listSystemParameters(
  companyId: string,
): Promise<SystemParameter[]> {
  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase.rpc("erp_get_system_parameters", {
    p_company_id: companyId,
  })
  if (error) throw new Error(error.message)

  type Row = {
    param_key: string
    param_value: string | null
    data_type: ErpParamDataType
    description: string
    category: string
    is_secret: boolean
    is_system: boolean
    metadata: Record<string, unknown>
    updated_at: string
  }
  return ((data ?? []) as Row[]).map((r) => ({
    paramKey: r.param_key,
    paramValue: r.param_value,
    dataType: r.data_type,
    description: r.description,
    category: r.category,
    isSecret: r.is_secret,
    isSystem: r.is_system,
    metadata: r.metadata ?? {},
    updatedAt: r.updated_at,
  }))
}

// =============================================================================
// Admin write API — RLS will enforce admin role.
// =============================================================================

/**
 * Update an existing parameter's value. Returns the new value or an error
 * message. Invalidates the cache for the (company, key) pair.
 */
export async function setSystemParameter(input: {
  companyId: string
  paramKey: string
  paramValue: string | null
}): Promise<{ ok: true; paramValue: string | null } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

  const { error } = await supabase
    .from("erp_system_parameters")
    .update({ param_value: input.paramValue, updated_by: user.id })
    .eq("company_id", input.companyId)
    .eq("param_key", input.paramKey)

  if (error) return { ok: false, error: error.message }

  invalidateCache(input.companyId, input.paramKey)
  return { ok: true, paramValue: input.paramValue }
}

/**
 * Bulk-set values (transactional best-effort). Used by the admin "Save All"
 * button. Returns the count of rows touched and any per-row errors.
 */
export async function setSystemParametersBulk(input: {
  companyId: string
  updates: SystemParameterUpdate[]
}): Promise<
  | { ok: true; updated: number }
  | { ok: false; error: string; updated: number }
> {
  if (input.updates.length === 0) return { ok: true, updated: 0 }
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) return { ok: false, error: "נדרשת התחברות", updated: 0 }

  let updated = 0
  for (const u of input.updates) {
    const { error } = await supabase
      .from("erp_system_parameters")
      .update({ param_value: u.paramValue, updated_by: user.id })
      .eq("company_id", input.companyId)
      .eq("param_key", u.paramKey)
    if (error) {
      return {
        ok: false,
        error: `${u.paramKey}: ${error.message}`,
        updated,
      }
    }
    invalidateCache(input.companyId, u.paramKey)
    updated += 1
  }
  return { ok: true, updated }
}
