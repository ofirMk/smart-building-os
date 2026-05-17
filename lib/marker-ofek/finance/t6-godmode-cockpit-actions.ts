"use server"

/**
 * Sprint T6 (God Mode) — finance cockpit server actions.
 *
 * Wraps the new RPCs introduced in
 * `20260518030000_t6_godmode_bill_approval_loop.sql`:
 *   - `erp_finance_t6_kpis(company_id)`            → 3 KPI tiles
 *   - `erp_cash_flow_forecast_13_weeks(company_id)` → 13-week chart data
 *
 * All calls are wrapped in try/catch and return a discriminated union so
 * the UI can render fallbacks without throwing during render. No mock data
 * — when the RPC returns 0/empty rows that's the real value (a fresh tenant
 * legitimately has zero AR/AP open).
 */

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface T6KpiTotals {
  totalArOpen: number
  totalApOpen: number
  netCash: number
}

export interface T6ForecastWeek {
  weekIndex: number
  weekStart: string
  weekEnd: string
  arInflowPlanned: number
  apOutflowPlanned: number
  netFlow: number
  openingBalance: number
  closingBalance: number
}

export type T6KpiResult =
  | { ok: true; totals: T6KpiTotals }
  | { ok: false; error: string }

export type T6ForecastResult =
  | { ok: true; rows: T6ForecastWeek[] }
  | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Auth gate (mirrors other finance actions in this folder).
// ---------------------------------------------------------------------------

async function authedClient() {
  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    return { ok: false as const, error: "Unauthorized" }
  }
  return { ok: true as const, supabase }
}

function describeError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === "string" && err.length > 0) return err
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message
    if (typeof msg === "string" && msg.length > 0) return msg
  }
  return fallback
}

// ---------------------------------------------------------------------------
// 1. KPI totals — single row, zero allocations.
// ---------------------------------------------------------------------------

export async function fetchT6KpiTotalsAction(
  companyId: string,
): Promise<T6KpiResult> {
  try {
    const auth = await authedClient()
    if (!auth.ok) return { ok: false, error: auth.error }

    const { data, error } = await auth.supabase.rpc(
      "erp_finance_t6_kpis",
      { p_company_id: companyId },
    )

    if (error) {
      return {
        ok: false,
        error: describeError(error, "טעינת KPIs פיננסיים נכשלה"),
      }
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row) {
      return {
        ok: true,
        totals: { totalArOpen: 0, totalApOpen: 0, netCash: 0 },
      }
    }

    return {
      ok: true,
      totals: {
        totalArOpen: Number(row.total_ar_open ?? 0),
        totalApOpen: Number(row.total_ap_open ?? 0),
        netCash: Number(row.net_cash ?? 0),
      },
    }
  } catch (err) {
    return {
      ok: false,
      error: describeError(err, "שגיאה לא צפויה בטעינת KPIs"),
    }
  }
}

// ---------------------------------------------------------------------------
// 2. 13-week forecast (God-Mode named RPC).
// ---------------------------------------------------------------------------

export async function fetchT6ForecastAction(
  companyId: string,
): Promise<T6ForecastResult> {
  try {
    const auth = await authedClient()
    if (!auth.ok) return { ok: false, error: auth.error }

    const { data, error } = await auth.supabase.rpc(
      "erp_cash_flow_forecast_13_weeks",
      { p_company_id: companyId },
    )

    if (error) {
      return {
        ok: false,
        error: describeError(error, "טעינת תחזית 13 שבועות נכשלה"),
      }
    }

    const rows = Array.isArray(data) ? data : []
    return {
      ok: true,
      rows: rows.map((r: Record<string, unknown>) => ({
        weekIndex: Number(r.week_index ?? 0),
        weekStart: String(r.week_start ?? ""),
        weekEnd: String(r.week_end ?? ""),
        arInflowPlanned: Number(r.ar_inflow_planned ?? 0),
        apOutflowPlanned: Number(r.ap_outflow_planned ?? 0),
        netFlow: Number(r.net_flow ?? 0),
        openingBalance: Number(r.opening_balance ?? 0),
        closingBalance: Number(r.closing_balance ?? 0),
      })),
    }
  } catch (err) {
    return {
      ok: false,
      error: describeError(err, "שגיאה לא צפויה בטעינת התחזית"),
    }
  }
}
