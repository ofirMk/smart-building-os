"use server"

import { revalidatePath } from "next/cache"
import { addDays, format } from "date-fns"
import { GoogleGenerativeAI } from "@google/generative-ai"

import { isProjectInManagingPartnerScope } from "@/lib/marker-ofek/effective-managing-partner-scope"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { calculateTaskDates, canonicalWbsFlatIds } from "@/lib/marker-ofek/wbs-schedule"
import { wouldCreateDependencyCycle } from "@/lib/marker-ofek/wbs-dag"
import { addWorkingDays, diffWorkingDaysWithHolidaySet } from "@/lib/utils/calendar-utils"

export type GanttTaskRow = {
  id: string
  project_id: string
  parent_id: string | null
  /** Master schedule task for subcontractor derivative rows (not WBS parent_id). */
  parent_task_id: string | null
  subcontractor_id: string | null
  contract_id: string | null
  is_derivative: boolean
  name: string
  description: string | null
  start_date: string | null
  end_date: string | null
  actual_start_date: string | null
  actual_end_date: string | null
  progress: number
  dependency_ids: string[]
  /** WBS outline depth (0 = root). */
  level: number
  /** 1-based row# of FS predecessor in canonical flat WBS (optional). */
  predecessor_index: number | null
  /** Stable FK to predecessor task (FS). */
  predecessor_task_id: string | null
  /** Sibling order under the same parent. */
  wbs_order: number
  /** Optional display code (e.g. 1.2.3); hierarchy from parent_id + dependency_ids. */
  wbs_code: string | null
  /** Populated when row was created from WBS import — links vault docs via project_plan_links. */
  source_wbs_node_id: string | null
  /** Per-predecessor working-day lag (negative = lead). */
  dependency_lags: Record<string, number>
  estimated_cost: number
  actual_cost: number
  /** תוויות קיבוץ גאנט: בניין → קומה (אופציונלי) */
  building_label: string | null
  floor_label: string | null
}

type UpdateTaskDatesInput = {
  taskId: string
  projectId: string
  startDate: string | null
  endDate: string | null
}

type CreateTaskInput = {
  projectId: string
  parentId?: string | null
  name: string
  description?: string | null
  startDate?: string | null
  endDate?: string | null
  estimatedCost?: number
  actualCost?: number
  progress?: number
}

export type ProjectResourceRow = {
  id: string
  name: string
  profession: string
  cost_per_day: number
  availability_status: "available" | "unavailable" | "vacation"
}

export type ResourceVacationRow = {
  id: string
  resource_id: string
  start_date: string
  end_date: string
  notes: string | null
}

export type TaskResourceAssignmentRow = {
  id: string
  task_id: string
  resource_id: string
  project_id: string
  task_name: string
  start_date: string | null
  end_date: string | null
  /** יחידות / מגבלת כוח־אדם יומית (למשימה) */
  units: number | null
}

export type ResourceGridRow = {
  id: string
  name: string
  profession: string
  cost_per_day: number
  availability_status: "available" | "unavailable" | "vacation"
  conflict_count: number
  conflict_projects: string[]
  cost_impact: number
}

export type TaskBoqLinkRow = {
  task_id: string
  boq_item_id: string
  linked_quantity: number | null
  boq_cost: number
}

export type ProjectBoqRow = {
  id: string
  item_code: string
  description: string
  unit: string
  planned_quantity: number
  rate: number
}

type GeneratedWbs = {
  phases: Array<{
    name: string
    workPackages: Array<{
      name: string
      tasks: string[]
    }>
  }>
}

function normalizeIsoDate(value: string | null | undefined): string | null {
  const v = String(value ?? "").trim()
  if (!v) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new Error("פורמט תאריך לא תקין. נדרש YYYY-MM-DD")
  }
  return v
}

