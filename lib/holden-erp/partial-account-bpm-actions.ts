"use server"

import { revalidatePath } from "next/cache"

import {
  DEFAULT_RETAINAGE_PERCENT,
  assertTransitionOrder,
  bpmStatusToDb,
  dbStatusToBpm,
  validatePartialAccountApprovalAgainstBoq,
  type BpmPartialAccountState,
  type DbPartialAccountStatus,
} from "@/lib/bpm-engine"
import { calculatePartialAccount } from "@/lib/marker-ofek/partial-account-actions"
import { createPartialAccountFromBaseline } from "@/lib/marker-ofek/create-partial-account-from-baseline"
import { generateJournalEntryFromAccount } from "@/lib/holden-erp/gl-actions"
import { checkSupplierTaxCompliance } from "@/lib/holden-erp/supplier-compliance"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

type LineState = {
  contract_line_item_id: string | null
  contract_milestone_id: string | null
  quantity_previous: number
  quantity_current: number
}

/**
 * יוצר חשבון חלקי חדש מחוזה פעיל — שורות מסונכרנות עם כתב הכמויות / אבני הדרך,
 * עם אחוזים מצטברים מהחשבון האחרון (אם קיים).
 */
export async function holdenGeneratePartialAccountFromActiveContract(contractId: string): Promise<
  { ok: true; partialAccountId: string; accountNumber: number } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const cid = contractId.trim()
    if (!cid) return { ok: false, error: "חסר מזהה חוזה" }

    const { data: contract, error: cErr } = await supabase
      .from("contracts")
      .select("id, status, pricing_model, is_deleted, entity_id")
      .eq("id", cid)
      .maybeSingle()

    if (cErr) throw cErr
    const c = contract as {
      is_deleted?: boolean
      status?: string
      pricing_model?: string
      entity_id?: string
    } | null
    if (!c || c.is_deleted) {
      return { ok: false, error: "חוזה לא נמצא" }
    }
    if (c.status !== "active") {
      return { ok: false, error: "ניתן ליצור חשבון חלקי רק מחוזה בסטטוס פעיל" }
    }

    const { data: lastPa } = await supabase
      .from("partial_accounts")
      .select("id")
      .eq("contract_id", cid)
      .eq("is_deleted", false)
      .order("account_number", { ascending: false })
      .limit(1)
      .maybeSingle()

    const prevByKey = new Map<string, number>()
    if (lastPa?.id) {
      const { data: pli } = await supabase
        .from("partial_account_line_items")
        .select("contract_line_item_id, contract_milestone_id, quantity_current")
        .eq("partial_account_id", lastPa.id)
      for (const row of pli ?? []) {
        const r = row as {
          contract_line_item_id?: string | null
          contract_milestone_id?: string | null
          quantity_current?: number | null
        }
        const q = Math.min(100, Math.max(0, Number(r.quantity_current ?? 0)))
        if (r.contract_line_item_id) prevByKey.set(`li:${r.contract_line_item_id}`, q)
        if (r.contract_milestone_id) prevByKey.set(`ms:${r.contract_milestone_id}`, q)
      }
    }

    const lineStates: LineState[] = []
    const pricing = (c.pricing_model ?? "boq").toLowerCase()

    if (pricing === "boq") {
      const { data: items, error: liErr } = await supabase
        .from("contract_line_items")
        .select("id")
        .eq("contract_id", cid)
        .order("sort_order", { ascending: true })
      if (liErr) throw liErr
      for (const li of items ?? []) {
        const id = (li as { id: string }).id
        const prev = prevByKey.get(`li:${id}`) ?? 0
        lineStates.push({
          contract_line_item_id: id,
          contract_milestone_id: null,
          quantity_previous: prev,
          quantity_current: prev,
        })
      }
    } else {
      const { data: milestones, error: mErr } = await supabase
        .from("contract_milestones")
        .select("id")
        .eq("contract_id", cid)
        .order("sort_order", { ascending: true })
      if (mErr) throw mErr
      for (const m of milestones ?? []) {
        const id = (m as { id: string }).id
        const prev = prevByKey.get(`ms:${id}`) ?? 0
        lineStates.push({
          contract_line_item_id: null,
          contract_milestone_id: id,
          quantity_previous: prev,
          quantity_current: prev,
        })
      }
    }

    if (!lineStates.length) {
      return { ok: false, error: "אין שורות בחוזה (כתב כמויות או אבני דרך)" }
    }

    const now = new Date()
    const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`

    const baseline = await createPartialAccountFromBaseline({
      contractId: cid,
      sourcePartialAccountId: lastPa?.id ?? null,
      lineStates,
    })

    if (!baseline.ok) return baseline

    await supabase
      .from("partial_accounts")
      .update({
        account_period: periodStart,
        counterparty_entity_id: c.entity_id ?? null,
      })
      .eq("id", baseline.partialAccountId)

    revalidatePath("/marker-ofek/holden-erp")
    revalidatePath(`/marker-ofek/holden-erp/partial-accounts/${baseline.partialAccountId}`)
    return baseline
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

async function loadApprovedVoExists(
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>,
  contractId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("contract_variation_orders")
    .select("id")
    .eq("contract_id", contractId)
    .eq("status", "approved")
    .limit(1)
  if (error) return false
  return (data?.length ?? 0) > 0
}

/**
 * אישור חשבון חלקי / חשבון קבלן משנה — כולל אכיפת כלל כתב כמויות מול VO מאושר.
 */
export async function holdenApproveSubcontractorPartialAccount(
  partialAccountId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const pid = partialAccountId.trim()
    if (!pid) return { ok: false, error: "חסר מזהה חשבון" }

    const { data: pa, error: paErr } = await supabase
      .from("partial_accounts")
      .select("id, contract_id, status, is_deleted")
      .eq("id", pid)
      .maybeSingle()

    if (paErr) throw paErr
    const row = pa as {
      contract_id: string
      status: DbPartialAccountStatus
      is_deleted?: boolean
    } | null
    if (!row || row.is_deleted) {
      return { ok: false, error: "חשבון לא נמצא" }
    }

    const fromBpm = dbStatusToBpm(row.status)
    const gate = assertTransitionOrder(fromBpm, "approved")
    if (!gate.ok) return gate

    const { data: lines, error: liErr } = await supabase
      .from("partial_account_line_items")
      .select("quantity_current")
      .eq("partial_account_id", pid)

    if (liErr) throw liErr

    const percents = (lines ?? []).map((x) =>
      Number((x as { quantity_current?: number | null }).quantity_current ?? 0)
    )

    const hasVo = await loadApprovedVoExists(supabase, row.contract_id)
    const boq = validatePartialAccountApprovalAgainstBoq({
      lineCumulativePercents: percents,
      hasApprovedChangeOrder: hasVo,
    })
    if (!boq.ok) return boq

    const calc = await calculatePartialAccount({
      partialAccountId: pid,
      nextStatus: "approved",
    })
    if (!calc.ok) return { ok: false, error: calc.error }

    const gl = await generateJournalEntryFromAccount(pid)
    if (!gl.ok) {
      const rev = await calculatePartialAccount({
        partialAccountId: pid,
        nextStatus: "submitted",
      })
      const revNote = rev.ok ? "" : ` (גם החזרת סטטוס נכשלה: ${rev.error})`
      return {
        ok: false,
        error: `אושר במערכת אך רישום יומן GL נכשל: ${gl.error}${revNote}`,
      }
    }

    revalidatePath("/marker-ofek/holden-erp")
    revalidatePath(`/marker-ofek/holden-erp/partial-accounts/${pid}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/**
 * מסמן שליחה לנגד (אחרי אישור).
 */
