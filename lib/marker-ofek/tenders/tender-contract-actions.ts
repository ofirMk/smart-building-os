"use server"

import { revalidatePath } from "next/cache"

import { resolvePartnerMetricsPersona } from "@/lib/marker-ofek/partner-metrics/access"
import { TENDERS_BASE } from "@/lib/marker-ofek/tenders/nav"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import { formatError } from "@/lib/utils"
import type { MarkerOfekTenderBoqItemRow } from "@/types/marker-ofek"

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function revalidateTenderContractPaths() {
  revalidatePath(TENDERS_BASE)
  revalidatePath("/marker-ofek/contracts")
  revalidatePath("/marker-ofek/finance/contracts")
}

export type TenderLinkOption = { id: string; name: string; subtitle?: string }

export async function listProjectsForTenderLink(): Promise<
  { ok: true; rows: TenderLinkOption[] } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, internal_project_code")
      .eq("is_deleted", false)
      .order("name", { ascending: true })
      .limit(500)
    if (error) throw error
    const rows = (data ?? []).map((r) => {
      const x = r as { id: string; name: string; internal_project_code: string | null }
      return {
        id: x.id,
        name: x.name,
        subtitle: x.internal_project_code?.trim() || undefined,
      }
    })
    return { ok: true, rows }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/** ישויות לקוח לחוזה ראשי (ומוביל גם ישויות אחרות לתצוגה) */