function dateToUtcMs(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00.000Z`)
}

function isMissingRelationError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false
  const message = String(error.message ?? "")
  const code = String(error.code ?? "")
  return code === "PGRST205" || /Could not find the table/i.test(message)
}

function shiftIsoDate(isoDate: string, days: number): string {
  const ms = dateToUtcMs(isoDate)
  const shifted = new Date(ms + days * 24 * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 10)
}

function safeParseGeneratedWbs(text: string): GeneratedWbs | null {
  const raw = String(text ?? "").trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as GeneratedWbs
    if (Array.isArray(parsed?.phases)) return parsed
  } catch {
    // try extracting first json object
  }
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as GeneratedWbs
    if (Array.isArray(parsed?.phases)) return parsed
  } catch {
    return null
  }
  return null
}

async function insertGeneratedWbs(
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>,
  projectId: string,
  generated: GeneratedWbs
) {
  const today = format(new Date(), "yyyy-MM-dd")
  let cursor = today
  const clampName = (v: string) => String(v ?? "").trim().slice(0, 180)
  for (const phase of generated.phases.slice(0, 8)) {
    const phaseName = clampName(phase.name)
    if (!phaseName) continue
    const phaseStart = cursor
    let phaseEnd = cursor

    const { data: phaseRow, error: phaseErr } = await supabase
      .schema("public")
      .from("tasks")
      .insert({
        project_id: projectId,
        parent_id: null,
        name: phaseName,
        start_date: phaseStart,
        end_date: phaseEnd,
        progress: 0,
        estimated_cost: 0,
        actual_cost: 0,
      })
      .select("id")
      .single()
    if (phaseErr || !phaseRow?.id) throw new Error(phaseErr?.message ?? "יצירת שלב נכשלה")

    for (const wp of phase.workPackages.slice(0, 12)) {
      const wpName = clampName(wp.name)
      if (!wpName) continue
      const wpStart = cursor
      const taskCount = Math.max(1, wp.tasks.length)
      const wpDuration = Math.max(3, taskCount * 2)
      const wpEnd = await addWorkingDays(wpStart, wpDuration)
      phaseEnd = wpEnd

      const { data: wpRow, error: wpErr } = await supabase
        .schema("public")
        .from("tasks")
        .insert({
          project_id: projectId,
          parent_id: String(phaseRow.id),
          name: wpName,
          start_date: wpStart,
          end_date: wpEnd,
          progress: 0,
          estimated_cost: 0,
          actual_cost: 0,
        })
        .select("id")
        .single()
      if (wpErr || !wpRow?.id) throw new Error(wpErr?.message ?? "יצירת חבילת עבודה נכשלה")

      for (const t of wp.tasks.slice(0, 24)) {
        const taskName = clampName(t)
        if (!taskName) continue
        const tStart = cursor
        const tEnd = await addWorkingDays(tStart, 2)
        await supabase
          .schema("public")
          .from("tasks")
          .insert({
            project_id: projectId,
            parent_id: String(wpRow.id),
            name: taskName,
            start_date: tStart,
            end_date: tEnd,
            progress: 0,
            estimated_cost: 0,
            actual_cost: 0,
          })
        cursor = await addWorkingDays(cursor, 1)
      }
    }
    await supabase
      .schema("public")
      .from("tasks")
      .update({ end_date: phaseEnd })
      .eq("id", String(phaseRow.id))
      .eq("project_id", projectId)
    cursor = format(addDays(new Date(`${cursor}T00:00:00.000Z`), 2), "yyyy-MM-dd")
  }
}

const FS_HOLIDAYS = new Set<string>()

function ganttTasksToScheduleTasks(tasks: GanttTaskRow[]) {
  return tasks.map((t) => ({
    id: t.id,
    parent_id: t.parent_id,
    name: t.name,
    start_date: t.start_date,
    end_date: t.end_date,
    wbs_order: t.wbs_order,
    level: t.level,
    predecessor_index: t.predecessor_index,
    predecessor_task_id: t.predecessor_task_id,
    dependency_ids: t.dependency_ids,
    dependency_lags: t.dependency_lags ?? {},
    is_derivative: Boolean(t.is_derivative),
  }))
}

function collectDescendantTaskIds(rootId: string, tasks: GanttTaskRow[]): string[] {
  const byParent = new Map<string | null, string[]>()
  for (const t of tasks) {
    const k = t.parent_id ?? null
    const list = byParent.get(k) ?? []
    list.push(t.id)
    byParent.set(k, list)
  }
  const out: string[] = []
  const stack = [...(byParent.get(rootId) ?? [])]
  while (stack.length) {
    const id = stack.pop()!
    out.push(id)
    const kids = byParent.get(id) ?? []
    for (const c of kids) stack.push(c)
  }
  return out
}

/** When a master task's planned dates move, shift derivative subcontractor rows and clamp to master end. */
async function cascadeDerivativesForMaster(
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>,
  projectId: string,
  masterId: string,
  prevStart: string | null,
  prevEnd: string | null,
  nextStart: string | null,
  nextEnd: string | null,
  allTasks: GanttTaskRow[]
) {
  const derivatives = allTasks.filter(
    (t) => t.is_derivative && t.parent_task_id === masterId
  )
  if (derivatives.length === 0) return

  const delta =
    prevStart && nextStart
      ? Math.round((dateToUtcMs(nextStart) - dateToUtcMs(prevStart)) / (24 * 60 * 60 * 1000))
      : 0

  for (const d of derivatives) {
    const ds = normalizeIsoDate(d.start_date)
    const de = normalizeIsoDate(d.end_date)
    if (!ds || !de) continue
    let ns = delta !== 0 ? shiftIsoDate(ds, delta) : ds
    let ne = delta !== 0 ? shiftIsoDate(de, delta) : de

    if (nextEnd && dateToUtcMs(ne) > dateToUtcMs(nextEnd)) {
      ne = nextEnd
    }
    if (nextStart && dateToUtcMs(ns) < dateToUtcMs(nextStart)) {
      ns = nextStart
    }
    if (dateToUtcMs(ns) > dateToUtcMs(ne)) {
      ns = ne
    }

    const { error } = await supabase
      .schema("public")
      .from("tasks")
      .update({ start_date: ns, end_date: ne })
      .eq("id", d.id)
      .eq("project_id", projectId)
    if (error) throw new Error(error.message)
  }
}

async function rollupSummaryTaskProgress(
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>,
  projectId: string,
  tasks: GanttTaskRow[]
) {
  const hasChildren = new Set<string>()
  for (const t of tasks) {
    if (t.parent_id) hasChildren.add(t.parent_id)
  }
  for (const parent of tasks) {
    if (!hasChildren.has(parent.id)) continue
    const kids = tasks.filter((c) => c.parent_id === parent.id)
    let wsum = 0
    let psum = 0
    for (const k of kids) {
      const s = normalizeIsoDate(k.start_date)
      const e = normalizeIsoDate(k.end_date)
      const w =
        s && e
          ? Math.max(1, diffWorkingDaysWithHolidaySet(s, e, FS_HOLIDAYS))
          : 1
      wsum += w
      psum += w * (Number(k.progress) || 0)
    }
    const prog = wsum > 0 ? Math.max(0, Math.min(100, Math.round(psum / wsum))) : 0
    if (Math.round(Number(parent.progress) || 0) === prog) continue
    const { error } = await supabase
      .schema("public")
      .from("tasks")
      .update({ progress: prog })
      .eq("id", parent.id)
      .eq("project_id", projectId)
    if (error) throw new Error(error.message)
  }
}

/**
 * FS scheduling for leaf tasks + summary roll-up + weighted summary progress, persisted to Supabase.
 * Alias: `recalculateProjectSchedule`.
 */
export async function recalculateWbsSchedule(
  projectId: string,
  options?: { projectMinStartDate?: string | null }
) {
  const pid = String(projectId ?? "").trim()
  if (!pid) return { updated: 0 }

  const supabase = await createSupabaseServerAuthClient()
  const tasks = await fetchProjectTasks(pid)
  const minStart = normalizeIsoDate(options?.projectMinStartDate ?? null)
  const nextDates = calculateTaskDates(ganttTasksToScheduleTasks(tasks), FS_HOLIDAYS, {
    projectMinStartDate: minStart,
  })
  let updated = 0
  for (const t of tasks) {
    if (t.is_derivative) continue
    const n = nextDates.get(t.id)
    if (!n) continue
    const ns = normalizeIsoDate(n.start_date)
    const ne = normalizeIsoDate(n.end_date)
    const os = normalizeIsoDate(t.start_date)
    const oe = normalizeIsoDate(t.end_date)
    if (ns === os && ne === oe) continue
    const { error } = await supabase
      .schema("public")
      .from("tasks")
      .update({ start_date: ns, end_date: ne })
      .eq("id", t.id)
      .eq("project_id", pid)
    if (error) throw new Error(error.message)
    updated += 1
  }

  const merged = await fetchProjectTasks(pid)
  await rollupSummaryTaskProgress(supabase, pid, merged)
  return { updated }
}

/** ISO 25010: centralized project schedule recompute (FS + lag, roll-up, summary %). */
export async function recalculateProjectSchedule(
  projectId: string,
  options?: { projectMinStartDate?: string | null }
) {
  return recalculateWbsSchedule(projectId, options)
}

export async function syncWbsLevelsFromTree(projectId: string) {
  const supabase = await createSupabaseServerAuthClient()
  const tasks = await fetchProjectTasks(projectId)
  const byId = new Map(tasks.map((t) => [t.id, t]))
  function depthOf(id: string): number {
    let d = 0
    let cur: string | undefined = id
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      const row = byId.get(cur)
      const p = row?.parent_id ? String(row.parent_id) : ""
      if (!p) break
      d += 1
      cur = p
    }
    return d
  }
  for (const t of tasks) {
    const d = depthOf(t.id)
    if (d === t.level) continue
    const { error } = await supabase
      .schema("public")
      .from("tasks")
      .update({ level: d })
      .eq("id", t.id)
      .eq("project_id", projectId)
    if (error) throw new Error(error.message)
  }
}

function toTaskRow(row: Record<string, unknown>): GanttTaskRow {
  const dependenciesRaw = row.dependency_ids
  const dependency_ids = Array.isArray(dependenciesRaw)
    ? dependenciesRaw.map((x) => String(x))
    : []

  const dependency_lags: Record<string, number> = {}
  const lagsRaw = row.dependency_lags
  if (lagsRaw && typeof lagsRaw === "object" && !Array.isArray(lagsRaw)) {
    for (const [k, v] of Object.entries(lagsRaw as Record<string, unknown>)) {
      const n = Number(v)
      if (!Number.isNaN(n)) dependency_lags[String(k)] = n
    }
  }

  const predIdxRaw = row.predecessor_index
  const predecessor_index =
    predIdxRaw == null || predIdxRaw === ""
      ? null
      : Math.max(1, Math.floor(Number(predIdxRaw)))

  const parentTaskRaw = row.parent_task_id
  const subRaw = row.subcontractor_id
  const contractRaw = row.contract_id
  const derivRaw = row.is_derivative

  return {
    id: String(row.id ?? ""),
    project_id: String(row.project_id ?? ""),
    parent_id:
      row.parent_id == null ? null : String(row.parent_id).trim() || null,
    parent_task_id:
      parentTaskRaw == null ? null : String(parentTaskRaw).trim() || null,
    subcontractor_id:
      subRaw == null ? null : String(subRaw).trim() || null,
    contract_id: contractRaw == null ? null : String(contractRaw).trim() || null,
    is_derivative: Boolean(derivRaw),
    name: String(row.name ?? "").trim(),
    description:
      row.description == null ? null : String(row.description).trim() || null,
    start_date:
      row.start_date == null ? null : String(row.start_date).trim() || null,
    end_date: row.end_date == null ? null : String(row.end_date).trim() || null,
    actual_start_date:
      row.actual_start_date == null
        ? null
        : String(row.actual_start_date).trim() || null,
    actual_end_date:
      row.actual_end_date == null
        ? null
        : String(row.actual_end_date).trim() || null,
    progress: Number(row.progress ?? 0) || 0,
    dependency_ids,
    level: Math.max(0, Math.floor(Number(row.level ?? 0) || 0)),
    predecessor_index,
    predecessor_task_id:
      row.predecessor_task_id == null
        ? null
        : String(row.predecessor_task_id).trim() || null,
    wbs_order: Math.floor(Number(row.wbs_order ?? 0) || 0),
    wbs_code:
      row.wbs_code == null || String(row.wbs_code).trim() === ""
        ? null
        : String(row.wbs_code).trim(),
    source_wbs_node_id:
      row.source_wbs_node_id == null || String(row.source_wbs_node_id).trim() === ""
        ? null
        : String(row.source_wbs_node_id).trim(),
    dependency_lags,
    estimated_cost: Number(row.estimated_cost ?? 0) || 0,
    actual_cost: Number(row.actual_cost ?? 0) || 0,
    building_label:
      row.building_label == null || String(row.building_label).trim() === ""
        ? null
        : String(row.building_label).trim(),
    floor_label:
      row.floor_label == null || String(row.floor_label).trim() === ""
        ? null
        : String(row.floor_label).trim(),
  }
}

/** Columns after migration `tasks_derivative_gantt` (master ↔ subcontractor rows). */
const TASKS_SELECT_WITH_DERIVATIVE_BASE =
  "id, project_id, parent_id, parent_task_id, subcontractor_id, contract_id, is_derivative, name, description, start_date, end_date, actual_start_date, actual_end_date, progress, dependency_ids, dependency_lags, level, predecessor_index, predecessor_task_id, wbs_order, wbs_code, source_wbs_node_id, estimated_cost, actual_cost"

const TASKS_SELECT_WITH_DERIVATIVE =
  `${TASKS_SELECT_WITH_DERIVATIVE_BASE}, building_label, floor_label`

/** Legacy select when derivative columns are not yet applied to the DB. */
const TASKS_SELECT_WITHOUT_DERIVATIVE =
  "id, project_id, parent_id, name, description, start_date, end_date, actual_start_date, actual_end_date, progress, dependency_ids, dependency_lags, level, predecessor_index, predecessor_task_id, wbs_order, wbs_code, estimated_cost, actual_cost"

/** When `tasks.source_wbs_node_id` migration not applied yet. */
const TASKS_SELECT_DERIVATIVE_NO_SOURCE_WBS =
  "id, project_id, parent_id, parent_task_id, subcontractor_id, contract_id, is_derivative, name, description, start_date, end_date, actual_start_date, actual_end_date, progress, dependency_ids, dependency_lags, level, predecessor_index, predecessor_task_id, wbs_order, wbs_code, estimated_cost, actual_cost"

function tasksQueryMissingDerivativeColumns(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false
  const code = String(err.code ?? "")
  const msg = String(err.message ?? "").toLowerCase()
  if (code === "42703") return true
  return (
    msg.includes("parent_task_id") ||
    msg.includes("subcontractor_id") ||
    msg.includes("is_derivative") ||
    (msg.includes("column") && msg.includes("tasks") && msg.includes("does not exist"))
  )
}

function tasksQueryMissingSourceWbsNodeColumn(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false
  const msg = String(err.message ?? "").toLowerCase()
  return msg.includes("source_wbs_node_id")
}

function tasksQueryMissingSiteLabelsColumn(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false
  const msg = String(err.message ?? "").toLowerCase()
  return msg.includes("building_label") || msg.includes("floor_label")
}

export async function fetchProjectTasks(projectId: string): Promise<GanttTaskRow[]> {
  const pid = String(projectId ?? "").trim()
  if (!pid) return []

  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user?.email) {
    const allowed = await isProjectInManagingPartnerScope(pid, user.email, user.id)
    if (!allowed) return []
  }

  const first = await supabase
    .schema("public")
    .from("tasks")
    .select(TASKS_SELECT_WITH_DERIVATIVE)
    .eq("project_id", pid)
    .order("parent_id", { ascending: true, nullsFirst: true })
    .order("wbs_order", { ascending: true })
    .order("created_at", { ascending: true })

  let rows: Array<Record<string, unknown>> = ((first.data ?? []) as Array<Record<string, unknown>>) ?? []
  let err = first.error

  if (err && tasksQueryMissingSiteLabelsColumn(err)) {
    const retrySite = await supabase
      .schema("public")
      .from("tasks")
      .select(TASKS_SELECT_WITH_DERIVATIVE_BASE)
      .eq("project_id", pid)
      .order("parent_id", { ascending: true, nullsFirst: true })
      .order("wbs_order", { ascending: true })
      .order("created_at", { ascending: true })
    rows = ((retrySite.data ?? []) as Array<Record<string, unknown>>) ?? []
    err = retrySite.error
  }

  if (err && tasksQueryMissingDerivativeColumns(err)) {
    const retry = await supabase
      .schema("public")
      .from("tasks")
      .select(TASKS_SELECT_WITHOUT_DERIVATIVE)
      .eq("project_id", pid)
      .order("parent_id", { ascending: true, nullsFirst: true })
      .order("wbs_order", { ascending: true })
      .order("created_at", { ascending: true })
    rows = ((retry.data ?? []) as Array<Record<string, unknown>>) ?? []
    err = retry.error
  } else if (err && tasksQueryMissingSourceWbsNodeColumn(err)) {
    const retry = await supabase
      .schema("public")
      .from("tasks")
      .select(TASKS_SELECT_DERIVATIVE_NO_SOURCE_WBS)
      .eq("project_id", pid)
      .order("parent_id", { ascending: true, nullsFirst: true })
      .order("wbs_order", { ascending: true })
      .order("created_at", { ascending: true })
    rows = ((retry.data ?? []) as Array<Record<string, unknown>>) ?? []
    err = retry.error
  }

  if (err) throw new Error(err.message)
  return rows.map(toTaskRow)
}

export async function fetchTaskBoqLinks(projectId: string): Promise<TaskBoqLinkRow[]> {
  const pid = String(projectId ?? "").trim()
  if (!pid) return []
  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("task_boq_links")
    .select("task_id, boq_item_id, linked_quantity, project_boq!inner(project_id, planned_quantity, rate)")

  if (error) {
    if (isMissingRelationError(error)) return []
    throw new Error(error.message)
  }

  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => {
      const boq = Array.isArray((row as { project_boq?: unknown }).project_boq)
        ? ((row as { project_boq: Array<{ project_id?: string; planned_quantity?: number; rate?: number }> }).project_boq[0] ?? {})
        : ((row as { project_boq?: { project_id?: string; planned_quantity?: number; rate?: number } }).project_boq ?? {})
      const boqProjectId = String(boq.project_id ?? "").trim()
      if (boqProjectId !== pid) return null
      const rate = Number(boq.rate ?? 0) || 0
      const plannedQuantity = Number(boq.planned_quantity ?? 0) || 0
      const linkedQuantityRaw = row.linked_quantity == null ? null : Number(row.linked_quantity)
      const linkedQuantity = linkedQuantityRaw == null || Number.isNaN(linkedQuantityRaw) ? null : linkedQuantityRaw
      const baseQty = linkedQuantity == null ? plannedQuantity : linkedQuantity
      return {
        task_id: String(row.task_id ?? ""),
        boq_item_id: String(row.boq_item_id ?? ""),
        linked_quantity: linkedQuantity,
        boq_cost: Math.max(0, baseQty) * Math.max(0, rate),
      } satisfies TaskBoqLinkRow
    })
    .filter((row): row is TaskBoqLinkRow => Boolean(row))
}

export async function fetchProjectBoq(projectId: string): Promise<ProjectBoqRow[]> {
  const pid = String(projectId ?? "").trim()
  if (!pid) return []
  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("project_boq")
    .select("id, item_code, description, unit, planned_quantity, rate")
    .eq("project_id", pid)
    .order("item_code", { ascending: true })

  if (error) {
    if (isMissingRelationError(error)) return []
    throw new Error(error.message)
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id ?? ""),
    item_code: String(row.item_code ?? "").trim(),
    description: String(row.description ?? "").trim(),
    unit: String(row.unit ?? "").trim(),
    planned_quantity: Number(row.planned_quantity ?? 0) || 0,
    rate: Number(row.rate ?? 0) || 0,
  }))
}

/**
 * Replaces all BOQ links for a task with at most one link. When linked, cost uses BOQ rate × quantity
 * (linked_quantity null → planned_quantity from project_boq).
 */
export async function setTaskPrimaryBoqLink(input: {
  projectId: string
  taskId: string
  boqItemId: string | null
}) {
  const projectId = String(input.projectId ?? "").trim()
  const taskId = String(input.taskId ?? "").trim()
  const boqItemId = String(input.boqItemId ?? "").trim() || null
  if (!projectId) throw new Error("projectId חסר")
  if (!taskId) throw new Error("taskId חסר")

  const supabase = await createSupabaseServerAuthClient()

  const { error: delErr } = await supabase
    .schema("public")
    .from("task_boq_links")
    .delete()
    .eq("task_id", taskId)
  if (delErr && !isMissingRelationError(delErr)) throw new Error(delErr.message)

  if (boqItemId) {
    const { data: boqRow, error: boqErr } = await supabase
      .schema("public")
      .from("project_boq")
      .select("id, project_id")
      .eq("id", boqItemId)
      .maybeSingle()
    if (boqErr) throw new Error(boqErr.message)
    if (!boqRow || String((boqRow as { project_id?: string }).project_id ?? "") !== projectId) {
      throw new Error("פריט כתב כמויות לא שייך לפרויקט")
    }
    const { error: insErr } = await supabase.schema("public").from("task_boq_links").insert({
      task_id: taskId,
      boq_item_id: boqItemId,
      linked_quantity: null,
    })
    if (insErr) throw new Error(insErr.message)
  }

  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath(`/marker-ofek/projects/${projectId}/gantt-editor`)
  revalidatePath("/marker-ofek/execution")
  return { ok: true }
}

export async function updateTaskDatesWithDependencies(input: UpdateTaskDatesInput) {
  const taskId = String(input.taskId ?? "").trim()
  const projectId = String(input.projectId ?? "").trim()
  const nextStart = normalizeIsoDate(input.startDate)
  const nextEnd = normalizeIsoDate(input.endDate)

  if (!taskId) throw new Error("taskId חסר")
  if (!projectId) throw new Error("projectId חסר")
  if (nextStart && nextEnd && dateToUtcMs(nextStart) > dateToUtcMs(nextEnd)) {
    throw new Error("טווח תאריכים מתוכנן אינו תקין")
  }

  const supabase = await createSupabaseServerAuthClient()
  const tasks = await fetchProjectTasks(projectId)
  const target = tasks.find((t) => t.id === taskId)
  if (!target) throw new Error("המשימה לא נמצאה בפרויקט")

  const hasChildren = new Set<string>()
  for (const t of tasks) {
    if (t.parent_id) hasChildren.add(t.parent_id)
  }

  const currentStart = normalizeIsoDate(target.start_date)
  const currentEnd = normalizeIsoDate(target.end_date)
  const deltaDays =
    currentStart && nextStart
      ? Math.round((dateToUtcMs(nextStart) - dateToUtcMs(currentStart)) / (24 * 60 * 60 * 1000))
      : 0

  if (
    target.is_derivative &&
    target.parent_task_id &&
    nextEnd &&
    !hasChildren.has(taskId)
  ) {
    const master = tasks.find((t) => t.id === target.parent_task_id)
    const mEnd = normalizeIsoDate(master?.end_date ?? null)
    if (mEnd && dateToUtcMs(nextEnd) > dateToUtcMs(mEnd)) {
      throw new Error("תאריך סיום נגזרת לא יכול להיות אחרי סיום משימת המאסטר")
    }
  }

  /** Summary task: shift parent + all descendants by the same calendar delta (atomic hierarchy). */
  if (hasChildren.has(taskId)) {
    if (!nextStart || !nextEnd || !currentStart || !currentEnd) {
      throw new Error("תאריכי משימת סיכום חסרים — לא ניתן להזיז")
    }
    const delta = Math.round(
      (dateToUtcMs(nextStart) - dateToUtcMs(currentStart)) / (24 * 60 * 60 * 1000)
    )
    const idsToShift = [taskId, ...collectDescendantTaskIds(taskId, tasks)]
    const byIdBefore = new Map(tasks.map((t) => [t.id, t]))
    const byId = byIdBefore
    for (const id of idsToShift) {
      const row = byId.get(id)
      if (!row) continue
      const s = normalizeIsoDate(row.start_date)
      const e = normalizeIsoDate(row.end_date)
      if (!s || !e) continue
      const ns = shiftIsoDate(s, delta)
      const ne = shiftIsoDate(e, delta)
      const { error } = await supabase
        .schema("public")
        .from("tasks")
        .update({ start_date: ns, end_date: ne })
        .eq("id", id)
        .eq("project_id", projectId)
      if (error) throw new Error(error.message)
    }
    const freshAfterShift = await fetchProjectTasks(projectId)
    for (const id of idsToShift) {
      const b = byIdBefore.get(id)
      const a = freshAfterShift.find((t) => t.id === id)
      if (!b || !a) continue
      const bs = normalizeIsoDate(b.start_date)
      const be = normalizeIsoDate(b.end_date)
      const as = normalizeIsoDate(a.start_date)
      const ae = normalizeIsoDate(a.end_date)
      if (bs !== as || be !== ae) {
        await cascadeDerivativesForMaster(supabase, projectId, id, bs, be, as, ae, freshAfterShift)
      }
    }
    await recalculateWbsSchedule(projectId)
    revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
    revalidatePath("/marker-ofek/execution")
    revalidatePath(`/marker-ofek/projects/${projectId}`)
    revalidatePath(`/marker-ofek/execution/gantt/${projectId}/subcontractor`)
    return { updatedTaskIds: idsToShift, deltaDays }
  }

  const { error } = await supabase
    .schema("public")
    .from("tasks")
    .update({
      start_date: nextStart,
      end_date: nextEnd,
    })
    .eq("id", taskId)
    .eq("project_id", projectId)
  if (error) throw new Error(error.message)

  await cascadeDerivativesForMaster(
    supabase,
    projectId,
    taskId,
    currentStart,
    currentEnd,
    nextStart,
    nextEnd,
    tasks
  )

  await recalculateWbsSchedule(projectId)

  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath("/marker-ofek/execution")
  revalidatePath(`/marker-ofek/projects/${projectId}`)
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}/subcontractor`)

  return {
    updatedTaskIds: [taskId],
    deltaDays,
  }
}