export async function holdenMarkPartialAccountSent(
  partialAccountId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  return transitionPartialAccount(partialAccountId, "sent")
}

/**
 * מסמן תשלום סופי — כולל בדיקת תאימות מס/אישורי ספק לפני מעבר ל־paid.
 */
export async function holdenMarkPartialAccountPaid(
  partialAccountId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const pid = partialAccountId.trim()
    if (!pid) return { ok: false, error: "חסר מזהה חשבון" }

    const { data: pa, error: paErr } = await supabase
      .from("partial_accounts")
      .select("id, contract_id, counterparty_entity_id, is_deleted")
      .eq("id", pid)
      .maybeSingle()

    if (paErr) throw paErr
    const row = pa as {
      contract_id: string
      counterparty_entity_id?: string | null
      is_deleted?: boolean
    } | null
    if (!row || row.is_deleted) return { ok: false, error: "חשבון לא נמצא" }

    let entityId: string | null = row.counterparty_entity_id ?? null
    if (!entityId) {
      const { data: ctr } = await supabase
        .from("contracts")
        .select("entity_id")
        .eq("id", row.contract_id)
        .maybeSingle()
      entityId = (ctr as { entity_id?: string } | null)?.entity_id ?? null
    }

    if (entityId) {
      const comp = await checkSupplierTaxCompliance(entityId)
      if (!comp.ok) {
        return { ok: false, error: comp.reason }
      }
    }

    return transitionPartialAccount(partialAccountId, "paid")
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

async function transitionPartialAccount(
  partialAccountId: string,
  target: BpmPartialAccountState
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const pid = partialAccountId.trim()
    if (!pid) return { ok: false, error: "חסר מזהה חשבון" }

    const { data: pa, error: paErr } = await supabase
      .from("partial_accounts")
      .select("id, status, is_deleted")
      .eq("id", pid)
      .maybeSingle()

    if (paErr) throw paErr
    const row = pa as { status: DbPartialAccountStatus; is_deleted?: boolean } | null
    if (!row || row.is_deleted) return { ok: false, error: "חשבון לא נמצא" }

    const fromBpm = dbStatusToBpm(row.status)
    const gate = assertTransitionOrder(fromBpm, target)
    if (!gate.ok) return gate

    const dbNext = bpmStatusToDb(target)
    const { error: upErr } = await supabase
      .from("partial_accounts")
      .update({ status: dbNext })
      .eq("id", pid)

    if (upErr) throw upErr

    revalidatePath("/marker-ofek/holden-erp")
    revalidatePath(`/marker-ofek/holden-erp/partial-accounts/${pid}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/**
 * מעדכן עיכבון ל־5% בחוזה ומחשב מחדש את החשבון החלקי (ניכוי עיכבון אוטומטי).
 */
export async function holdenApplyDefaultRetainageAndRecalculate(
  partialAccountId: string,
  contractId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const pid = partialAccountId.trim()
    const cid = contractId.trim()
    if (!pid || !cid) return { ok: false, error: "חסרים מזהים" }

    const { error: ruleErr } = await supabase.from("contract_deduction_rules").upsert(
      {
        contract_id: cid,
        deduction_kind: "retention",
        percent: roundMoney(DEFAULT_RETAINAGE_PERCENT),
      },
      { onConflict: "contract_id,deduction_kind" }
    )

    if (ruleErr) throw ruleErr

    const { error: cErr } = await supabase
      .from("contracts")
      .update({ retention_pct: roundMoney(DEFAULT_RETAINAGE_PERCENT) })
      .eq("id", cid)

    if (cErr) throw cErr

    const calc = await calculatePartialAccount({ partialAccountId: pid })
    if (!calc.ok) return { ok: false, error: calc.error }

    const { data: pa } = await supabase
      .from("partial_accounts")
      .select("retention_deduction")
      .eq("id", pid)
      .maybeSingle()

    const retention = Number((pa as { retention_deduction?: number } | null)?.retention_deduction ?? 0)

    await supabase.from("partial_account_deduction_lines").delete().eq("partial_account_id", pid)
    if (retention > 0) {
      await supabase.from("partial_account_deduction_lines").insert({
        partial_account_id: pid,
        deduction_kind: "retainage",
        label: `עיכבון ${DEFAULT_RETAINAGE_PERCENT}%`,
        amount: roundMoney(retention),
        sort_order: 0,
      })
    }

    revalidatePath(`/marker-ofek/holden-erp/partial-accounts/${pid}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/**
 * שליחה לאישור (טיוטה → ממתין לאישור).
 */
export async function holdenSubmitPartialAccountForApproval(
  partialAccountId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const calc = await calculatePartialAccount({ partialAccountId })
  if (!calc.ok) return { ok: false, error: calc.error }
  return transitionPartialAccount(partialAccountId, "pending_approval")
}
