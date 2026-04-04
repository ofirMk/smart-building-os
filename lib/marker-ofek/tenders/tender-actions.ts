"use server"

import { revalidatePath } from "next/cache"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { sumDirectCost } from "@/lib/marker-ofek/tenders/calc"
import { TENDERS_BASE, TENDERS_ROUTES } from "@/lib/marker-ofek/tenders/nav"
import { formatError } from "@/lib/utils"
import type { MoBoqVersion, MarkerOfekTenderBoqItemRow, MarkerOfekTenderProjectRow } from "@/types/marker-ofek"

function revalidateTenders() {
  revalidatePath(TENDERS_BASE)
  revalidatePath(TENDERS_ROUTES.pricing)
  revalidatePath(TENDERS_ROUTES.boq)
  revalidatePath(TENDERS_ROUTES.comparison)
  revalidatePath(TENDERS_ROUTES.wbs)
}

export type TenderProjectListRow = MarkerOfekTenderProjectRow & {
  winning_contract_id: string | null
}

export async function listTenderProjects(): Promise<
  { ok: true; rows: TenderProjectListRow[] } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("tender_projects")
      .select("*")
      .order("updated_at", { ascending: false })
    if (error) throw error
    const rows = (data ?? []) as MarkerOfekTenderProjectRow[]
    const ids = rows.map((r) => r.id)
    const contractByTender = new Map<string, string>()
    if (ids.length > 0) {
      const { data: wins, error: wErr } = await supabase
        .from("contracts")
        .select("id, tender_project_id")
        .in("tender_project_id", ids)
        .eq("is_deleted", false)
      if (!wErr && wins) {
        for (const w of wins as { id: string; tender_project_id: string | null }[]) {
          if (w.tender_project_id) contractByTender.set(w.tender_project_id, w.id)
        }
      }
    }
    const enriched: TenderProjectListRow[] = rows.map((r) => ({
      ...r,
      winning_contract_id: contractByTender.get(r.id) ?? null,
    }))
    return { ok: true, rows: enriched }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function getTenderProject(
  id: string
): Promise<
  { ok: true; row: MarkerOfekTenderProjectRow } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("tender_projects")
      .select("*")
      .eq("id", id)
      .maybeSingle()
    if (error) throw error
    if (!data) return { ok: false, error: "לא נמצא מכרז" }
    return { ok: true, row: data as MarkerOfekTenderProjectRow }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function createTenderProject(params: {
  name: string
  internalCode?: string | null
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const name = params.name.trim()
    if (!name) return { ok: false, error: "שם נדרש" }
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("tender_projects")
      .insert({
        name,
        internal_code: params.internalCode?.trim() || null,
        status: "draft",
        risk_percent: 0,
        overhead_percent: 0,
      })
      .select("id")
      .single()
    if (error) throw error
    revalidateTenders()
    return { ok: true, id: (data as { id: string }).id }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function updateTenderProjectPercents(params: {
  id: string
  riskPercent: number
  overheadPercent: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { error } = await supabase
      .from("tender_projects")
      .update({
        risk_percent: params.riskPercent,
        overhead_percent: params.overheadPercent,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
    if (error) throw error
    revalidateTenders()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function getDirectCostForVersion(params: {
  tenderProjectId: string
  version: MoBoqVersion
}): Promise<{ ok: true; directCost: number } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("tender_boq_items")
      .select("quantity, unit_price")
      .eq("tender_project_id", params.tenderProjectId)
      .eq("boq_version", params.version)
    if (error) throw error
    const rows = (data ?? []) as Array<{ quantity: number; unit_price: number }>
    return { ok: true, directCost: sumDirectCost(rows) }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function listBoqItems(params: {
  tenderProjectId: string
  version: MoBoqVersion
}): Promise<
  { ok: true; rows: MarkerOfekTenderBoqItemRow[] } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("tender_boq_items")
      .select("*")
      .eq("tender_project_id", params.tenderProjectId)
      .eq("boq_version", params.version)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
    if (error) throw error
    return { ok: true, rows: (data ?? []) as MarkerOfekTenderBoqItemRow[] }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function insertBoqItem(params: {
  tenderProjectId: string
  version: MoBoqVersion
  parentId?: string | null
  description: string
  unit?: string | null
  quantity: number
  unitPrice: number
  wbsCode?: string | null
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data: orderRows } = await supabase
      .from("tender_boq_items")
      .select("sort_order")
      .eq("tender_project_id", params.tenderProjectId)
      .eq("boq_version", params.version)
      .order("sort_order", { ascending: false })
      .limit(1)
    const maxSort = (orderRows?.[0] as { sort_order?: number } | undefined)?.sort_order ?? 0
    const sortOrder = maxSort + 1
    const { data, error } = await supabase
      .from("tender_boq_items")
      .insert({
        tender_project_id: params.tenderProjectId,
        parent_id: params.parentId ?? null,
        sort_order: sortOrder,
        wbs_code: params.wbsCode?.trim() || null,
        description: params.description.trim() || "שורה",
        unit: params.unit?.trim() || null,
        quantity: params.quantity,
        unit_price: params.unitPrice,
        boq_version: params.version,
      })
      .select("id")
      .single()
    if (error) throw error
    revalidateTenders()
    return { ok: true, id: (data as { id: string }).id }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function updateBoqItem(params: {
  id: string
  description?: string
  unit?: string | null
  quantity?: number
  unitPrice?: number
  wbsCode?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (params.description !== undefined) patch.description = params.description
    if (params.unit !== undefined) patch.unit = params.unit
    if (params.quantity !== undefined) patch.quantity = params.quantity
    if (params.unitPrice !== undefined) patch.unit_price = params.unitPrice
    if (params.wbsCode !== undefined) patch.wbs_code = params.wbsCode
    const supabase = await createSupabaseServerAuthClient()
    const { error } = await supabase.from("tender_boq_items").update(patch).eq("id", params.id)
    if (error) throw error
    revalidateTenders()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function deleteBoqItem(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { error } = await supabase.from("tender_boq_items").delete().eq("id", id)
    if (error) throw error
    revalidateTenders()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export type VendorQuoteWithTarget = {
  quoteId: string
  vendorName: string
  quotedUnitPrice: number
  targetUnitPrice: number
  boqDescription: string
  boqVersion: MoBoqVersion
  deviationPercent: number | null
}

export async function listVendorQuotesWithTargets(params: {
  tenderProjectId: string
}): Promise<
  { ok: true; rows: VendorQuoteWithTarget[] } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("tender_vendor_quotes")
      .select(
        `
        id,
        vendor_name,
        quoted_unit_price,
        tender_boq_item_id,
        tender_boq_items (
          description,
          unit_price,
          boq_version
        )
      `
      )
      .eq("tender_project_id", params.tenderProjectId)
    if (error) throw error
    const rows: VendorQuoteWithTarget[] = []
    for (const raw of data ?? []) {
      const q = raw as {
        id: string
        vendor_name: string
        quoted_unit_price: number
        tender_boq_item_id: string | null
        tender_boq_items:
          | {
              description: string
              unit_price: number
              boq_version: MoBoqVersion
            }
          | {
              description: string
              unit_price: number
              boq_version: MoBoqVersion
            }[]
          | null
      }
      const bi = Array.isArray(q.tender_boq_items)
        ? q.tender_boq_items[0]
        : q.tender_boq_items
      const target = Number(bi?.unit_price ?? 0)
      const quoted = Number(q.quoted_unit_price)
      let deviationPercent: number | null = null
      if (target !== 0) {
        deviationPercent = Math.round(((quoted - target) / target) * 10000) / 100
      }
      rows.push({
        quoteId: q.id,
        vendorName: q.vendor_name,
        quotedUnitPrice: quoted,
        targetUnitPrice: target,
        boqDescription: bi?.description ?? "—",
        boqVersion: bi?.boq_version ?? "final",
        deviationPercent,
      })
    }
    return { ok: true, rows }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function insertVendorQuote(params: {
  tenderProjectId: string
  tenderBoqItemId: string
  vendorName: string
  quotedUnitPrice: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { error } = await supabase.from("tender_vendor_quotes").insert({
      tender_project_id: params.tenderProjectId,
      tender_boq_item_id: params.tenderBoqItemId,
      vendor_name: params.vendorName.trim(),
      quoted_unit_price: params.quotedUnitPrice,
    })
    if (error) throw error
    revalidateTenders()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function deleteVendorQuote(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { error } = await supabase.from("tender_vendor_quotes").delete().eq("id", id)
    if (error) throw error
    revalidateTenders()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
