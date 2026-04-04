"use server"

import { revalidatePath } from "next/cache"

import {
  buildGanttSuggestedPercentByContractLineId,
  type ContractLineBaseRow,
} from "@/lib/marker-ofek/billing-gantt-suggestions"
import { createPartialAccountFromBaseline } from "@/lib/marker-ofek/create-partial-account-from-baseline"
import { buildFieldSuggestedPercentByContractLineId } from "@/lib/marker-ofek/field-to-billing-sync"
import {
  fetchProjectBoq,
  fetchProjectTasks,
  fetchTaskBoqLinks,
} from "@/lib/marker-ofek/gantt-actions"
import { calculatePartialAccount } from "@/lib/marker-ofek/partial-account-actions"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function revalidateBillingPaths(contractId: string, partialId?: string) {
  revalidatePath("/marker-ofek/finance/billing")
  revalidatePath("/marker-ofek/billing")
  revalidatePath(`/marker-ofek/finance/contracts/${contractId}`)
  revalidatePath(`/marker-ofek/contracts/${contractId}`)
  revalidatePath("/marker-ofek/partner-finance")
  revalidatePath("/partner-finance")
  if (partialId) {
    revalidatePath(`/marker-ofek/finance/contracts/billing/${partialId}`)
  }
}

/**
 * יוצר חשבון חלקי ראשון לחוזה (ללא חשבון קודם) או את הבא אחרי האחרון,
 * עם הצעות % מהגאנט. מחזיר מזהה החשבון החדש.
 */
