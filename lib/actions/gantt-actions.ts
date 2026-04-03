"use server"

import { revalidatePath } from "next/cache"
import { addDays, format } from "date-fns"
import { GoogleGenerativeAI } from "@google/generative-ai"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { addWorkingDays } from "@/lib/utils/calendar-utils"

export type GanttTaskRow = {
  id: string
  project_id: string
  parent_id: string | null
  name: string
  description: string | null
  start_date: string | null
  end_date: string | null
  actual_start_date: string | null
  actual_end_date: string | null
  progress: number
  dependency_ids: string[]
  estimated_cost: number
  actual_cost: number
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

async function recalculateParentTaskDates(
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>,
  projectId: string
) {
  const tasks = await fetchProjectTasks(projectId)
  const childrenByParent = new Map<string, GanttTaskRow[]>()
  for (const task of tasks) {
    if (!task.parent_id) continue
    const list = childrenByParent.get(task.parent_id) ?? []
    list.push(task)
    childrenByParent.set(task.parent_id, list)
  }

  const parents = tasks.filter((t) => childrenByParent.has(t.id))
  for (const parent of parents) {
    const kids = childrenByParent.get(parent.id) ?? []
    const starts = kids
      .map((k) => normalizeIsoDate(k.start_date))
      .filter((v): v is string => Boolean(v))
    const ends = kids
      .map((k) => normalizeIsoDate(k.end_date))
      .filter((v): v is string => Boolean(v))

    const minStart = starts.length
      ? starts.reduce((a, b) => (dateToUtcMs(a) <= dateToUtcMs(b) ? a : b))
      : null
    const maxEnd = ends.length
      ? ends.reduce((a, b) => (dateToUtcMs(a) >= dateToUtcMs(b) ? a : b))
      : null

    const currentStart = normalizeIsoDate(parent.start_date)
    const currentEnd = normalizeIsoDate(parent.end_date)
    if (currentStart === minStart && currentEnd === maxEnd) continue

    const { error } = await supabase
      .schema("public")
      .from("tasks")
      .update({
        start_date: minStart,
        end_date: maxEnd,
      })
      .eq("id", parent.id)
      .eq("project_id", projectId)
    if (error) throw new Error(error.message)
  }
}

function toTaskRow(row: Record<string, unknown>): GanttTaskRow {
  const dependenciesRaw = row.dependency_ids
  const dependency_ids = Array.isArray(dependenciesRaw)
    ? dependenciesRaw.map((x) => String(x))
    : []

  return {
    id: String(row.id ?? ""),
    project_id: String(row.project_id ?? ""),
    parent_id:
      row.parent_id == null ? null : String(row.parent_id).trim() || null,
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
    estimated_cost: Number(row.estimated_cost ?? 0) || 0,
    actual_cost: Number(row.actual_cost ?? 0) || 0,
  }
}

export async function fetchProjectTasks(projectId: string): Promise<GanttTaskRow[]> {
  const pid = String(projectId ?? "").trim()
  if (!pid) return []

  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("tasks")
    .select(
      "id, project_id, parent_id, name, description, start_date, end_date, actual_start_date, actual_end_date, progress, dependency_ids, estimated_cost, actual_cost"
    )
    .eq("project_id", pid)
    .order("start_date", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<Record<string, unknown>>).map(toTaskRow)
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

  const currentStart = normalizeIsoDate(target.start_date)
  const deltaDays =
    currentStart && nextStart
      ? Math.round((dateToUtcMs(nextStart) - dateToUtcMs(currentStart)) / (24 * 60 * 60 * 1000))
      : 0

  const updates = new Map<string, { start_date: string | null; end_date: string | null }>()
  updates.set(taskId, { start_date: nextStart, end_date: nextEnd })

  if (deltaDays !== 0) {
    const queue: string[] = [taskId]
    const visited = new Set<string>([taskId])

    while (queue.length > 0) {
      const currentId = queue.shift() as string
      const dependents = tasks.filter((t) => t.dependency_ids.includes(currentId))

      for (const dep of dependents) {
        if (visited.has(dep.id)) continue
        visited.add(dep.id)
        queue.push(dep.id)

        const shiftedStart = dep.start_date
          ? shiftIsoDate(dep.start_date, deltaDays)
          : null
        const shiftedEnd = dep.end_date ? shiftIsoDate(dep.end_date, deltaDays) : null
        updates.set(dep.id, { start_date: shiftedStart, end_date: shiftedEnd })
      }
    }
  }

  for (const [id, value] of updates.entries()) {
    const { error } = await supabase
      .schema("public")
      .from("tasks")
      .update({
        start_date: value.start_date,
        end_date: value.end_date,
      })
      .eq("id", id)
      .eq("project_id", projectId)
    if (error) throw new Error(error.message)
  }
  await recalculateParentTaskDates(supabase, projectId)

  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath("/marker-ofek/execution")

  return {
    updatedTaskIds: [...updates.keys()],
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
  const { error } = await supabase
    .schema("public")
    .from("tasks")
    .update({
      name,
      start_date: startDate,
      end_date: endDate,
      progress,
    })
    .eq("id", taskId)
    .eq("project_id", projectId)
  if (error) throw new Error(error.message)
  await recalculateParentTaskDates(supabase, projectId)
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
  const { data, error } = await supabase
    .schema("public")
    .from("tasks")
    .insert({
      project_id: projectId,
      parent_id: parentId || null,
      name,
      description: description || null,
      start_date: startDate,
      end_date: endDate,
      progress,
      estimated_cost: estimatedCost,
      actual_cost: actualCost,
    })
    .select("id")
    .single()

  if (error || !data?.id) {
    throw new Error(error?.message ?? "יצירת משימה נכשלה")
  }
  await recalculateParentTaskDates(supabase, projectId)

  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath("/marker-ofek/execution")
  return { id: String(data.id) }
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

  await recalculateParentTaskDates(supabase, projectId)
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath("/marker-ofek/execution")
  return { parentId: String(parent.id) }
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
      .select("id, task_id, resource_id, project_id, tasks!inner ( name, start_date, end_date )")
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
    return {
      id: String((row as { id?: unknown }).id ?? ""),
      task_id: String((row as { task_id?: unknown }).task_id ?? ""),
      resource_id: String((row as { resource_id?: unknown }).resource_id ?? ""),
      project_id: String((row as { project_id?: unknown }).project_id ?? ""),
      task_name: String(task.name ?? "").trim(),
      start_date: task.start_date ? String(task.start_date) : null,
      end_date: task.end_date ? String(task.end_date) : null,
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
      })
    if (error) throw new Error(error.message)
  }
  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
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
    .select("start_date, end_date, actual_start_date")
    .eq("id", taskId)
    .eq("project_id", projectId)
    .maybeSingle()
  if (taskErr || !taskRow) throw new Error(taskErr?.message ?? "המשימה לא נמצאה")

  const startDate = String(taskRow.start_date ?? "").trim() || today
  const endDate = String(taskRow.end_date ?? "").trim() || today
  const finalEnd = dateToUtcMs(endDate) < dateToUtcMs(today) ? today : endDate

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
      .select("title, document_kind, mime_type")
      .eq("project_id", projectIdTrim)
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
  await recalculateParentTaskDates(supabase, projectIdTrim)
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

  return {
    taskCount: tasks.length,
    plannedCost,
    actualCost,
    variance,
    variancePercent,
    status: variance > 0 ? "over" : variance < 0 ? "under" : "on_track",
    perTask,
  }
}
