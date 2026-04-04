"use server"

import { revalidatePath } from "next/cache"

import { updateBoqItem } from "@/lib/marker-ofek/tenders/tender-actions"
import { TENDERS_BASE, TENDERS_ROUTES } from "@/lib/marker-ofek/tenders/nav"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"
import type { RefDekelPriceRow } from "@/types/marker-ofek"

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function clampMultiplier(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1
  return Math.min(100, Math.max(0.01, n))
}

export async function getTenderDekelDefaults(tenderProjectId: string): Promise<
  | { ok: true; defaultDekelMultiplier: number }
  | { ok: false; error: string }
> {
  const id = tenderProjectId?.trim()
  if (!id) return { ok: false, error: "חסר מזהה מכרז" }
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("tender_projects")
      .select("default_dekel_multiplier")
      .eq("id", id)
      .maybeSingle()
    if (error) throw error
    const m = (data as { default_dekel_multiplier?: number } | null)?.default_dekel_multiplier
    const v = m != null && Number.isFinite(Number(m)) ? clampMultiplier(Number(m)) : 1.1
    return { ok: true, defaultDekelMultiplier: v }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function updateTenderDefaultDekelMultiplier(params: {
  tenderProjectId: string
  multiplier: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = params.tenderProjectId?.trim()
  if (!id) return { ok: false, error: "חסר מזהה מכרז" }
  const m = clampMultiplier(Number(params.multiplier))
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { error } = await supabase
      .from("tender_projects")
      .update({
        default_dekel_multiplier: m,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
    if (error) throw error
    revalidatePath(TENDERS_BASE)
    revalidatePath(TENDERS_ROUTES.boq)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function searchDekelPrices(params: {
  query: string
  /** סינון מדויק לפי קטגוריה (רצועת קטגוריות מהירה) */
  category?: string | null
  limit?: number
}): Promise<{ ok: true; rows: RefDekelPriceRow[] } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase.rpc("search_dekel_prices", {
      p_query: params.query.trim().slice(0, 200),
      p_limit: params.limit ?? 40,
      p_category: params.category?.trim() || null,
    })
    if (error) throw error
    const rows = (data ?? []) as RefDekelPriceRow[]
    return { ok: true, rows }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/**
 * מחיר יחידה ב־BoQ = מחיר דקל × מקדם.
 * אם לא הועבר מקדם — נטען `default_dekel_multiplier` ממכרש הפרויקט.
 */
export async function applyDekelPriceToBoQ(params: {
  boqItemId: string
  dekelId: string
  multiplier?: number | null
}): Promise<
  | {
      ok: true
      unitPrice: number
      description: string
      listPrice: number
      multiplierUsed: number
    }
  | { ok: false; error: string }
> {
  const boqItemId = params.boqItemId?.trim()
  const dekelId = params.dekelId?.trim()
  if (!boqItemId || !dekelId) {
    return { ok: false, error: "חסר מזהה שורה או מחירון" }
  }

  try {
    const supabase = await createSupabaseServerAuthClient()

    let mult: number
    if (params.multiplier != null && params.multiplier !== undefined && !Number.isNaN(Number(params.multiplier))) {
      mult = clampMultiplier(Number(params.multiplier))
    } else {
      const { data: boq, error: bErr } = await supabase
        .from("tender_boq_items")
        .select("tender_project_id")
        .eq("id", boqItemId)
        .maybeSingle()
      if (bErr) throw bErr
      const tpId = (boq as { tender_project_id?: string } | null)?.tender_project_id
      if (!tpId) return { ok: false, error: "שורת BoQ לא נמצאה" }
      const { data: tp, error: tErr } = await supabase
        .from("tender_projects")
        .select("default_dekel_multiplier")
        .eq("id", tpId)
        .maybeSingle()
      if (tErr) throw tErr
      const raw = (tp as { default_dekel_multiplier?: number } | null)?.default_dekel_multiplier
      mult = raw != null && Number.isFinite(Number(raw)) ? clampMultiplier(Number(raw)) : 1.1
    }

    const { data: row, error: dErr } = await supabase
      .from("ref_dekel_prices")
      .select("id, item_description, unit, list_price")
      .eq("id", dekelId)
      .maybeSingle()
    if (dErr) throw dErr
    const d = row as {
      id: string
      item_description: string | null
      unit: string | null
      list_price: number | string | null
    } | null
    if (!d) return { ok: false, error: "שורת דקל לא נמצאה" }

    const base = Number(d.list_price)
    if (!Number.isFinite(base) || base < 0) {
      return { ok: false, error: "מחיר דקל לא תקין" }
    }
    const unitPrice = roundMoney(base * mult)
    const description = (d.item_description?.trim() || "שורה ממחירון דקל").slice(0, 2000)
    const unit = d.unit?.trim() || null

    const up = await updateBoqItem({
      id: boqItemId,
      description,
      unit,
      unitPrice,
    })
    if (!up.ok) return up

    revalidatePath(TENDERS_ROUTES.boq)
    return {
      ok: true,
      unitPrice,
      description,
      listPrice: roundMoney(base),
      multiplierUsed: mult,
    }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