export async function updateTaskGridRow(input: {
  taskId: string
  projectId: string
  name: string
  startDate: string | null
  endDate: string | null
  progress?: number
}) {
  const taskId = String(input.taskId ?? "").trim()
  const projectId = String(input.projectId ?? "").trim()
  const name = String(input.name ?? "").trim()
  const startDate = normalizeIsoDate(input.startDate)
  const endDate = normalizeIsoDate(input.endDate)
  const progress = Math.max(0, Math.min(100, Number(input.progress ?? 0) || 0))
  if (!taskId) throw new Error("taskId חסר")
  if (!projectId) throw new Error("projectId חסר")
  if (!name) throw new Error("שם משימה חובה")
  if (startDate && endDate && dateToUtcMs(startDate) > dateToUtcMs(endDate)) {
    throw new Error("טווח תאריכים מתוכנן אינו תקין")
  }
  const supabase = await createSupabaseServerAuthClient()
  const projectTasks = await fetchProjectTasks(projectId)
  const row = projectTasks.find((t) => t.id === taskId)
  if (!row) throw new Error("המשימה לא נמצאה בפרויקט")

  const hasChildren = new Set<string>()
  for (const t of projectTasks) {
    if (t.parent_id) hasChildren.add(t.parent_id)
  }
  const isSummary = hasChildren.has(taskId)

  if (!isSummary && row.is_derivative && row.parent_task_id) {
    const master = projectTasks.find((t) => t.id === row.parent_task_id)
    const mEnd = normalizeIsoDate(master?.end_date ?? null)
    if (endDate && mEnd && dateToUtcMs(endDate) > dateToUtcMs(mEnd)) {
      throw new Error("תאריך סיום נגזרת לא יכול להיות אחרי סיום משימת המאסטר")
    }
  }

  const prevStart = normalizeIsoDate(row.start_date)
  const prevEnd = normalizeIsoDate(row.end_date)
  const hasDerivatives = projectTasks.some(
    (t) => t.is_derivative && t.parent_task_id === taskId
  )

  const payload: Record<string, unknown> = { name, progress }
  if (!isSummary) {
    payload.start_date = startDate
    payload.end_date = endDate
  }

  const { error } = await supabase
    .schema("public")
    .from("tasks")
    .update(payload)
    .eq("id", taskId)
    .eq("project_id", projectId)
  if (error) throw new Error(error.message)

  if (hasDerivatives && !isSummary) {
    await cascadeDerivativesForMaster(
      supabase,
      projectId,
      taskId,
      prevStart,
      prevEnd,
      startDate,
      endDate,
      projectTasks
    )
  }

  await recalculateWbsSchedule(projectId)
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath(`/marker-ofek/projects/${projectId}/gantt-editor`)
  revalidatePath("/marker-ofek/execution")
  revalidatePath(`/marker-ofek/projects/${projectId}`)
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}/subcontractor`)
  return { ok: true }
}

export async function setTaskDependencyIds(input: {
  projectId: string
  taskId: string
  dependencyIds: string[]
  dependencyLags?: Record<string, number>
}) {
  const projectId = String(input.projectId ?? "").trim()
  const taskId = String(input.taskId ?? "").trim()
  const dependencyIds = [...new Set((input.dependencyIds ?? []).map((id) => String(id).trim()).filter(Boolean))]
  if (!projectId) throw new Error("projectId חסר")
  if (!taskId) throw new Error("taskId חסר")
  if (dependencyIds.includes(taskId)) throw new Error("משימה לא יכולה להיות תלויה בעצמה")

  const supabase = await createSupabaseServerAuthClient()
  const projectTasks = await fetchProjectTasks(projectId)
  const validIds = new Set(projectTasks.map((t) => t.id))
  if (!validIds.has(taskId)) throw new Error("המשימה לא נמצאה בפרויקט")
  for (const id of dependencyIds) {
    if (!validIds.has(id)) throw new Error("משימת קדם לא נמצאה בפרויקט")
  }

  if (wouldCreateDependencyCycle(taskId, dependencyIds, projectTasks)) {
    throw new Error("CONFLICT_CIRCULAR_DEPENDENCY")
  }

  const flatIds = canonicalWbsFlatIds(ganttTasksToScheduleTasks(projectTasks))
  const rows = dependencyIds
    .map((id) => flatIds.indexOf(id) + 1)
    .filter((n) => n > 0)
    .sort((a, b) => a - b)
  const predecessor_index =
    rows.length === 1 ? rows[0]! : rows.length > 0 ? Math.min(...rows) : null
  const predecessor_task_id = dependencyIds[0] ?? null

  const dependency_lags: Record<string, number> = {}
  const lagIn = input.dependencyLags ?? {}
  for (const id of dependencyIds) {
    dependency_lags[id] = Number(lagIn[id] ?? 0) || 0
  }

  const { error } = await supabase
    .schema("public")
    .from("tasks")
    .update({
      dependency_ids: dependencyIds,
      predecessor_index,
      predecessor_task_id,
      dependency_lags,
    })
    .eq("id", taskId)
    .eq("project_id", projectId)
  if (error) throw new Error(error.message)

  await recalculateWbsSchedule(projectId)

  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath(`/marker-ofek/projects/${projectId}/gantt-editor`)
  revalidatePath("/marker-ofek/execution")
  revalidatePath(`/marker-ofek/projects/${projectId}`)
  return { ok: true }
}

/** הוספת קדם FS יחיד למשימה (מממשכת dependency_ids קיימים). */
export async function addFinishToStartPredecessor(input: {
  projectId: string
  successorTaskId: string
  predecessorTaskId: string
}) {
  const projectId = String(input.projectId ?? "").trim()
  const successorTaskId = String(input.successorTaskId ?? "").trim()
  const predecessorTaskId = String(input.predecessorTaskId ?? "").trim()
  if (!projectId || !successorTaskId || !predecessorTaskId) throw new Error("נתונים חסרים")
  if (successorTaskId === predecessorTaskId) throw new Error("לא ניתן לקשר משימה לעצמה")

  const projectTasks = await fetchProjectTasks(projectId)
  const succ = projectTasks.find((t) => t.id === successorTaskId)
  if (!succ) throw new Error("המשימה לא נמצאה בפרויקט")
  if (!projectTasks.some((t) => t.id === predecessorTaskId)) {
    throw new Error("משימת קדם לא נמצאה בפרויקט")
  }

  const existing = [...(succ.dependency_ids ?? [])]
  if (existing.includes(predecessorTaskId)) return { ok: true }

  const next = [...existing, predecessorTaskId]
  if (wouldCreateDependencyCycle(successorTaskId, next, projectTasks)) {
    throw new Error("CONFLICT_CIRCULAR_DEPENDENCY")
  }

  const dependency_lags: Record<string, number> = {}
  for (const id of next) {
    dependency_lags[id] = Math.trunc(Number(succ.dependency_lags?.[id] ?? 0) || 0)
  }
  dependency_lags[predecessorTaskId] = dependency_lags[predecessorTaskId] ?? 0

  const flatIds = canonicalWbsFlatIds(ganttTasksToScheduleTasks(projectTasks))
  const rows = next
    .map((id) => flatIds.indexOf(id) + 1)
    .filter((n) => n > 0)
    .sort((a, b) => a - b)
  const predecessor_index = rows.length === 1 ? rows[0]! : rows.length > 0 ? Math.min(...rows) : null
  const predecessor_task_id = next[0] ?? null

  const supabase = await createSupabaseServerAuthClient()
  const { error } = await supabase
    .schema("public")
    .from("tasks")
    .update({
      dependency_ids: next,
      predecessor_index,
      predecessor_task_id,
      dependency_lags,
    })
    .eq("id", successorTaskId)
    .eq("project_id", projectId)
  if (error) throw new Error(error.message)

  await recalculateWbsSchedule(projectId)
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath(`/marker-ofek/projects/${projectId}/gantt-editor`)
  revalidatePath("/marker-ofek/execution")
  revalidatePath(`/marker-ofek/projects/${projectId}`)
  return { ok: true }
}

/**
 * FS predecessors with per-link working-day lag (e.g. from "5FS+2"). DAG-validated.
 */
export async function saveWbsPredecessorLinks(input: {
  projectId: string
  taskId: string
  links: Array<{ predecessorTaskId: string; lagWorkingDays: number }>
}) {
  const projectId = String(input.projectId ?? "").trim()
  const taskId = String(input.taskId ?? "").trim()
  const links = (input.links ?? []).filter((l) => String(l.predecessorTaskId ?? "").trim())
  if (!projectId) throw new Error("projectId חסר")
  if (!taskId) throw new Error("taskId חסר")

  const supabase = await createSupabaseServerAuthClient()
  const projectTasks = await fetchProjectTasks(projectId)
  const validIds = new Set(projectTasks.map((t) => t.id))
  if (!validIds.has(taskId)) throw new Error("המשימה לא נמצאה בפרויקט")

  const dependencyIds = [...new Set(links.map((l) => String(l.predecessorTaskId).trim()))]
  if (dependencyIds.includes(taskId)) throw new Error("משימה לא יכולה להיות תלויה בעצמה")
  for (const id of dependencyIds) {
    if (!validIds.has(id)) throw new Error("משימת קדם לא נמצאה בפרויקט")
  }

  if (wouldCreateDependencyCycle(taskId, dependencyIds, projectTasks)) {
    throw new Error("CONFLICT_CIRCULAR_DEPENDENCY")
  }

  const flatIds = canonicalWbsFlatIds(ganttTasksToScheduleTasks(projectTasks))
  const rows = dependencyIds
    .map((id) => flatIds.indexOf(id) + 1)
    .filter((n) => n > 0)
    .sort((a, b) => a - b)
  const predecessor_index =
    rows.length === 1 ? rows[0]! : rows.length > 0 ? Math.min(...rows) : null
  const predecessor_task_id = dependencyIds[0] ?? null

  const dependency_lags: Record<string, number> = {}
  for (const l of links) {
    dependency_lags[String(l.predecessorTaskId).trim()] = Math.trunc(Number(l.lagWorkingDays) || 0)
  }

  const { error } = await supabase
    .schema("public")
    .from("tasks")
    .update({
      dependency_ids: dependencyIds,
      predecessor_index,
      predecessor_task_id: dependencyIds.length > 0 ? predecessor_task_id : null,
      dependency_lags,
    })
    .eq("id", taskId)
    .eq("project_id", projectId)
  if (error) throw new Error(error.message)

  await recalculateWbsSchedule(projectId)
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath("/marker-ofek/execution")
  return { ok: true }
}

/**
 * Persists FS predecessors from 1-based '#' row numbers and syncs `predecessor_index` / `predecessor_task_id`.
 */
export async function saveWbsPredecessorRows(input: {
  projectId: string
  taskId: string
  /** 1-based row indices; empty = clear predecessors */
  predecessorRows: number[]
}) {
  const projectId = String(input.projectId ?? "").trim()
  const taskId = String(input.taskId ?? "").trim()
  const rows = [...new Set((input.predecessorRows ?? []).map((n) => Math.floor(Number(n))).filter((n) => n >= 1))].sort(
    (a, b) => a - b
  )
  if (!projectId) throw new Error("projectId חסר")
  if (!taskId) throw new Error("taskId חסר")

  const projectTasks = await fetchProjectTasks(projectId)
  const flatIds = canonicalWbsFlatIds(ganttTasksToScheduleTasks(projectTasks))
  const links: Array<{ predecessorTaskId: string; lagWorkingDays: number }> = []
  for (const r of rows) {
    if (r > flatIds.length) continue
    const tid = flatIds[r - 1]
    if (tid && tid !== taskId) links.push({ predecessorTaskId: tid, lagWorkingDays: 0 })
  }
  return saveWbsPredecessorLinks({ projectId, taskId, links })
}

export async function wbsIndentTask(input: { projectId: string; taskId: string }) {
  const projectId = String(input.projectId ?? "").trim()
  const taskId = String(input.taskId ?? "").trim()
  if (!projectId) throw new Error("projectId חסר")
  if (!taskId) throw new Error("taskId חסר")

  const supabase = await createSupabaseServerAuthClient()
  const tasks = await fetchProjectTasks(projectId)
  const flatIds = canonicalWbsFlatIds(ganttTasksToScheduleTasks(tasks))
  const idx = flatIds.indexOf(taskId)
  if (idx <= 0) throw new Error("לא ניתן להזיח פנימה")

  const newParentId = flatIds[idx - 1]!
  const parent = tasks.find((t) => t.id === newParentId)
  if (!parent) throw new Error("הורה לא נמצא")

  const siblings = tasks.filter((t) => t.parent_id === newParentId && t.id !== taskId)
  const maxOrder = siblings.reduce((m, s) => Math.max(m, s.wbs_order), -1)

  const { error } = await supabase
    .schema("public")
    .from("tasks")
    .update({
      parent_id: newParentId,
      level: parent.level + 1,
      wbs_order: maxOrder + 1,
    })
    .eq("id", taskId)
    .eq("project_id", projectId)
  if (error) throw new Error(error.message)

  await syncWbsLevelsFromTree(projectId)
  await recalculateWbsSchedule(projectId)
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath("/marker-ofek/execution")
  return { ok: true }
}

export async function wbsOutdentTask(input: { projectId: string; taskId: string }) {
  const projectId = String(input.projectId ?? "").trim()
  const taskId = String(input.taskId ?? "").trim()
  if (!projectId) throw new Error("projectId חסר")
  if (!taskId) throw new Error("taskId חסר")

  const supabase = await createSupabaseServerAuthClient()
  const tasks = await fetchProjectTasks(projectId)
  const task = tasks.find((t) => t.id === taskId)
  if (!task?.parent_id) throw new Error("לא ניתן להזיח החוצה")

  const parent = tasks.find((t) => t.id === task.parent_id)
  if (!parent) throw new Error("הורה לא נמצא")

  const newParentId = parent.parent_id
  const grandparent = newParentId ? tasks.find((t) => t.id === newParentId) : null
  const newLevel = grandparent ? grandparent.level + 1 : 0

  const siblings = tasks.filter(
    (t) =>
      (t.parent_id ?? null) === (newParentId ?? null) && t.id !== taskId
  )
  const maxOrder = siblings.reduce((m, s) => Math.max(m, s.wbs_order), -1)

  const { error } = await supabase
    .schema("public")
    .from("tasks")
    .update({
      parent_id: newParentId,
      level: newLevel,
      wbs_order: maxOrder + 1,
    })
    .eq("id", taskId)
    .eq("project_id", projectId)
  if (error) throw new Error(error.message)

  await syncWbsLevelsFromTree(projectId)
  await recalculateWbsSchedule(projectId)
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath("/marker-ofek/execution")
  return { ok: true }
}

export async function updateTaskProgress(input: {
  taskId: string
  projectId: string
  progress: number
}) {
  const taskId = String(input.taskId ?? "").trim()
  const projectId = String(input.projectId ?? "").trim()
  const progress = Math.max(0, Math.min(100, Number(input.progress) || 0))
  if (!taskId) throw new Error("taskId חסר")
  if (!projectId) throw new Error("projectId חסר")

  const supabase = await createSupabaseServerAuthClient()
  const { error } = await supabase
    .schema("public")
    .from("tasks")
    .update({ progress })
    .eq("id", taskId)
    .eq("project_id", projectId)
  if (error) throw new Error(error.message)

  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath("/marker-ofek/execution")
  return { ok: true }
}

/** Same `parent_id` (null = root). `orderedIds` must be a permutation of DB siblings. */
export async function reorderSiblingTasksByOrderedIds(input: {
  projectId: string
  parentId: string | null
  orderedIds: string[]
}) {
  const projectId = String(input.projectId ?? "").trim()
  const parentKey =
    input.parentId == null || String(input.parentId).trim() === ""
      ? null
      : String(input.parentId).trim()
  const orderedIds = input.orderedIds.map((x) => String(x).trim()).filter(Boolean)
  if (!projectId) throw new Error("projectId חסר")
  if (orderedIds.length === 0) throw new Error("רשימה ריקה")

  const supabase = await createSupabaseServerAuthClient()
  const tasks = await fetchProjectTasks(projectId)
  const norm = (p: string | null | undefined) =>
    p == null || String(p).trim() === "" ? null : String(p).trim()
  const siblings = tasks.filter((t) => norm(t.parent_id) === parentKey)
  if (siblings.length !== orderedIds.length) {
    throw new Error("מספר המשימות באותה רמה אינו תואם")
  }
  const dbSet = new Set(siblings.map((s) => s.id))
  for (const id of orderedIds) {
    if (!dbSet.has(id)) throw new Error("משימה שייכת להורה אחר או לא נמצאה")
  }

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .schema("public")
      .from("tasks")
      .update({ wbs_order: i })
      .eq("id", orderedIds[i]!)
      .eq("project_id", projectId)
    if (error) throw new Error(error.message)
  }

  await recalculateWbsSchedule(projectId)
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath("/marker-ofek/execution")
  return { ok: true as const }
}

export type WonLinkedProjectOption = {
  id: string
  name: string
  internal_project_code: string
}

/** פרויקטים שמקושרים למכרז במצב `won` — לקישור לו״ז. */
export async function listWonLinkedProjectsForGantt(): Promise<WonLinkedProjectOption[]> {
  const supabase = await createSupabaseServerAuthClient()
  const { data: tp, error: e1 } = await supabase
    .schema("public")
    .from("tender_projects")
    .select("linked_project_id")
    .eq("status", "won")
    .not("linked_project_id", "is", null)
  if (e1) throw new Error(e1.message)
  const ids = [
    ...new Set(
      (tp ?? [])
        .map((r: { linked_project_id?: string | null }) =>
          String(r.linked_project_id ?? "").trim()
        )
        .filter(Boolean)
    ),
  ]
  if (ids.length === 0) return []
  const { data: proj, error: e2 } = await supabase
    .schema("public")
    .from("projects")
    .select("id, name, internal_project_code")
    .in("id", ids)
    .eq("is_deleted", false)
    .order("name", { ascending: true })
  if (e2) throw new Error(e2.message)
  return (proj ?? []) as WonLinkedProjectOption[]
}

export async function createTask(input: CreateTaskInput) {
  const projectId = String(input.projectId ?? "").trim()
  const parentId = String(input.parentId ?? "").trim()
  const name = String(input.name ?? "").trim()
  const description = String(input.description ?? "").trim()
  const startDate = normalizeIsoDate(input.startDate ?? null)
  const endDate = normalizeIsoDate(input.endDate ?? null)
  const estimatedCost = Math.max(0, Number(input.estimatedCost ?? 0) || 0)
  const actualCost = Math.max(0, Number(input.actualCost ?? 0) || 0)
  const progress = Math.max(0, Math.min(100, Number(input.progress ?? 0) || 0))

  if (!projectId) throw new Error("projectId חסר")
  if (!name) throw new Error("שם משימה חובה")
  if (startDate && endDate && dateToUtcMs(startDate) > dateToUtcMs(endDate)) {
    throw new Error("טווח תאריכים מתוכנן אינו תקין")
  }

  const supabase = await createSupabaseServerAuthClient()
  const parentIdNorm = parentId || null
  const { data: sibRows, error: sibErr } = await supabase
    .schema("public")
    .from("tasks")
    .select("wbs_order")
    .eq("project_id", projectId)
    .eq("parent_id", parentIdNorm)
  if (sibErr) throw new Error(sibErr.message)
  const maxW = Math.max(
    0,
    ...((sibRows ?? []) as { wbs_order?: number }[]).map((s) => Number(s.wbs_order ?? 0) || 0)
  )
  let level = 0
  if (parentIdNorm) {
    const { data: pRow } = await supabase
      .schema("public")
      .from("tasks")
      .select("level")
      .eq("id", parentIdNorm)
      .maybeSingle()
    level = Math.max(0, Number((pRow as { level?: number } | null)?.level ?? 0) + 1)
  }

  const { data, error } = await supabase
    .schema("public")
    .from("tasks")
    .insert({
      project_id: projectId,
      parent_id: parentIdNorm,
      parent_task_id: null,
      subcontractor_id: null,
      contract_id: null,
      is_derivative: false,
      name,
      description: description || null,
      start_date: startDate,
      end_date: endDate,
      progress,
      estimated_cost: estimatedCost,
      actual_cost: actualCost,
      wbs_order: maxW + 1,
      level,
    })
    .select("id")
    .single()

  if (error || !data?.id) {
    throw new Error(error?.message ?? "יצירת משימה נכשלה")
  }
  await recalculateWbsSchedule(projectId)

  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath(`/marker-ofek/projects/${projectId}/gantt-editor`)
  revalidatePath("/marker-ofek/execution")
  return { id: String(data.id) }
}

export async function createDerivativeTask(input: {
  projectId: string
  masterTaskId: string
  name: string
  wbsParentId?: string | null
  subcontractorId?: string | null
  contractId?: string | null
}) {
  const projectId = String(input.projectId ?? "").trim()
  const masterTaskId = String(input.masterTaskId ?? "").trim()
  const name = String(input.name ?? "").trim()
  const wbsParentId = String(input.wbsParentId ?? "").trim() || null
  const subcontractorId = String(input.subcontractorId ?? "").trim() || null
  const contractId = String(input.contractId ?? "").trim() || null

  if (!projectId) throw new Error("projectId חסר")
  if (!masterTaskId) throw new Error("נדרשת משימת מאסטר")
  if (!name) throw new Error("שם משימה חובה")

  const supabase = await createSupabaseServerAuthClient()
  const projectTasks = await fetchProjectTasks(projectId)
  const master = projectTasks.find((t) => t.id === masterTaskId)
  if (!master) throw new Error("משימת מאסטר לא נמצאה בפרויקט")
  if (master.is_derivative) throw new Error("לא ניתן לקשר נגזרת למשימה שהיא כבר נגזרת")

  const startDate = normalizeIsoDate(master.start_date)
  const endDate = normalizeIsoDate(master.end_date)
  if (!startDate || !endDate) throw new Error("למשימת המאסטר חייבים להיות תאריכי התחלה וסיום")

  if (contractId) {
    const { data: cRow, error: cErr } = await supabase
      .schema("public")
      .from("contracts")
      .select("id, project_id")
      .eq("id", contractId)
      .eq("is_deleted", false)
      .maybeSingle()
    if (cErr) throw new Error(cErr.message)
    if (!cRow || String((cRow as { project_id?: string }).project_id ?? "") !== projectId) {
      throw new Error("החוזה אינו שייך לפרויקט זה")
    }
  }

  const { data: sibRows, error: sibErr } = await supabase
    .schema("public")
    .from("tasks")
    .select("wbs_order")
    .eq("project_id", projectId)
    .eq("parent_id", wbsParentId)
  if (sibErr) throw new Error(sibErr.message)
  const maxW = Math.max(
    0,
    ...((sibRows ?? []) as { wbs_order?: number }[]).map((s) => Number(s.wbs_order ?? 0) || 0)
  )
  let level = 0
  if (wbsParentId) {
    const { data: pRow } = await supabase
      .schema("public")
      .from("tasks")
      .select("level")
      .eq("id", wbsParentId)
      .maybeSingle()
    level = Math.max(0, Number((pRow as { level?: number } | null)?.level ?? 0) + 1)
  }

  const { data, error } = await supabase
    .schema("public")
    .from("tasks")
    .insert({
      project_id: projectId,
      parent_id: wbsParentId,
      parent_task_id: masterTaskId,
      subcontractor_id: subcontractorId,
      contract_id: contractId,
      is_derivative: true,
      name,
      description: null,
      start_date: startDate,
      end_date: endDate,
      progress: 0,
      estimated_cost: 0,
      actual_cost: 0,
      wbs_order: maxW + 1,
      level,
    })
    .select("id")
    .single()

  if (error || !data?.id) {
    throw new Error(error?.message ?? "יצירת משימת נגזרת נכשלה")
  }

  await recalculateWbsSchedule(projectId)
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}/subcontractor`)
  revalidatePath("/marker-ofek/execution")
  return { id: String(data.id) }
}

