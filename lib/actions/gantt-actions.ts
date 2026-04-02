"use server"

import { revalidatePath } from "next/cache"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

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

function shiftIsoDate(isoDate: string, days: number): string {
  const ms = dateToUtcMs(isoDate)
  const shifted = new Date(ms + days * 24 * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 10)
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

  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath("/marker-ofek/execution")

  return {
    updatedTaskIds: [...updates.keys()],
    deltaDays,
  }
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

  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath("/marker-ofek/execution")
  return { id: String(data.id) }
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