export async function listEntitiesForTenderLink(): Promise<
  { ok: true; rows: TenderLinkOption[] } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("entities")
      .select("id, name, type")
      .eq("is_deleted", false)
      .order("type", { ascending: true })
      .order("name", { ascending: true })
      .limit(400)
    if (error) throw error
    const rows = (data ?? []).map((r) => {
      const x = r as { id: string; name: string; type: string }
      return {
        id: x.id,
        name: x.name,
        subtitle: x.type,
      }
    })
    return { ok: true, rows }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function updateTenderProjectLinks(params: {
  tenderProjectId: string
  linkedProjectId: string | null
  linkedEntityId: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { error } = await supabase
      .from("tender_projects")
      .update({
        linked_project_id: params.linkedProjectId,
        linked_entity_id: params.linkedEntityId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.tenderProjectId)
    if (error) throw error
    revalidateTenderContractPaths()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function submitTenderProject(
  tenderProjectId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data: row, error: fetchErr } = await supabase
      .from("tender_projects")
      .select("id, status")
      .eq("id", tenderProjectId)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    const st = (row as { status?: string } | null)?.status
    if (st !== "draft") {
      return { ok: false, error: "ניתן להגיש רק מכרז במצב טיוטה" }
    }
    const { error } = await supabase
      .from("tender_projects")
      .update({ status: "submitted", updated_at: new Date().toISOString() })
      .eq("id", tenderProjectId)
    if (error) throw error
    revalidateTenderContractPaths()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

function finalBoqLeaves(rows: MarkerOfekTenderBoqItemRow[]): MarkerOfekTenderBoqItemRow[] {
  const finalRows = rows.filter((r) => r.boq_version === "final")
  const idsWithChildren = new Set<string>()
  for (const r of finalRows) {
    if (r.parent_id) idsWithChildren.add(r.parent_id)
  }
  const leaves = finalRows.filter((r) => !idsWithChildren.has(r.id))
  return leaves.length > 0 ? leaves : finalRows
}

export type ConvertTenderToContractResult =
  | {
      ok: true
      contractId: string
      alreadyConverted: boolean
      /** סכום חוזה כולל (₪) — לתצוגה ב־UI */
      totalAmount: number | null
    }
  | { ok: false; error: string }

/**
 * המרת מכרז מנצח לחוזה פעיל — מותר לאופיר בלבד (פעולה פיננסית רמה גבוהה).
 * אידמפוטנטי: מכרז שכבר הומר מחזיר את מזהה החוזה הקיים.
 */
export async function convertTenderToContract(
  tenderProjectId: string
): Promise<ConvertTenderToContractResult> {
  const id = tenderProjectId?.trim()
  if (!id) return { ok: false, error: "חסר מזהה מכרז" }

  try {
    const auth = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await auth.auth.getUser()
    const email = user?.email ?? null
    if (resolvePartnerMetricsPersona(email) !== "ophir") {
      return { ok: false, error: "אין הרשאה — פעולה זו זמינה למנהל הפורטפוליו בלבד" }
    }

    const supabase = createSupabaseServiceRoleClient()

    const { data: tender, error: tErr } = await supabase
      .from("tender_projects")
      .select(
        "id, name, internal_code, status, linked_project_id, linked_entity_id"
      )
      .eq("id", id)
      .maybeSingle()
    if (tErr) throw tErr
    if (!tender) return { ok: false, error: "מכרז לא נמצא" }

    const tp = tender as {
      id: string
      name: string
      internal_code: string | null
      status: string
      linked_project_id: string | null
      linked_entity_id: string | null
    }

    const { data: existingByTender } = await supabase
      .from("contracts")
      .select("id, total_amount")
      .eq("tender_project_id", id)
      .maybeSingle()

    if (existingByTender?.id) {
      revalidateTenderContractPaths()
      const row = existingByTender as { id: string; total_amount: number | null }
      return {
        ok: true,
        contractId: row.id,
        alreadyConverted: true,
        totalAmount: row.total_amount != null ? roundMoney(Number(row.total_amount)) : null,
      }
    }

    if (tp.status === "won") {
      return { ok: false, error: "המכרז מסומן כנוצח ללא רשומת חוזה — פנה למנהל מערכת" }
    }

    if (tp.status !== "submitted") {
      return { ok: false, error: "ניתן להפוך לחוזה רק מכרז במצב 'הוגש'" }
    }

    if (!tp.linked_project_id || !tp.linked_entity_id) {
      return {
        ok: false,
        error: "יש לקשר פרויקט וישות (לקוח) למכרז לפני ניצוח",
      }
    }

    const { data: boqRows, error: bErr } = await supabase
      .from("tender_boq_items")
      .select("*")
      .eq("tender_project_id", id)
      .eq("boq_version", "final")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
    if (bErr) throw bErr

    const leaves = finalBoqLeaves((boqRows ?? []) as MarkerOfekTenderBoqItemRow[])
    if (leaves.length === 0) {
      return { ok: false, error: "אין שורות בכתב כמויות בגרסת final" }
    }

    let total = 0
    for (const line of leaves) {
      const q = Number(line.quantity) || 0
      const up = Number(line.unit_price) || 0
      total += q * up
    }
    total = roundMoney(total)

    const agreementLabel = "כתב כמויות"
    const insertPayload: Record<string, unknown> = {
      project_id: tp.linked_project_id,
      entity_id: tp.linked_entity_id,
      contract_type: "main_contract",
      agreement_type: agreementLabel,
      pricing_model: "boq",
      retention_pct: 5,
      insurance_pct: 0.6,
      testing_pct: 0,
      total_amount: total,
      status: "active",
      name: tp.name.trim() || "חוזה ממכרז",
      contract_number: tp.internal_code?.trim() || null,
      tender_project_id: id,
      is_deleted: false,
    }

    const { data: newContract, error: cIns } = await supabase
      .from("contracts")
      .insert(insertPayload)
      .select("id")
      .single()

    if (cIns) {
      if (cIns.code === "23505") {
        const { data: again } = await supabase
          .from("contracts")
          .select("id")
          .eq("tender_project_id", id)
          .maybeSingle()
        if (again?.id) {
          const { data: full } = await supabase
            .from("contracts")
            .select("total_amount")
            .eq("id", (again as { id: string }).id)
            .maybeSingle()
          const ta = (full as { total_amount: number | null } | null)?.total_amount
          return {
            ok: true,
            contractId: (again as { id: string }).id,
            alreadyConverted: true,
            totalAmount: ta != null ? roundMoney(Number(ta)) : null,
          }
        }
      }
      throw cIns
    }

    const contractId = (newContract as { id: string }).id

    const linePayload = leaves.map((line, i) => {
      const q = Number(line.quantity) || 0
      const up = Number(line.unit_price) || 0
      const lineVal = roundMoney(q * up)
      const wp = total > 0 ? roundMoney((lineVal / total) * 100) : 0
      const section = (line.wbs_code?.trim() || "—").slice(0, 120)
      return {
        contract_id: contractId,
        section_number: section,
        description: line.description?.trim() || "שורה",
        unit: line.unit?.trim() || null,
        quantity: q,
        unit_price: roundMoney(up),
        sort_order: i,
        wbs_weight_percent: wp,
      }
    })

    const { error: liErr } = await supabase.from("contract_line_items").insert(linePayload)
    if (liErr) {
      await supabase.from("contracts").delete().eq("id", contractId)
      throw liErr
    }

    const { error: uErr } = await supabase
      .from("tender_projects")
      .update({ status: "won", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "submitted")
    if (uErr) {
      await supabase.from("contracts").delete().eq("id", contractId)
      throw uErr
    }

    revalidateTenderContractPaths()
    revalidatePath(`/marker-ofek/finance/contracts/${contractId}`)
    revalidatePath(`/marker-ofek/contracts/${contractId}`)

    return { ok: true, contractId, alreadyConverted: false, totalAmount: total }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
