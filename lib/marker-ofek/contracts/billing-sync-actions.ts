"use server"

import { revalidatePath } from "next/cache"
import { format, subYears } from "date-fns"

import type { ContractLineBaseRow } from "@/lib/marker-ofek/billing-gantt-suggestions"
import {
  buildFieldSuggestedPercentByContractLineId,
  buildFieldToBillingGraph,
  fieldContributingTaskRows,
} from "@/lib/marker-ofek/field-to-billing-sync"
import {
  fetchProjectBoq,
  fetchProjectTasks,
  fetchTaskBoqLinks,
} from "@/lib/marker-ofek/gantt-actions"
import { calculatePartialAccount } from "@/lib/marker-ofek/partial-account-actions"
import { roundMoney } from "@/lib/marker-ofek/partial-account-calc"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

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

const MANPOWER_ROLE_HE: Record<string, string> = {
  project_manager: "מנהל פרויקט",
  team_lead: "ראש צוות",
  certified_electrician: "חשמלאי מוסמך",
  assistant: "עוזר",
  subcontractor_crew: "צוות ספק ביצוע",
}

function snippet(text: string, max = 120): string {
  const t = text.replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

function buildLineWarnings(input: {
  rawSuggestedPercent: number
  contributingTasks: Array<{ progress: number | string | null | undefined }>
}): string[] {
  const w: string[] = []
  const raw = Number(input.rawSuggestedPercent)
  if (!Number.isFinite(raw)) return w
  const anyComplete = input.contributingTasks.some(
    (t) => Number(t.progress) >= 99.5
  )
  if (raw > 100) {
    w.push("ההצעה מעל 100% — דורשת התאמה, VO או אישור מפורש לפני החיוב")
  }
  if (anyComplete && raw > 100) {
    w.push(
      "משימה מקושרת מסומנת כבוצעה בגאנט (100%) — לא לחייב מעל תקרת אחוז/כמות החוזה ללא הסבר"
    )
  }
  return w
}

export type BillingSyncFieldReportRow = {
  logId: string
  logDate: string
  approvalStatus: "draft" | "approved"
  includedInSuggestion: boolean
  crewCount: number
  workPerformedSnippet: string
  taskIds: string[]
  manpowerLines: Array<{
    id: string
    role: string
    roleLabelHe: string
    count: number
    hours: number
    taskId: string | null
    taskName: string | null
  }>
}

export type BillingSyncLineSuggestion = {
  partialLineItemId: string
  contractLineItemId: string
  sectionLabel: string
  descriptionSnippet: string
  contractQuantity: number | null
  quantityPrevious: number
  quantityCurrentBefore: number
  rawSuggestedPercent: number
  modelSuggestedPercent: number
  warnings: string[]
  contributingTasks: Array<{ id: string; name: string; progress: number }>
}

export type BillingSyncSuggestPayload = {
  projectId: string
  contractId: string
  period: { startIso: string; endIso: string; rationaleHe: string }
  approvedLogCount: number
  totalLogCount: number
  fieldReports: BillingSyncFieldReportRow[]
  lineSuggestions: BillingSyncLineSuggestion[]
}

async function resolveBillingPeriod(
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>,
  partialId: string,
  contractId: string,
  projectId: string
): Promise<{ startIso: string; endIso: string; rationaleHe: string }> {
  const { data: pa, error: paErr } = await supabase
    .from("partial_accounts")
    .select("account_number, created_at")
    .eq("id", partialId)
    .maybeSingle()
  if (paErr) throw paErr

  const accNum = Number((pa as { account_number?: number }).account_number ?? 1)

  const { data: prev, error: pErr } = await supabase
    .from("partial_accounts")
    .select("created_at")
    .eq("contract_id", contractId)
    .eq("is_deleted", false)
    .lt("account_number", accNum)
    .order("account_number", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (pErr) throw pErr

  const { data: proj, error: prErr } = await supabase
    .from("projects")
    .select("start_date")
    .eq("id", projectId)
    .maybeSingle()
  if (prErr) throw prErr

  let startIso: string
  let rationaleHe: string

  if (prev?.created_at) {
    startIso = format(new Date((prev as { created_at: string }).created_at), "yyyy-MM-dd")
    rationaleHe = `מתאריך יצירת החשבון החלקי הקודם (${startIso})`
  } else {
    const sd = (proj as { start_date?: string | null } | null)?.start_date
    if (sd && /^\d{4}-\d{2}-\d{2}$/.test(sd)) {
      startIso = sd
      rationaleHe = `מתאריך תחילת הפרויקט בחוזה (${startIso})`
    } else {
      startIso = format(subYears(new Date(), 1), "yyyy-MM-dd")
      rationaleHe = "שנה אחורה — אין חשבון חלקי קודם ואין תאריך התחלה בפרויקט"
    }
  }

  const endIso = format(new Date(), "yyyy-MM-dd")
  return { startIso, endIso, rationaleHe }
}

/**
 * מזהה פרויקט וטווח תאריכים לחשבון, שולף יומני שטח וכוח אדם,
 * מצטבר ביצוע מהשטח (יומנים מאושרים) וממפה לשורות כתב הכמויות.
 */
export async function suggestBillingQuantities(
  partialAccountId: string
): Promise<
  { ok: true; data: BillingSyncSuggestPayload } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const pid = partialAccountId.trim()
    if (!pid) return { ok: false, error: "חסר מזהה חשבון חלקי" }

    const { data: pa, error: paErr } = await supabase
      .from("partial_accounts")
      .select("id, contract_id, project_id, is_deleted")
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

    const period = await resolveBillingPeriod(supabase, pid, contractId, projectId)

    const { data: logsRaw, error: logErr } = await supabase
      .from("project_daily_logs")
      .select(
        "id, log_date, field_approval_status, crew_count, work_performed, task_ids"
      )
      .eq("project_id", projectId)
      .gte("log_date", period.startIso)
      .lte("log_date", period.endIso)
      .order("log_date", { ascending: false })
    if (logErr) throw logErr

    const logs = (logsRaw ?? []) as Array<{
      id: string
      log_date: string
      field_approval_status: string
      crew_count: number | null
      work_performed: string | null
      task_ids: string[] | null
    }>

    const logIds = logs.map((l) => l.id)
    let manpowerByLog = new Map<
      string,
      Array<{
        id: string
        role: string
        count: number
        hours: number
        task_id: string | null
      }>
    >()

    if (logIds.length > 0) {
      const { data: mpRows, error: mpErr } = await supabase
        .from("daily_manpower")
        .select("id, project_daily_log_id, role, count, hours, task_id")
        .in("project_daily_log_id", logIds)
      if (mpErr) throw mpErr
      manpowerByLog = new Map()
      for (const row of (mpRows ?? []) as Array<{
        id: string
        project_daily_log_id: string
        role: string
        count: number
        hours: number
        task_id: string | null
      }>) {
        const list = manpowerByLog.get(row.project_daily_log_id) ?? []
        list.push({
          id: row.id,
          role: row.role,
          count: row.count,
          hours: Number(row.hours),
          task_id: row.task_id,
        })
        manpowerByLog.set(row.project_daily_log_id, list)
      }
    }

    const [ganttTasks, taskBoqLinks, projectBoq, { data: cliRows }, { data: paliRows }] =
      await Promise.all([
        fetchProjectTasks(projectId),
        fetchTaskBoqLinks(projectId),
        fetchProjectBoq(projectId),
        supabase
          .from("contract_line_items")
          .select("id, section_number, description, quantity, unit_price")
          .eq("contract_id", contractId),
        supabase
          .from("partial_account_line_items")
          .select(
            "id, contract_line_item_id, contract_milestone_id, quantity_previous, quantity_current"
          )
          .eq("partial_account_id", pid),
      ])

    const taskNameById = new Map(
      ganttTasks.map((t) => [t.id, String(t.name ?? "").trim() || "משימה"])
    )

    const approvedLogIds = logs
      .filter((l) => l.field_approval_status === "approved")
      .map((l) => l.id)
    const fieldTaskIds = await collectTaskIdsForLogs(supabase, approvedLogIds)

    const contractLinesForGantt: ContractLineBaseRow[] = (cliRows ?? []).map(
      (raw) => {
        const x = raw as {
          id: string
          section_number: string
          quantity: number | null
          unit_price: number | null
          description?: string
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

    const cliById = new Map(
      (cliRows ?? []).map((raw) => {
        const x = raw as {
          id: string
          section_number: string
          description: string | null
          quantity: number | null
        }
        return [
          x.id,
          {
            section_number: String(x.section_number ?? ""),
            description: String(x.description ?? ""),
            quantity: x.quantity != null ? Number(x.quantity) : null,
          },
        ] as const
      })
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

    const graph = buildFieldToBillingGraph({
      projectBoq: projectBoq.map((b) => ({ id: b.id, item_code: b.item_code })),
      taskBoqLinks: taskBoqLinks.map((l) => ({
        task_id: l.task_id,
        boq_item_id: l.boq_item_id,
      })),
      tasks: ganttTasks,
    })

    const fieldReports: BillingSyncFieldReportRow[] = logs.map((l) => {
      const st = l.field_approval_status === "approved" ? "approved" : "draft"
      const mp = manpowerByLog.get(l.id) ?? []
      return {
        logId: l.id,
        logDate: l.log_date,
        approvalStatus: st,
        includedInSuggestion: st === "approved",
        crewCount: Number(l.crew_count ?? 0),
        workPerformedSnippet: snippet(String(l.work_performed ?? "")),
        taskIds: [...(l.task_ids ?? [])].map(String),
        manpowerLines: mp.map((m) => ({
          id: m.id,
          role: m.role,
          roleLabelHe: MANPOWER_ROLE_HE[m.role] ?? m.role,
          count: m.count,
          hours: m.hours,
          taskId: m.task_id,
          taskName: m.task_id ? taskNameById.get(m.task_id) ?? null : null,
        })),
      }
    })

    const lineSuggestions: BillingSyncLineSuggestion[] = []
    for (const row of paliRows ?? []) {
      const r = row as {
        id: string
        contract_line_item_id: string | null
        contract_milestone_id: string | null
        quantity_previous: number | null
        quantity_current: number | null
      }
      if (r.contract_milestone_id || !r.contract_line_item_id) continue
      const cli = r.contract_line_item_id
      const rawPct = fieldMap.get(cli)
      if (rawPct == null) continue

      const lineMeta = cliById.get(cli)
      const contractLine = contractLinesForGantt.find((x) => x.id === cli)
      if (!lineMeta || !contractLine) continue

      const contributing = fieldContributingTaskRows(graph, contractLine, fieldTaskIds)
      const rawSuggested = Number(rawPct)
      const modelSuggested = Math.min(100, Math.max(0, rawSuggested))
      const qPrev = Math.min(
        100,
        Math.max(0, Number(r.quantity_previous) || 0)
      )
      const qCurBefore = Math.min(
        100,
        Math.max(0, Number(r.quantity_current) || 0)
      )

      lineSuggestions.push({
        partialLineItemId: r.id,
        contractLineItemId: cli,
        sectionLabel: lineMeta.section_number,
        descriptionSnippet: snippet(lineMeta.description, 80),
        contractQuantity: lineMeta.quantity,
        quantityPrevious: qPrev,
        quantityCurrentBefore: qCurBefore,
        rawSuggestedPercent: rawSuggested,
        modelSuggestedPercent: modelSuggested,
        warnings: buildLineWarnings({
          rawSuggestedPercent: rawSuggested,
          contributingTasks: contributing,
        }),
        contributingTasks: contributing.map((t) => ({
          id: t.id,
          name: String(t.name ?? "").trim() || "משימה",
          progress: Number(t.progress) || 0,
        })),
      })
    }

    return {
      ok: true,
      data: {
        projectId,
        contractId,
        period,
        approvedLogCount: approvedLogIds.length,
        totalLogCount: logs.length,
        fieldReports,
        lineSuggestions,
      },
    }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/**
 * מיישם אחוזי ביצוע נוכחי לאחר אישור/התאמה במגירת הסנכרון.
 */
export async function applyBillingSyncSuggestions(params: {
  partialAccountId: string
  patches: Array<{ partialLineItemId: string; quantity_current: number }>
}): Promise<
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

    const pid = params.partialAccountId.trim()
    if (!pid) return { ok: false, error: "חסר מזהה חשבון חלקי" }
    if (!params.patches.length) {
      return { ok: false, error: "אין שינויים ליישום" }
    }

    const { data: pa, error: paErr } = await supabase
      .from("partial_accounts")
      .select("id, contract_id, status, is_deleted")
      .eq("id", pid)
      .maybeSingle()
    if (paErr) throw paErr
    if (!pa || (pa as { is_deleted?: boolean }).is_deleted) {
      return { ok: false, error: "חשבון חלקי לא נמצא" }
    }
    if ((pa as { status: string }).status !== "draft") {
      return {
        ok: false,
        error: "ניתן לסנכרן רק חשבון חלקי במצב טיוטה",
      }
    }

    const contractId = (pa as { contract_id: string }).contract_id
    let updated = 0

    for (const p of params.patches) {
      const q = Math.min(100, Math.max(0, Number(p.quantity_current) || 0))
      const { error: uErr } = await supabase
        .from("partial_account_line_items")
        .update({ quantity_current: q })
        .eq("id", p.partialLineItemId.trim())
        .eq("partial_account_id", pid)
      if (uErr) throw uErr
      updated++
    }

    const calc = await calculatePartialAccount({ partialAccountId: pid })
    if (!calc.ok) return { ok: false, error: calc.error }

    revalidateBillingPaths(contractId, pid)
    return { ok: true, partialAccountId: pid, updatedLineCount: updated }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