export async function updateDerivativeTaskBillingLink(input: {
  projectId: string
  taskId: string
  subcontractorId?: string | null
  contractId?: string | null
}) {
  const projectId = String(input.projectId ?? "").trim()
  const taskId = String(input.taskId ?? "").trim()
  const subcontractorId =
    input.subcontractorId === undefined
      ? undefined
      : String(input.subcontractorId ?? "").trim() || null
  const contractId =
    input.contractId === undefined ? undefined : String(input.contractId ?? "").trim() || null

  if (!projectId || !taskId) throw new Error("נתונים חסרים")

  const supabase = await createSupabaseServerAuthClient()
  const rows = await fetchProjectTasks(projectId)
  const task = rows.find((t) => t.id === taskId)
  if (!task) throw new Error("המשימה לא נמצאה")
  if (!task.is_derivative) throw new Error("הקישור זמין רק למשימות נגזרות (ספק ביצוע)")

  if (contractId) {
    const { data: cRow, error: cErr } = await supabase
      .schema("public")
      .from("contracts")
      .select("id, project_id")
      .eq("id", contractId)
      .eq("is_deleted", false)
      .maybeSingle()
    if (cErr) throw new Error(cErr.message)
    if (!cRow || String((cRow as { project_id?: string }).project_id ?? "") !== projectId) {
      throw new Error("החוזה אינו שייך לפרויקט זה")
    }
  }

  const patch: Record<string, unknown> = {}
  if (subcontractorId !== undefined) patch.subcontractor_id = subcontractorId
  if (contractId !== undefined) patch.contract_id = contractId

  const { error } = await supabase
    .schema("public")
    .from("tasks")
    .update(patch)
    .eq("id", taskId)
    .eq("project_id", projectId)
  if (error) throw new Error(error.message)

  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}/subcontractor`)
  revalidatePath("/marker-ofek/execution")
  return { ok: true }
}

export async function groupTasksAsHammock(input: {
  projectId: string
  name: string
  taskIds: string[]
}) {
  const projectId = String(input.projectId ?? "").trim()
  const name = String(input.name ?? "").trim()
  const taskIds = (input.taskIds ?? []).map((id) => String(id).trim()).filter(Boolean)
  if (!projectId) throw new Error("projectId חסר")
  if (!name) throw new Error("שם קבוצת ערסל חובה")
  if (taskIds.length < 2) throw new Error("יש לבחור לפחות שתי משימות לקיבוץ")

  const supabase = await createSupabaseServerAuthClient()
  const tasks = await fetchProjectTasks(projectId)
  const selected = tasks.filter((t) => taskIds.includes(t.id))
  if (selected.length < 2) throw new Error("לא נמצאו משימות תקינות לקיבוץ")

  const starts = selected
    .map((t) => normalizeIsoDate(t.start_date))
    .filter((v): v is string => Boolean(v))
  const ends = selected
    .map((t) => normalizeIsoDate(t.end_date))
    .filter((v): v is string => Boolean(v))
  const minStart = starts.length
    ? starts.reduce((a, b) => (dateToUtcMs(a) <= dateToUtcMs(b) ? a : b))
    : null
  const maxEnd = ends.length
    ? ends.reduce((a, b) => (dateToUtcMs(a) >= dateToUtcMs(b) ? a : b))
    : null

  const { data: parent, error: parentErr } = await supabase
    .schema("public")
    .from("tasks")
    .insert({
      project_id: projectId,
      parent_id: null,
      name,
      description: "משימת ערסל (קיבוץ אוטומטי)",
      start_date: minStart,
      end_date: maxEnd,
      progress: 0,
      estimated_cost: 0,
      actual_cost: 0,
    })
    .select("id")
    .single()
  if (parentErr || !parent?.id) throw new Error(parentErr?.message ?? "יצירת ערסל נכשלה")

  const { error: updateErr } = await supabase
    .schema("public")
    .from("tasks")
    .update({ parent_id: String(parent.id) })
    .in("id", taskIds)
    .eq("project_id", projectId)
  if (updateErr) throw new Error(updateErr.message)

  await syncWbsLevelsFromTree(projectId)
  await recalculateWbsSchedule(projectId)
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath(`/marker-ofek/projects/${projectId}/gantt-editor`)
  revalidatePath("/marker-ofek/execution")
  return { parentId: String(parent.id) }
}

export async function updateTaskParent(input: {
  projectId: string
  taskId: string
  parentId: string | null
}) {
  const projectId = String(input.projectId ?? "").trim()
  const taskId = String(input.taskId ?? "").trim()
  const parentId = String(input.parentId ?? "").trim() || null
  if (!projectId) throw new Error("projectId חסר")
  if (!taskId) throw new Error("taskId חסר")
  if (parentId && parentId === taskId) throw new Error("משימה לא יכולה להיות הורה של עצמה")

  const supabase = await createSupabaseServerAuthClient()
  const { error } = await supabase
    .schema("public")
    .from("tasks")
    .update({ parent_id: parentId })
    .eq("id", taskId)
    .eq("project_id", projectId)
  if (error) throw new Error(error.message)

  await syncWbsLevelsFromTree(projectId)
  await recalculateWbsSchedule(projectId)
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath("/marker-ofek/execution")
  return { ok: true }
}

export async function deleteTasksBulk(input: {
  projectId: string
  taskIds: string[]
}) {
  const projectId = String(input.projectId ?? "").trim()
  const taskIds = (input.taskIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean)
  if (!projectId) throw new Error("projectId חסר")
  if (taskIds.length === 0) return { deleted: 0 }

  const supabase = await createSupabaseServerAuthClient()
  const { error } = await supabase
    .schema("public")
    .from("tasks")
    .delete()
    .eq("project_id", projectId)
    .in("id", taskIds)
  if (error) throw new Error(error.message)

  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath("/marker-ofek/execution")
  return { deleted: taskIds.length }
}

export async function fetchResourceEngine(projectId: string): Promise<{
  resources: ProjectResourceRow[]
  vacations: ResourceVacationRow[]
  assignments: TaskResourceAssignmentRow[]
}> {
  const projectIdTrim = String(projectId ?? "").trim()
  if (!projectIdTrim) return { resources: [], vacations: [], assignments: [] }
  const supabase = await createSupabaseServerAuthClient()

  const [resourcesRes, vacationsRes, assignmentsRes] = await Promise.all([
    supabase
      .schema("public")
      .from("resources")
      .select("id, name, profession, cost_per_day, availability_status")
      .order("name", { ascending: true }),
    supabase
      .schema("public")
      .from("project_resource_vacations")
      .select("id, resource_id, start_date, end_date, notes"),
    supabase
      .schema("public")
      .from("task_resource_assignments")
      .select("id, task_id, resource_id, project_id, units, tasks!inner ( name, start_date, end_date )")
      .eq("project_id", projectIdTrim),
  ])
  if (resourcesRes.error) throw new Error(resourcesRes.error.message)
  if (vacationsRes.error && !isMissingRelationError(vacationsRes.error)) {
    throw new Error(vacationsRes.error.message)
  }
  if (assignmentsRes.error) throw new Error(assignmentsRes.error.message)

  const assignments: TaskResourceAssignmentRow[] = (assignmentsRes.data ?? []).map((row) => {
    const task = Array.isArray((row as { tasks?: unknown }).tasks)
      ? ((row as { tasks: Array<{ name?: string; start_date?: string | null; end_date?: string | null }> }).tasks[0] ?? {})
      : ((row as { tasks?: { name?: string; start_date?: string | null; end_date?: string | null } }).tasks ?? {})
    const unitsRaw = (row as { units?: unknown }).units
    const units =
      unitsRaw == null || unitsRaw === ""
        ? null
        : Number.isFinite(Number(unitsRaw))
          ? Number(unitsRaw)
          : null
    return {
      id: String((row as { id?: unknown }).id ?? ""),
      task_id: String((row as { task_id?: unknown }).task_id ?? ""),
      resource_id: String((row as { resource_id?: unknown }).resource_id ?? ""),
      project_id: String((row as { project_id?: unknown }).project_id ?? ""),
      task_name: String(task.name ?? "").trim(),
      start_date: task.start_date ? String(task.start_date) : null,
      end_date: task.end_date ? String(task.end_date) : null,
      units,
    }
  })

  return {
    resources: ((resourcesRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id ?? ""),
      name: String(r.name ?? ""),
      profession: String(r.profession ?? ""),
      cost_per_day: Number(r.cost_per_day ?? 0) || 0,
      availability_status:
        String(r.availability_status ?? "available") === "unavailable"
          ? "unavailable"
          : String(r.availability_status ?? "available") === "vacation"
            ? "vacation"
            : "available",
    })),
    vacations: ((vacationsRes.error ? [] : vacationsRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id ?? ""),
      resource_id: String(r.resource_id ?? ""),
      start_date: String(r.start_date ?? ""),
      end_date: String(r.end_date ?? ""),
      notes: r.notes == null ? null : String(r.notes),
    })),
    assignments,
  }
}

export async function createProjectResource(input: {
  projectId: string
  fullName: string
  profession: string
  hourlyCost: number
  workDays: number[]
}) {
  const projectId = String(input.projectId ?? "").trim()
  const fullName = String(input.fullName ?? "").trim()
  const profession = String(input.profession ?? "").trim()
  const hourlyCost = Math.max(0, Number(input.hourlyCost ?? 0) || 0)
  const _workDays = Array.isArray(input.workDays) ? input.workDays : [0, 1, 2, 3, 4]
  void _workDays
  if (!projectId) throw new Error("projectId חסר")
  if (!fullName) throw new Error("שם עובד חובה")
  const supabase = await createSupabaseServerAuthClient()

  const existing = await supabase
    .schema("public")
    .from("resources")
    .select("id")
    .ilike("name", fullName)
    .limit(1)
    .maybeSingle()
  if (!existing.error && existing.data?.id) {
    revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
    revalidatePath(`/marker-ofek/projects/${projectId}/gantt-editor`)
    return { id: String(existing.data.id) }
  }

  const { data, error } = await supabase
    .schema("public")
    .from("resources")
    .insert({
      name: fullName,
      profession,
      cost_per_day: hourlyCost * 8,
      availability_status: "available",
    })
    .select("id")
    .single()
  if (error || !data?.id) throw new Error(error?.message ?? "יצירת משאב נכשלה")
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath(`/marker-ofek/projects/${projectId}/gantt-editor`)
  return { id: String(data.id) }
}

export async function createResourceVacation(input: {
  resourceId: string
  startDate: string
  endDate: string
  notes?: string
}) {
  const resourceId = String(input.resourceId ?? "").trim()
  const startDate = normalizeIsoDate(input.startDate)
  const endDate = normalizeIsoDate(input.endDate)
  const notes = String(input.notes ?? "").trim()
  if (!resourceId) throw new Error("resourceId חסר")
  if (!startDate || !endDate) throw new Error("טווח חופשה חסר")
  if (dateToUtcMs(startDate) > dateToUtcMs(endDate)) throw new Error("טווח חופשה אינו תקין")
  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("project_resource_vacations")
    .insert({
      resource_id: resourceId,
      start_date: startDate,
      end_date: endDate,
      notes: notes || null,
    })
    .select("id")
    .single()
  if (error && isMissingRelationError(error)) {
    throw new Error(
      "טבלת project_resource_vacations חסרה בסכימה. יש להריץ את מיגרציית resource calendar engine."
    )
  }
  if (error || !data?.id) throw new Error(error?.message ?? "שמירת חופשה נכשלה")
  return { id: String(data.id) }
}

export async function assignResourceToTask(input: {
  projectId: string
  taskId: string
  resourceId: string
  units?: number | null
}) {
  const projectId = String(input.projectId ?? "").trim()
  const taskId = String(input.taskId ?? "").trim()
  const resourceId = String(input.resourceId ?? "").trim()
  if (!projectId || !taskId || !resourceId) throw new Error("נתוני שיוך חסרים")
  const supabase = await createSupabaseServerAuthClient()
  const { data: existing } = await supabase
    .schema("public")
    .from("task_resource_assignments")
    .select("id")
    .eq("task_id", taskId)
    .eq("resource_id", resourceId)
    .limit(1)
    .maybeSingle()
  if (!existing?.id) {
    const { error } = await supabase
      .schema("public")
      .from("task_resource_assignments")
      .insert({
        task_id: taskId,
        resource_id: resourceId,
        project_id: projectId,
        units: input.units ?? null,
      })
    if (error) throw new Error(error.message)
  } else if (input.units !== undefined) {
    const { error } = await supabase
      .schema("public")
      .from("task_resource_assignments")
      .update({ units: input.units ?? null })
      .eq("id", String(existing.id))
    if (error) throw new Error(error.message)
  }
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath(`/marker-ofek/projects/${projectId}/gantt-editor`)
  return { ok: true }
}

export async function removeTaskResourceAssignment(input: {
  projectId: string
  taskId: string
  resourceId: string
}) {
  const projectId = String(input.projectId ?? "").trim()
  const taskId = String(input.taskId ?? "").trim()
  const resourceId = String(input.resourceId ?? "").trim()
  if (!projectId || !taskId || !resourceId) throw new Error("נתוני שיוך חסרים")
  const supabase = await createSupabaseServerAuthClient()
  const { error } = await supabase
    .schema("public")
    .from("task_resource_assignments")
    .delete()
    .eq("project_id", projectId)
    .eq("task_id", taskId)
    .eq("resource_id", resourceId)
  if (error) throw new Error(error.message)
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath(`/marker-ofek/projects/${projectId}/gantt-editor`)
  revalidatePath("/marker-ofek/execution")
  return { ok: true }
}

export async function clearTaskResourceAssignments(input: { projectId: string; taskId: string }) {
  const projectId = String(input.projectId ?? "").trim()
  const taskId = String(input.taskId ?? "").trim()
  if (!projectId) throw new Error("projectId חסר")
  if (!taskId) throw new Error("taskId חסר")
  const supabase = await createSupabaseServerAuthClient()
  const { error } = await supabase
    .schema("public")
    .from("task_resource_assignments")
    .delete()
    .eq("project_id", projectId)
    .eq("task_id", taskId)
  if (error) throw new Error(error.message)
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath(`/marker-ofek/projects/${projectId}/gantt-editor`)
  revalidatePath("/marker-ofek/execution")
  return { ok: true }
}

export async function listSupplierEntitiesForGantt(): Promise<{ id: string; name: string }[]> {
  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("entities")
    .select("id, name")
    .in("type", ["subcontractor", "supplier"])
    .eq("is_deleted", false)
    .order("name", { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<{ id?: string; name?: string }>).map((r) => ({
    id: String(r.id ?? ""),
    name: String(r.name ?? "").trim() || "—",
  }))
}

export async function updateTaskDetailsForSchedule(input: {
  projectId: string
  taskId: string
  name?: string
  description?: string | null
  subcontractorId?: string | null
}) {
  const projectId = String(input.projectId ?? "").trim()
  const taskId = String(input.taskId ?? "").trim()
  if (!projectId || !taskId) throw new Error("נתונים חסרים")
  const supabase = await createSupabaseServerAuthClient()
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) {
    const n = String(input.name).trim()
    if (!n) throw new Error("שם משימה חובה")
    patch.name = n
  }
  if (input.description !== undefined) patch.description = input.description
  if (input.subcontractorId !== undefined) patch.subcontractor_id = input.subcontractorId
  if (Object.keys(patch).length === 0) return { ok: true }
  const { error } = await supabase
    .schema("public")
    .from("tasks")
    .update(patch)
    .eq("id", taskId)
    .eq("project_id", projectId)
  if (error) throw new Error(error.message)
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath(`/marker-ofek/projects/${projectId}/gantt-editor`)
  revalidatePath("/marker-ofek/execution")
  return { ok: true }
}

export async function fetchResourcesGridRows(): Promise<ResourceGridRow[]> {
  const supabase = await createSupabaseServerAuthClient()

  const [resourcesRes, assignmentsRes, boqLinksRes] = await Promise.all([
    supabase
      .schema("public")
      .from("resources")
      .select("id, name, profession, cost_per_day, availability_status")
      .order("name", { ascending: true }),
    supabase
      .schema("public")
      .from("task_resource_assignments")
      .select("resource_id, project_id, task_id, tasks!inner ( start_date, end_date )"),
    supabase
      .schema("public")
      .from("task_boq_links")
      .select("task_id, linked_quantity, project_boq!inner(project_id, planned_quantity, rate)"),
  ])
  if (resourcesRes.error) throw new Error(resourcesRes.error.message)
  if (assignmentsRes.error) throw new Error(assignmentsRes.error.message)
  if (boqLinksRes.error && !isMissingRelationError(boqLinksRes.error)) {
    throw new Error(boqLinksRes.error.message)
  }

  type AssignmentWindow = {
    resourceId: string
    projectId: string
    taskId: string
    startDate: string | null
    endDate: string | null
  }
  const windows: AssignmentWindow[] = (assignmentsRes.data ?? []).map((row) => {
    const task = Array.isArray((row as { tasks?: unknown }).tasks)
      ? ((row as { tasks: Array<{ start_date?: string | null; end_date?: string | null }> }).tasks[0] ?? {})
      : ((row as { tasks?: { start_date?: string | null; end_date?: string | null } }).tasks ?? {})
    return {
      resourceId: String((row as { resource_id?: unknown }).resource_id ?? ""),
      projectId: String((row as { project_id?: unknown }).project_id ?? ""),
      taskId: String((row as { task_id?: unknown }).task_id ?? ""),
      startDate: task.start_date ? String(task.start_date) : null,
      endDate: task.end_date ? String(task.end_date) : null,
    }
  })

  const boqCostByTask = new Map<string, number>()
  for (const row of (boqLinksRes.error ? [] : boqLinksRes.data ?? []) as Array<Record<string, unknown>>) {
    const boq = Array.isArray((row as { project_boq?: unknown }).project_boq)
      ? ((row as { project_boq: Array<{ planned_quantity?: number; rate?: number }> }).project_boq[0] ?? {})
      : ((row as { project_boq?: { planned_quantity?: number; rate?: number } }).project_boq ?? {})
    const rate = Number(boq.rate ?? 0) || 0
    const plannedQuantity = Number(boq.planned_quantity ?? 0) || 0
    const linkedQuantityRaw = row.linked_quantity == null ? null : Number(row.linked_quantity)
    const linkedQuantity = linkedQuantityRaw == null || Number.isNaN(linkedQuantityRaw) ? null : linkedQuantityRaw
    const qty = linkedQuantity == null ? plannedQuantity : linkedQuantity
    const taskId = String(row.task_id ?? "")
    boqCostByTask.set(taskId, (boqCostByTask.get(taskId) ?? 0) + Math.max(0, qty) * Math.max(0, rate))
  }

  const conflictMeta = new Map<string, { count: number; projects: Set<string> }>()
  const overlaps = (a: AssignmentWindow, b: AssignmentWindow) => {
    if (!a.startDate || !a.endDate || !b.startDate || !b.endDate) return false
    const aStart = Date.parse(`${a.startDate}T00:00:00.000Z`)
    const aEnd = Date.parse(`${a.endDate}T00:00:00.000Z`)
    const bStart = Date.parse(`${b.startDate}T00:00:00.000Z`)
    const bEnd = Date.parse(`${b.endDate}T00:00:00.000Z`)
    return aStart <= bEnd && bStart <= aEnd
  }

  const byResource = new Map<string, AssignmentWindow[]>()
  for (const w of windows) {
    const list = byResource.get(w.resourceId) ?? []
    list.push(w)
    byResource.set(w.resourceId, list)
  }
  for (const [resourceId, list] of byResource.entries()) {
    let count = 0
    const projects = new Set<string>()
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (!overlaps(list[i]!, list[j]!)) continue
        count += 1
        projects.add(list[i]!.projectId)
        projects.add(list[j]!.projectId)
      }
    }
    conflictMeta.set(resourceId, { count, projects })
  }

  return ((resourcesRes.data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const resourceId = String(r.id ?? "")
    const meta = conflictMeta.get(resourceId) ?? { count: 0, projects: new Set<string>() }
    const rate = Number(r.cost_per_day ?? 0) || 0
    const costImpact = windows
      .filter((w) => w.resourceId === resourceId)
      .reduce((sum, w) => {
        const durationDays =
          w.startDate && w.endDate
            ? Math.max(1, Math.round((dateToUtcMs(w.endDate) - dateToUtcMs(w.startDate)) / (24 * 60 * 60 * 1000)) + 1)
            : 0
        const boqCost = boqCostByTask.get(w.taskId) ?? 0
        return sum + durationDays * rate + boqCost
      }, 0)
    return {
      id: resourceId,
      name: String(r.name ?? "").trim(),
      profession: String(r.profession ?? "").trim(),
      cost_per_day: rate,
      availability_status:
        String(r.availability_status ?? "available") === "unavailable"
          ? "unavailable"
          : String(r.availability_status ?? "available") === "vacation"
            ? "vacation"
            : "available",
      conflict_count: meta.count,
      conflict_projects: [...meta.projects].filter(Boolean),
      cost_impact: Math.round(costImpact),
    }
  })
}

export async function upsertResourceRow(input: {
  id?: string
  name: string
  profession: string
  costPerDay: number
  availabilityStatus: "available" | "unavailable" | "vacation"
}) {
  const id = String(input.id ?? "").trim()
  const name = String(input.name ?? "").trim()
  const profession = String(input.profession ?? "").trim()
  const costPerDay = Math.max(0, Number(input.costPerDay ?? 0) || 0)
  const availabilityStatus =
    input.availabilityStatus === "unavailable"
      ? "unavailable"
      : input.availabilityStatus === "vacation"
        ? "vacation"
        : "available"
  if (!name) throw new Error("שם עובד חובה")

  const supabase = await createSupabaseServerAuthClient()
  if (id) {
    const { error } = await supabase
      .schema("public")
      .from("resources")
      .update({
        name,
        profession,
        cost_per_day: costPerDay,
        availability_status: availabilityStatus,
      })
      .eq("id", id)
    if (error) throw new Error(error.message)
    revalidatePath("/marker-ofek/execution/resources")
    return { id }
  }

  const { data, error } = await supabase
    .schema("public")
    .from("resources")
    .insert({
      name,
      profession,
      cost_per_day: costPerDay,
      availability_status: availabilityStatus,
    })
    .select("id")
    .single()
  if (error || !data?.id) {
    throw new Error(error?.message ?? "יצירת עובד נכשלה")
  }
  revalidatePath("/marker-ofek/execution/resources")
  return { id: String(data.id) }
}

export async function markTaskDoneFromField(input: {
  taskId: string
  projectId: string
}) {
  const taskId = String(input.taskId ?? "").trim()
  const projectId = String(input.projectId ?? "").trim()
  if (!taskId || !projectId) throw new Error("נתוני משימה חסרים")

  const supabase = await createSupabaseServerAuthClient()
  const today = format(new Date(), "yyyy-MM-dd")
  const { data: taskRow, error: taskErr } = await supabase
    .schema("public")
    .from("tasks")
    .select("start_date, end_date, actual_start_date, is_derivative, parent_task_id")
    .eq("id", taskId)
    .eq("project_id", projectId)
    .maybeSingle()
  if (taskErr || !taskRow) throw new Error(taskErr?.message ?? "המשימה לא נמצאה")

  const startDate = String(taskRow.start_date ?? "").trim() || today
  const endDate = String(taskRow.end_date ?? "").trim() || today
  let finalEnd = dateToUtcMs(endDate) < dateToUtcMs(today) ? today : endDate

  const isDerivative = Boolean((taskRow as { is_derivative?: boolean }).is_derivative)
  const parentTaskId = (taskRow as { parent_task_id?: string | null }).parent_task_id
  if (isDerivative && parentTaskId) {
    const { data: mRow } = await supabase
      .schema("public")
      .from("tasks")
      .select("end_date")
      .eq("id", parentTaskId)
      .maybeSingle()
    const mEnd = normalizeIsoDate((mRow as { end_date?: string | null } | null)?.end_date ?? null)
    if (mEnd && dateToUtcMs(finalEnd) > dateToUtcMs(mEnd)) {
      finalEnd = mEnd
    }
  }

  await updateTaskDatesWithDependencies({
    taskId,
    projectId,
    startDate,
    endDate: finalEnd,
  })

  const { error: updateErr } = await supabase
    .schema("public")
    .from("tasks")
    .update({
      progress: 100,
      actual_start_date: taskRow.actual_start_date ?? today,
      actual_end_date: today,
    })
    .eq("id", taskId)
    .eq("project_id", projectId)
  if (updateErr) throw new Error(updateErr.message)

  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}/field`)
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}/subcontractor`)
  return { ok: true, completedAt: today }
}

export async function generateProjectWbsFromDocuments(projectId: string) {
  const projectIdTrim = String(projectId ?? "").trim()
  if (!projectIdTrim) throw new Error("projectId חסר")
  const supabase = await createSupabaseServerAuthClient()

  const [docsRes, contractsRes] = await Promise.all([
    supabase
      .schema("public")
      .from("project_documents")
      .select("title, document_kind, mime_type, is_folder")
      .eq("project_id", projectIdTrim)
      .eq("is_folder", false)
      .order("created_at", { ascending: false })
      .limit(120),
    supabase
      .schema("public")
      .from("contracts")
      .select("id")
      .eq("project_id", projectIdTrim)
      .eq("is_deleted", false),
  ])
  if (docsRes.error) throw new Error(docsRes.error.message)
  if (contractsRes.error) throw new Error(contractsRes.error.message)

  const contractIds = ((contractsRes.data ?? []) as Array<{ id: string }>).map((r) => r.id)
  let milestoneNames: string[] = []
  if (contractIds.length > 0) {
    const milestonesRes = await supabase
      .schema("public")
      .from("contract_milestones")
      .select("name")
      .in("contract_id", contractIds)
      .order("sort_order", { ascending: true })
      .limit(250)
    if (!milestonesRes.error) {
      milestoneNames = ((milestonesRes.data ?? []) as Array<{ name?: string }>).map((r) =>
        String(r.name ?? "").trim()
      )
    }
  }

  const docLines = ((docsRes.data ?? []) as Array<Record<string, unknown>>)
    .map((r) => ({
      title: String(r.title ?? "").trim(),
      kind: String(r.document_kind ?? "").trim(),
      mime: String(r.mime_type ?? "").trim(),
    }))
    .filter((r) => r.title)

  let generated: GeneratedWbs | null = null
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (apiKey && docLines.length > 0) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" })
      const prompt = `אתה מנהל תכנון בכיר. צור WBS בן 3 רמות בפורמט JSON בלבד.
