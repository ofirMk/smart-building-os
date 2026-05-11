"use server"

/**
 * Sprint A.5 — Cost Control server actions (MedaTech §6).
 *
 * Pure server-side operations that gate access through Supabase RLS
 * (user_has_company_access) and call the `erp_collect_costs` SQL RPC.
 *
 *   • openControlPeriod   — creates a new OPEN period for a given MM/YY.
 *   • runCostCollection   — invokes the RPC; transitions OPEN → COLLECTED.
 *   • closeControlPeriod  — locks the period read-only (COLLECTED → CLOSED).
 *   • upsertForecast      — sets/updates the manual forecast-to-complete.
 *
 * All actions revalidate `/marker-ofek/projects/{projectId}/cost-control`.
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { readActiveCompanyIdFromCookie } from "@/lib/company-context"

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : "אירעה שגיאה לא צפויה"
}

async function requireCompanyId(): Promise<string | null> {
  const id = await readActiveCompanyIdFromCookie()
  return id && id.trim().length > 0 ? id : null
}

// ---------------------------------------------------------------------------
// openControlPeriod
// ---------------------------------------------------------------------------

const openPeriodSchema = z.object({
  projectId: z.string().uuid(),
  controlMonth: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "פורמט חודש: MM/YY"),
  notes: z.string().max(500).optional().nullable(),
})

export async function openControlPeriod(
  input: z.input<typeof openPeriodSchema>,
): Promise<ActionResult<{ id: string; controlMonth: string }>> {
  try {
    const parsed = openPeriodSchema.parse(input)
    const companyId = await requireCompanyId()
    if (!companyId) return { ok: false, error: "חסר הקשר חברה" }

    const supabase = await createSupabaseServerAuthClient()

    // period_end_date = last day of the MM/YY month (JS Date(year, month, 0))
    const [mm, yy] = parsed.controlMonth.split("/").map(Number)
    const fullYear = 2000 + yy
    const lastDay = new Date(Date.UTC(fullYear, mm, 0))
      .toISOString()
      .slice(0, 10)

    const { data, error } = await supabase
      .from("erp_proj_control_periods")
      .insert({
        company_id: companyId,
        project_id: parsed.projectId,
        control_month: parsed.controlMonth,
        period_end_date: lastDay,
        status: "OPEN",
        notes: parsed.notes ?? null,
      })
      .select("id, control_month")
      .single<{ id: string; control_month: string }>()

    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: "יצירת התקופה נכשלה" }

    revalidatePath(`/marker-ofek/projects/${parsed.projectId}/cost-control`)
    return {
      ok: true,
      data: { id: data.id, controlMonth: data.control_month },
    }
  } catch (err) {
    return { ok: false, error: formatError(err) }
  }
}

// ---------------------------------------------------------------------------
// runCostCollection — invoke the RPC
// ---------------------------------------------------------------------------

const collectSchema = z.object({
  projectId: z.string().uuid(),
  controlMonth: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "פורמט חודש: MM/YY"),
})

export async function runCostCollection(
  input: z.input<typeof collectSchema>,
): Promise<ActionResult<{ rowsWritten: number }>> {
  try {
    const parsed = collectSchema.parse(input)
    const companyId = await requireCompanyId()
    if (!companyId) return { ok: false, error: "חסר הקשר חברה" }

    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase.rpc("erp_collect_costs", {
      p_company_id: companyId,
      p_project_id: parsed.projectId,
      p_control_month: parsed.controlMonth,
    })
    if (error) return { ok: false, error: error.message }

    const rowsWritten = typeof data === "number" ? data : 0
    revalidatePath(`/marker-ofek/projects/${parsed.projectId}/cost-control`)
    return { ok: true, data: { rowsWritten } }
  } catch (err) {
    return { ok: false, error: formatError(err) }
  }
}

// ---------------------------------------------------------------------------
// closeControlPeriod — lock period (COLLECTED → CLOSED)
// ---------------------------------------------------------------------------

const closeSchema = z.object({
  projectId: z.string().uuid(),
  periodId: z.string().uuid(),
})

export async function closeControlPeriod(
  input: z.input<typeof closeSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = closeSchema.parse(input)
    const companyId = await requireCompanyId()
    if (!companyId) return { ok: false, error: "חסר הקשר חברה" }

    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("erp_proj_control_periods")
      .update({ status: "CLOSED", closed_at: new Date().toISOString() })
      .eq("id", parsed.periodId)
      .eq("company_id", companyId)
      .eq("status", "COLLECTED")
      .select("id")
      .maybeSingle<{ id: string }>()

    if (error) return { ok: false, error: error.message }
    if (!data)
      return {
        ok: false,
        error: "ניתן לסגור רק תקופה במצב COLLECTED (יש להריץ איסוף עלויות קודם)",
      }

    revalidatePath(`/marker-ofek/projects/${parsed.projectId}/cost-control`)
    return { ok: true, data: { id: data.id } }
  } catch (err) {
    return { ok: false, error: formatError(err) }
  }
}

// ---------------------------------------------------------------------------
// upsertForecast — manual forecast-to-complete (§6.3.9) + revenue (§6.3.8)
// ---------------------------------------------------------------------------

const upsertForecastSchema = z.object({
  projectId: z.string().uuid(),
  periodId: z.string().uuid(),
  subchapterId: z.string().uuid(),
  resourceId: z.string().uuid().nullable(),
  forecastToComplete: z.number().min(0),
  forecastRevenue: z.number().min(0).default(0),
  notes: z.string().max(500).optional().nullable(),
})

export async function upsertForecast(
  input: z.input<typeof upsertForecastSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = upsertForecastSchema.parse(input)
    const companyId = await requireCompanyId()
    if (!companyId) return { ok: false, error: "חסר הקשר חברה" }

    const supabase = await createSupabaseServerAuthClient()

    // Upsert by (company, period, subchapter, resource) natural key.
    // Supabase upsert relies on the composite unique index we created.
    const { data, error } = await supabase
      .from("erp_proj_control_forecasts")
      .upsert(
        {
          company_id: companyId,
          period_id: parsed.periodId,
          project_id: parsed.projectId,
          control_subchapter_id: parsed.subchapterId,
          control_resource_id: parsed.resourceId,
          forecast_to_complete: parsed.forecastToComplete,
          forecast_revenue: parsed.forecastRevenue,
          notes: parsed.notes ?? null,
        },
        {
          onConflict:
            "company_id,period_id,control_subchapter_id,control_resource_id",
        },
      )
      .select("id")
      .single<{ id: string }>()

    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: "עדכון צפי נכשל" }

    revalidatePath(`/marker-ofek/projects/${parsed.projectId}/cost-control`)
    return { ok: true, data: { id: data.id } }
  } catch (err) {
    return { ok: false, error: formatError(err) }
  }
}
