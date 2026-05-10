"use server"

/**
 * Server actions for Project Planning Workspace (Sprint A.4 — Pivot).
 *
 * Surfaces:
 *   • upsertBoqResource    — add/update a resource BOM row under a BOQ line.
 *   • deleteBoqResource    — remove a BOM row.
 *   • assignControlSubchapter — link a BOQ line to a control subchapter
 *                                (for cost roll-up).
 *
 * RLS is enforced by the database via `user_has_company_access`; we simply
 * resolve the active company from the cookie and refuse if it is missing.
 * All mutations are scoped to the company + verified ownership.
 */
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"

import {
  COMPANY_COOKIE_KEY,
  resolveCompanyContext,
} from "@/lib/company-context"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

type ActionResult = { ok: true } | { ok: false; error: string }

async function getContext(): Promise<
  | { ok: true; companyId: string; supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>> }
  | { ok: false; error: string }
> {
  const cookieStore = await cookies()
  const companyId = resolveCompanyContext(
    cookieStore.get(COMPANY_COOKIE_KEY)?.value,
  )
  if (!companyId) return { ok: false, error: "active company missing" }
  const supabase = await createSupabaseServerAuthClient()
  return { ok: true, companyId, supabase }
}

export async function upsertBoqResource(input: {
  projectId: string
  boqLineId: string
  resourceId: string
  conversionRatio: number
  unitCost: number
  notes?: string | null
  bomId?: string | null
}): Promise<ActionResult> {
  const ctx = await getContext()
  if (!ctx.ok) return ctx

  const conv = Number(input.conversionRatio)
  const cost = Number(input.unitCost)
  if (!Number.isFinite(conv) || conv <= 0) {
    return { ok: false, error: "יחס המרה חייב להיות גדול מאפס" }
  }
  if (!Number.isFinite(cost) || cost < 0) {
    return { ok: false, error: "עלות ליחידה לא יכולה להיות שלילית" }
  }

  // Verify the BOQ line belongs to the active company.
  const { data: line, error: lineErr } = await ctx.supabase
    .from("erp_proj_boq_lines")
    .select("id, company_id")
    .eq("id", input.boqLineId)
    .eq("company_id", ctx.companyId)
    .maybeSingle<{ id: string; company_id: string }>()
  if (lineErr || !line) {
    return { ok: false, error: "סעיף ה-BOQ לא נמצא בהקשר החברה הפעילה" }
  }

  if (input.bomId) {
    const { error } = await ctx.supabase
      .from("erp_proj_boq_resources")
      .update({
        resource_id: input.resourceId,
        conversion_ratio: conv,
        unit_cost: cost,
        notes: input.notes ?? null,
      })
      .eq("id", input.bomId)
      .eq("company_id", ctx.companyId)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await ctx.supabase
      .from("erp_proj_boq_resources")
      .insert({
        company_id: ctx.companyId,
        boq_line_id: input.boqLineId,
        resource_id: input.resourceId,
        conversion_ratio: conv,
        unit_cost: cost,
        notes: input.notes ?? null,
      })
    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          error: "המשאב הזה כבר מוקצה לסעיף — ערוך את השורה הקיימת.",
        }
      }
      return { ok: false, error: error.message }
    }
  }

  revalidatePath(`/marker-ofek/projects/${input.projectId}/planning`)
  return { ok: true }
}

export async function deleteBoqResource(input: {
  projectId: string
  bomId: string
}): Promise<ActionResult> {
  const ctx = await getContext()
  if (!ctx.ok) return ctx

  const { error } = await ctx.supabase
    .from("erp_proj_boq_resources")
    .delete()
    .eq("id", input.bomId)
    .eq("company_id", ctx.companyId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/marker-ofek/projects/${input.projectId}/planning`)
  return { ok: true }
}

export async function assignControlSubchapter(input: {
  projectId: string
  boqLineId: string
  controlSubchapterId: string | null
}): Promise<ActionResult> {
  const ctx = await getContext()
  if (!ctx.ok) return ctx

  const { error } = await ctx.supabase
    .from("erp_proj_boq_lines")
    .update({ control_subchapter_id: input.controlSubchapterId })
    .eq("id", input.boqLineId)
    .eq("company_id", ctx.companyId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/marker-ofek/projects/${input.projectId}/planning`)
  return { ok: true }
}