מבנה חובה:
{"phases":[{"name":"", "workPackages":[{"name":"", "tasks":["",""]}]}]}
כל הטקסט בעברית מקצועית. 3-5 phases, בכל phase 2-5 workPackages, בכל workPackage 2-6 tasks.
מיקוד לפי מסמכים ו-BoQ/חוזים.
מסמכים:
${docLines.map((d) => `- ${d.title} | kind=${d.kind} | mime=${d.mime}`).join("\n")}
סעיפי חוזה/BoQ:
${milestoneNames.slice(0, 120).map((n) => `- ${n}`).join("\n")}
החזר JSON בלבד ללא הסברים.`
      const result = await model.generateContent([{ text: prompt }])
      const text = result.response.text() ?? ""
      generated = safeParseGeneratedWbs(text)
    } catch {
      generated = null
    }
  }

  if (!generated || !Array.isArray(generated.phases) || generated.phases.length === 0) {
    generated = {
      phases: [
        {
          name: "תכנון והיערכות",
          workPackages: [
            {
              name: "ניתוח מסמכי חוזה",
              tasks: milestoneNames.slice(0, 4).map((m) => `בדיקת סעיף: ${m || "סעיף חוזה"}`),
            },
            {
              name: "תכנון לוחות זמנים",
              tasks: ["בניית לו\"ז ראשוני", "קביעת אבני דרך", "אישור תכנית ביצוע"],
            },
          ],
        },
        {
          name: "ביצוע ופיקוח",
          workPackages: [
            {
              name: "עבודות שטח",
              tasks: ["היערכות צוותים", "ביצוע משימות יומיות", "בקרת איכות שוטפת"],
            },
            {
              name: "ניהול משאבים",
              tasks: ["שיבוץ עובדים", "בדיקת עומסים", "עדכון זמינות וחופשות"],
            },
          ],
        },
        {
          name: "מסירה ובקרה פיננסית",
          workPackages: [
            {
              name: "בדיקות סופיות",
              tasks: ["בדיקות קבלה", "סגירת ליקויים", "מסירת הפרויקט ללקוח"],
            },
            {
              name: "סיכום כספי",
              tasks: ["בדיקת חריגות תקציב", "סיכום עלויות בפועל", "דו\"ח ניהולי מסכם"],
            },
          ],
        },
      ],
    }
  }

  await insertGeneratedWbs(supabase, projectIdTrim, generated)
  await recalculateWbsSchedule(projectIdTrim)
  revalidatePath(`/marker-ofek/execution/gantt/${projectIdTrim}`)
  revalidatePath(`/marker-ofek/projects/${projectIdTrim}`)
  return { ok: true, phases: generated.phases.length }
}

export async function calculateTaskCostVariance(projectId: string) {
  const tasks = await fetchProjectTasks(projectId)
  const plannedCost = tasks.reduce((acc, row) => acc + row.estimated_cost, 0)
  const actualCost = tasks.reduce((acc, row) => acc + row.actual_cost, 0)
  const variance = actualCost - plannedCost
  const variancePercent = plannedCost > 0 ? (variance / plannedCost) * 100 : 0
  const perTask = tasks.map((task) => {
    const taskVariance = task.actual_cost - task.estimated_cost
    const taskVariancePercent =
      task.estimated_cost > 0 ? (taskVariance / task.estimated_cost) * 100 : 0
    return {
      taskId: task.id,
      estimatedCost: task.estimated_cost,
      actualCost: task.actual_cost,
      variance: taskVariance,
      variancePercent: taskVariancePercent,
      status:
        taskVariance > 0
          ? "over"
          : taskVariance < 0
            ? "under"
            : "on_track",
    }
  })

  const status: "over" | "under" | "on_track" =
    variance > 0 ? "over" : variance < 0 ? "under" : "on_track"

  return {
    taskCount: tasks.length,
    plannedCost,
    actualCost,
    variance,
    variancePercent,
    status,
    perTask,
  }
}

export type WbsNodeBrief = {
  id: string
  parent_node_id: string | null
  label: string
  sort_order: number
}

/** מבנה WBS לפרויקט (אם קיים) — לשילוב בתצוגת גאנט חזותית */
export async function fetchProjectWbsBundle(projectId: string): Promise<{
  structureId: string | null
  nodes: WbsNodeBrief[]
}> {
  const pid = String(projectId ?? "").trim()
  if (!pid) return { structureId: null, nodes: [] }

  const supabase = await createSupabaseServerAuthClient()
  const { data: structures, error: sErr } = await supabase
    .from("wbs_structures")
    .select("id")
    .eq("project_id", pid)
    .order("created_at", { ascending: false })
    .limit(1)

  if (sErr || !structures?.length) {
    return { structureId: null, nodes: [] }
  }

  const structureId = String(structures[0]!.id ?? "").trim()
  if (!structureId) return { structureId: null, nodes: [] }

  const { data: nodes, error: nErr } = await supabase
    .from("wbs_nodes")
    .select("id, parent_node_id, label, sort_order")
    .eq("structure_id", structureId)
    .order("sort_order", { ascending: true })

  if (nErr) {
    return { structureId, nodes: [] }
  }

  const out: WbsNodeBrief[] = (nodes ?? []).map((n) => ({
    id: String((n as { id?: string }).id ?? ""),
    parent_node_id:
      (n as { parent_node_id?: string | null }).parent_node_id ?? null,
    label: String((n as { label?: string }).label ?? "").trim() || "—",
    sort_order: Number((n as { sort_order?: number }).sort_order ?? 0) || 0,
  }))

  return { structureId, nodes: out.filter((x) => x.id) }
}