export async function generatePartialAccount(contractId: string): Promise<
  | { ok: true; partialAccountId: string; accountNumber: number }
  | { ok: false; error: string }
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
      .select("id, project_id, is_deleted")
      .eq("id", cid)
      .maybeSingle()
    if (cErr) throw cErr
    if (!contract || (contract as { is_deleted?: boolean }).is_deleted) {
      return { ok: false, error: "חוזה לא נמצא" }
    }

    const projectId = (contract as { project_id: string }).project_id

    const [
      { data: latestPa },
      { data: cliRows },
      { data: msRows },
      ganttTasks,
      taskBoqLinks,
      projectBoq,
    ] = await Promise.all([
      supabase
        .from("partial_accounts")
        .select("id, account_number")
        .eq("contract_id", cid)
        .eq("is_deleted", false)
        .order("account_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("contract_line_items")
        .select("id, section_number, quantity, unit_price, sort_order")
        .eq("contract_id", cid)
        .order("sort_order", { ascending: true }),
      supabase
        .from("contract_milestones")
        .select("id")
        .eq("contract_id", cid)
        .order("created_at", { ascending: true }),
      fetchProjectTasks(projectId),
      fetchTaskBoqLinks(projectId),
      fetchProjectBoq(projectId),
    ])

    const contractLinesForGantt: ContractLineBaseRow[] = (cliRows ?? []).map(
      (raw) => {
        const x = raw as {
          id: string
          section_number: string
          quantity: number | null
          unit_price: number | null
        }
        const q = Number(x.quantity ?? 0)
        const up = Number(x.unit_price ?? 0)
        return {
          id: x.id,
          section_number: String(x.section_number ?? ""),
          lineValue: roundMoney(q * up),
        }
      }
    )

    const ganttSuggestedByLineId = buildGanttSuggestedPercentByContractLineId({
      contractLines: contractLinesForGantt,
      projectBoq: projectBoq.map((b) => ({ id: b.id, item_code: b.item_code })),
      taskBoqLinks: taskBoqLinks.map((l) => ({
        task_id: l.task_id,
        boq_item_id: l.boq_item_id,
      })),
      tasks: ganttTasks,
    })

    if (latestPa) {
      const srcId = (latestPa as { id: string }).id
      const { data: lineRows, error: liErr } = await supabase
        .from("partial_account_line_items")
        .select(
          "contract_line_item_id, contract_milestone_id, quantity_current"
        )
        .eq("partial_account_id", srcId)
      if (liErr) throw liErr

      const lineStates = (lineRows ?? []).map((r) => {
        const row = r as {
          contract_line_item_id: string | null
          contract_milestone_id: string | null
          quantity_current: number | null
        }
        const qPrev = Math.min(
          100,
          Math.max(0, Number(row.quantity_current) || 0)
        )
        const cli = row.contract_line_item_id
        const sug =
          cli != null ? ganttSuggestedByLineId.get(cli) ?? null : null
        const qCur =
          sug != null ? Math.min(100, Math.max(0, sug)) : qPrev
        return {
          contract_line_item_id: row.contract_line_item_id,
          contract_milestone_id: row.contract_milestone_id,
          quantity_previous: qPrev,
          quantity_current: qCur,
        }
      })

      const res = await createPartialAccountFromBaseline({
        contractId: cid,
        sourcePartialAccountId: srcId,
        lineStates,
      })
      if (!res.ok) return res
      revalidateBillingPaths(cid, res.partialAccountId)
      return res
    }

    const lineStates: Array<{
      contract_line_item_id: string | null
      contract_milestone_id: string | null
      quantity_previous: number
      quantity_current: number
    }> = []

    for (const line of contractLinesForGantt) {
      const sug = ganttSuggestedByLineId.get(line.id) ?? 0
      lineStates.push({
        contract_line_item_id: line.id,
        contract_milestone_id: null,
        quantity_previous: 0,
        quantity_current: Math.min(100, Math.max(0, sug)),
      })
    }

    for (const m of msRows ?? []) {
      const mid = (m as { id: string }).id
      lineStates.push({
        contract_line_item_id: null,
        contract_milestone_id: mid,
        quantity_previous: 0,
        quantity_current: 0,
      })
    }

    if (lineStates.length === 0) {
      return {
        ok: false,
        error: "אין שורות כתב כמויות או אבני דרך בחוזה — לא ניתן ליצור חשבון",
      }
    }

    const res = await createPartialAccountFromBaseline({
      contractId: cid,
      sourcePartialAccountId: null,
      lineStates,
    })
    if (!res.ok) return res
    revalidateBillingPaths(cid, res.partialAccountId)
    return res
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

async function collectTaskIdsForLogs(
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>,
  logIds: string[]
): Promise<Set<string>> {
  const ids = new Set<string>()
  if (logIds.length === 0) return ids

  const { data: logs, error: lErr } = await supabase
    .from("project_daily_logs")
    .select("task_ids")
    .in("id", logIds)
  if (lErr) throw lErr

  for (const row of (logs ?? []) as Array<{ task_ids?: string[] }>) {
    for (const t of row.task_ids ?? []) {
      if (t) ids.add(String(t))
    }
  }

  const { data: mp, error: mErr } = await supabase
    .from("daily_manpower")
    .select("task_id")
    .in("project_daily_log_id", logIds)
  if (mErr) throw mErr

  for (const row of (mp ?? []) as Array<{ task_id?: string | null }>) {
    if (row.task_id) ids.add(String(row.task_id))
  }

  return ids
}

async function applyFieldTaskSetToPartialAccount(
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>,
  partialAccountId: string,
  fieldTaskIds: Set<string>
): Promise<
  | { ok: true; partialAccountId: string; updatedLineCount: number }
  | { ok: false; error: string }
> {
  const pid = partialAccountId.trim()
  if (!pid) return { ok: false, error: "חסר מזהה חשבון חלקי" }
  if (fieldTaskIds.size === 0) {
    return { ok: false, error: "אין משימות ביומני השטח שנבחרו" }
  }

  const { data: pa, error: paErr } = await supabase
    .from("partial_accounts")
    .select("id, contract_id, status, project_id, is_deleted")
    .eq("id", pid)
    .maybeSingle()
  if (paErr) throw paErr
  if (!pa || (pa as { is_deleted?: boolean }).is_deleted) {
    return { ok: false, error: "חשבון חלקי לא נמצא" }
  }
  if ((pa as { status: string }).status !== "draft") {
    return {
      ok: false,
      error: "ניתן למשוך נתוני שדה רק לחשבון במצב טיוטה",
    }
  }

  const contractId = (pa as { contract_id: string }).contract_id
  const { data: contract, error: cErr } = await supabase
    .from("contracts")
    .select("id, project_id, is_deleted")
    .eq("id", contractId)
    .maybeSingle()
  if (cErr) throw cErr
  if (!contract || (contract as { is_deleted?: boolean }).is_deleted) {
    return { ok: false, error: "חוזה לא נמצא" }
  }

  const projectId = (contract as { project_id: string }).project_id

  const [{ data: lineRows }, { data: cliRows }, ganttTasks, taskBoqLinks, projectBoq] =
    await Promise.all([
      supabase
        .from("partial_account_line_items")
        .select("id, contract_line_item_id, contract_milestone_id")
        .eq("partial_account_id", pid),
      supabase
        .from("contract_line_items")
        .select("id, section_number, quantity, unit_price")
        .eq("contract_id", contractId),
      fetchProjectTasks(projectId),
      fetchTaskBoqLinks(projectId),
      fetchProjectBoq(projectId),
    ])

  const contractLinesForGantt: ContractLineBaseRow[] = (cliRows ?? []).map(
    (raw) => {
      const x = raw as {
        id: string
        section_number: string
        quantity: number | null
        unit_price: number | null
      }
      const q = Number(x.quantity ?? 0)
      const up = Number(x.unit_price ?? 0)
      return {
        id: x.id,
        section_number: String(x.section_number ?? ""),
        lineValue: roundMoney(q * up),
      }
    }
  )

  const fieldMap = buildFieldSuggestedPercentByContractLineId({
    contractLines: contractLinesForGantt,
    projectBoq: projectBoq.map((b) => ({ id: b.id, item_code: b.item_code })),
    taskBoqLinks: taskBoqLinks.map((l) => ({
      task_id: l.task_id,
      boq_item_id: l.boq_item_id,
    })),
    tasks: ganttTasks,
    fieldTaskIds,
  })

  let updated = 0
  for (const row of lineRows ?? []) {
    const r = row as {
      id: string
      contract_line_item_id: string | null
      contract_milestone_id: string | null
    }
    const cli = r.contract_line_item_id
    if (!cli) continue
    const pct = fieldMap.get(cli)
    if (pct == null) continue
    const q = Math.min(100, Math.max(0, pct))
    const { error: uErr } = await supabase
      .from("partial_account_line_items")
      .update({ quantity_current: q })
      .eq("id", r.id)
      .eq("partial_account_id", pid)
    if (uErr) throw uErr
    updated++
  }

  if (updated === 0) {
    return {
      ok: false,
      error:
        "לא נמצאה התאמה בין משימות היומן לשורות כתב הכמויות (בדקו קישור גאנט–כמות)",
    }
  }

  const calc = await calculatePartialAccount({ partialAccountId: pid })
  if (!calc.ok) return { ok: false, error: calc.error }

  revalidateBillingPaths(contractId, pid)
  return { ok: true, partialAccountId: pid, updatedLineCount: updated }
}

/** מיישם יומן שטח מאושר יחיד על טיוטת חשבון חלקי (אותו פרויקט כמו החוזה). */
export async function syncFieldToBill(logId: string): Promise<
  | { ok: true; partialAccountId: string; updatedLineCount: number }
  | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const lid = logId.trim()
    if (!lid) return { ok: false, error: "חסר מזהה יומן" }

    const { data: log, error: logErr } = await supabase
      .from("project_daily_logs")
      .select("id, project_id, field_approval_status")
      .eq("id", lid)
      .maybeSingle()
    if (logErr) throw logErr
    if (!log) return { ok: false, error: "יומן לא נמצא" }

    const status = (log as { field_approval_status?: string })
      .field_approval_status
    if (status !== "approved") {
      return {
        ok: false,
        error: "היומן חייב להיות במצב ״מאושר לחיוב״ לפני סנכרון",
      }
    }

    const projectId = (log as { project_id: string }).project_id

    const { data: mainContract, error: mcErr } = await supabase
      .from("contracts")
      .select("id")
      .eq("project_id", projectId)
      .eq("contract_type", "main_contract")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (mcErr) throw mcErr
    const mainContractId = (mainContract as { id?: string } | null)?.id
    if (!mainContractId) {
      return { ok: false, error: "לא נמצא חוזה ראשי לפרויקט של היומן" }
    }

    const { data: draftPa, error: dErr } = await supabase
      .from("partial_accounts")
      .select("id")
      .eq("contract_id", mainContractId)
      .eq("status", "draft")
      .eq("is_deleted", false)
      .order("account_number", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (dErr) throw dErr

    const partialId = (draftPa as { id?: string } | null)?.id ?? null

    if (!partialId) {
      return {
        ok: false,
        error:
          "לא נמצא חשבון חלקי בטיוטה לחוזה הראשי — יש ליצור חשבון ממרכז החיוב",
      }
    }

    const taskIds = await collectTaskIdsForLogs(supabase, [lid])
    return applyFieldTaskSetToPartialAccount(supabase, partialId, taskIds)
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/** מציע כמויות נוכחי מכל יומני שטח מאושרים בתקופה (או בפרויקט כולו). */
export async function applyApprovedFieldLogsToPartialAccount(params: {
  partialAccountId: string
  /** YYYY-MM-DD — אופציונלי */
  periodStart?: string | null
  periodEnd?: string | null
}): Promise<
  | { ok: true; partialAccountId: string; updatedLineCount: number; logsUsed: number }
  | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const pid = params.partialAccountId.trim()
    if (!pid) return { ok: false, error: "חסר מזהה חשבון חלקי" }

    const { data: pa, error: paErr } = await supabase
      .from("partial_accounts")
      .select("contract_id, project_id, is_deleted")
      .eq("id", pid)
      .maybeSingle()
    if (paErr) throw paErr
    if (!pa || (pa as { is_deleted?: boolean }).is_deleted) {
      return { ok: false, error: "חשבון חלקי לא נמצא" }
    }

    let projectId = (pa as { project_id?: string | null }).project_id
    const contractId = (pa as { contract_id: string }).contract_id
    if (!projectId) {
      const { data: c } = await supabase
        .from("contracts")
        .select("project_id")
        .eq("id", contractId)
        .maybeSingle()
      projectId = (c as { project_id?: string } | null)?.project_id ?? null
    }
    if (!projectId) {
      return { ok: false, error: "לחשבון אין פרויקט מקושר" }
    }

    let q = supabase
      .from("project_daily_logs")
      .select("id")
      .eq("project_id", projectId)
      .eq("field_approval_status", "approved")

    const start = params.periodStart?.trim()
    const end = params.periodEnd?.trim()
    if (start && /^\d{4}-\d{2}-\d{2}$/.test(start)) {
      q = q.gte("log_date", start)
    }
    if (end && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
      q = q.lte("log_date", end)
    }

    const { data: logs, error: lErr } = await q
    if (lErr) throw lErr

    const logIds = ((logs ?? []) as Array<{ id: string }>).map((x) => x.id)
    if (logIds.length === 0) {
      return {
        ok: false,
        error: "אין יומני שטח מאושרים בתקופה — אשרו יומן או הרחיבו טווח תאריכים",
      }
    }

    const taskIds = await collectTaskIdsForLogs(supabase, logIds)
    const applied = await applyFieldTaskSetToPartialAccount(
      supabase,
      pid,
      taskIds
    )
    if (!applied.ok) return applied
    return {
      ok: true,
      partialAccountId: applied.partialAccountId,
      updatedLineCount: applied.updatedLineCount,
      logsUsed: logIds.length,
    }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
