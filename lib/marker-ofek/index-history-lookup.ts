/**
 * Lookup helpers for `ref_index_history` — CPI-style series for billing indexation.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export const DEFAULT_INDEX_SERIES_CODE = "cpi_il_default"

export async function fetchIndexHistoryRowById(
  supabase: SupabaseClient,
  id: string | null | undefined
): Promise<{ id: string; index_value: number; index_date: string } | null> {
  const tid = id?.trim()
  if (!tid) return null
  const { data, error } = await supabase
    .from("ref_index_history")
    .select("id, index_value, index_date")
    .eq("id", tid)
    .maybeSingle()
  if (error || !data) return null
  const r = data as { id: string; index_value: number; index_date: string }
  return {
    id: r.id,
    index_value: Number(r.index_value),
    index_date: String(r.index_date),
  }
}

/** Latest row with index_date <= asOfDate (inclusive), for series. */
export async function fetchIndexOnOrBefore(
  supabase: SupabaseClient,
  seriesCode: string,
  asOfDateIso: string
): Promise<{ id: string; index_value: number; index_date: string } | null> {
  const d = asOfDateIso.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  const { data, error } = await supabase
    .from("ref_index_history")
    .select("id, index_value, index_date")
    .eq("series_code", seriesCode)
    .lte("index_date", d)
    .order("index_date", { ascending: false })
    .limit(1)
  if (error) return null
  const rows = (data ?? []) as Array<{
    id: string
    index_value: number
    index_date: string
  }>
  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    index_value: Number(row.index_value),
    index_date: String(row.index_date),
  }
}
