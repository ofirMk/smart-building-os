"use server"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type {
  CreateGanttTaskInput,
  GanttDependencyType,
  GanttScheduleMode,
  GanttTask,
  GanttTaskDependency,
  GanttTaskResource,
  UpdateGanttTaskInput,
} from "@/types/gantt"

const DEPENDENCY_TYPES: GanttDependencyType[] = ["FS", "SS", "FF", "SF"]

function normalizeDate(value: unknown): string | null {
  const normalized = String(value ?? "").trim()
  return normalized || null
}

function normalizeProgress(value: unknown): number {
  return Math.max(0, Math.min(100, Math.round(Number(value ?? 0) || 0)))
}

function normalizeParentId(value: unknown): string | null {
  const normalized = String(value ?? "").trim()
  return normalized || null
}

function normalizeScheduleMode(value: unknown): GanttScheduleMode {
  const mode = String(value ?? "auto").trim().toLowerCase()
  return mode === "manual" ? "manual" : "auto"
}

function normalizeConstraintType(value: unknown): string | null {
  const normalized = String(value ?? "").trim()
  return normalized || null
}

function normalizeDependencyType(value: unknown): GanttDependencyType {
  const normalized = String(value ?? "FS").trim().toUpperCase() as GanttDependencyType
  return DEPENDENCY_TYPES.includes(normalized) ? normalized : "FS"
}

function normalizeDependencies(value: unknown): GanttTaskDependency[] {
  if (!Array.isArray(value)) return []
  const mapped = value
    .map((item) => {
      if (typeof item === "string") {
        const taskId = item.trim()
        if (!taskId) return null
        return { taskId, type: "FS", lag: 0 } satisfies GanttTaskDependency
      }
      if (!item || typeof item !== "object" || Array.isArray(item)) return null

      const row = item as Record<string, unknown>
      const taskId = String(row.taskId ?? "").trim()
      if (!taskId) return null
      return {
        taskId,
        type: normalizeDependencyType(row.type),
        lag: Math.round(Number(row.lag ?? 0) || 0),
      } satisfies GanttTaskDependency
    })
    .filter((item): item is GanttTaskDependency => Boolean(item))

  const dedup = new Map<string, GanttTaskDependency>()
  for (const dep of mapped) {
    dedup.set(`${dep.taskId}:${dep.type}:${dep.lag}`, dep)
  }
  return [...dedup.values()]
}

function normalizeResources(value: unknown): GanttTaskResource[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null
      const row = item as Record<string, unknown>
      const allocationRaw = row.allocation
      const allocation =
        allocationRaw == null || allocationRaw === ""
          ? undefined
          : Number.isFinite(Number(allocationRaw))
            ? Number(allocationRaw)
            : undefined
      return {
        resourceId: String(row.resourceId ?? "").trim() || undefined,
        subcontractorId: String(row.subcontractorId ?? "").trim() || undefined,
        label: String(row.label ?? "").trim() || undefined,
        role: String(row.role ?? "").trim() || undefined,
        allocation,
      } satisfies GanttTaskResource
    })
    .filter((item): item is GanttTaskResource => Boolean(item))
}

function validateDateOrder(startDate: string | null, endDate: string | null): void {
  if (startDate && endDate && Date.parse(startDate) > Date.parse(endDate)) {
    throw new Error("start_date must be earlier than or equal to end_date")
  }
}

function validateMilestoneDates(
  isMilestone: boolean,
  startDate: string | null,
  endDate: string | null
): void {
  if (isMilestone && startDate && endDate && startDate !== endDate) {
    throw new Error("Milestone tasks must have the same start_date and end_date")
  }
}

function toGanttTask(row: Record<string, unknown>): GanttTask {
  return {
    id: String(row.id ?? ""),
    project_id: String(row.project_id ?? ""),
    parent_id: normalizeParentId(row.parent_id),
    title: String(row.title ?? "").trim(),
    phase: String(row.phase ?? "").trim(),
    start_date: normalizeDate(row.start_date),
    end_date: normalizeDate(row.end_date),
    progress: normalizeProgress(Number(row.progress ?? 0)),
    status: String(row.status ?? "Not Started").trim() || "Not Started",
    is_milestone: Boolean(row.is_milestone),
    schedule_mode: normalizeScheduleMode(row.schedule_mode),
    dependencies: normalizeDependencies(row.dependencies),
    resources: normalizeResources(row.resources),
    constraint_type: normalizeConstraintType(row.constraint_type),
    constraint_date: normalizeDate(row.constraint_date),
    created_at: String(row.created_at ?? ""),
  }
}

const GANTT_SELECT =
  "id, project_id, parent_id, title, phase, start_date, end_date, progress, status, is_milestone, schedule_mode, dependencies, resources, constraint_type, constraint_date, created_at"

export async function fetchTasks(projectId: string): Promise<GanttTask[]> {
  const pid = String(projectId ?? "").trim()
  if (!pid) return []

  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("gantt_tasks")
    .select(GANTT_SELECT)
    .eq("project_id", pid)
    .order("parent_id", { ascending: true, nullsFirst: true })
    .order("start_date", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<Record<string, unknown>>).map(toGanttTask)
}

export async function createTask(taskData: CreateGanttTaskInput): Promise<GanttTask> {
  const project_id = String(taskData.project_id ?? "").trim()
  const parent_id = normalizeParentId(taskData.parent_id)
  const title = String(taskData.title ?? "").trim()
  const phase = String(taskData.phase ?? "").trim()
  const start_date = normalizeDate(taskData.start_date)
  const end_date = normalizeDate(taskData.end_date)
  const progress = normalizeProgress(taskData.progress)
  const status = String(taskData.status ?? "Not Started").trim() || "Not Started"
  const is_milestone = Boolean(taskData.is_milestone)
  const schedule_mode = normalizeScheduleMode(taskData.schedule_mode)
  const dependencies = normalizeDependencies(taskData.dependencies)
  const resources = normalizeResources(taskData.resources)
  const constraint_type = normalizeConstraintType(taskData.constraint_type)
  const constraint_date = normalizeDate(taskData.constraint_date)

  if (!project_id) throw new Error("project_id is required")
  if (!title) throw new Error("title is required")
  if (!phase) throw new Error("phase is required")

  validateDateOrder(start_date, end_date)
  validateMilestoneDates(is_milestone, start_date, end_date)
  if (constraint_date && Number.isNaN(Date.parse(constraint_date))) {
    throw new Error("constraint_date must be a valid date")
  }

  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("gantt_tasks")
    .insert({
      project_id,
      parent_id,
      title,
      phase,
      start_date,
      end_date,
      progress,
      status,
      is_milestone,
      schedule_mode,
      dependencies,
      resources,
      constraint_type,
      constraint_date,
    })
    .select(GANTT_SELECT)
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create gantt task")
  }

  return toGanttTask(data as Record<string, unknown>)
}

export async function updateTask(taskId: string, updateData: UpdateGanttTaskInput): Promise<GanttTask> {
  const id = String(taskId ?? "").trim()
  if (!id) throw new Error("taskId is required")

  const patch: Record<string, unknown> = {}

  if (updateData.title !== undefined) {
    const title = String(updateData.title ?? "").trim()
    if (!title) throw new Error("title cannot be empty")
    patch.title = title
  }

  if (updateData.phase !== undefined) {
    const phase = String(updateData.phase ?? "").trim()
    if (!phase) throw new Error("phase cannot be empty")
    patch.phase = phase
  }

  if (updateData.parent_id !== undefined) patch.parent_id = normalizeParentId(updateData.parent_id)
  if (updateData.start_date !== undefined) patch.start_date = normalizeDate(updateData.start_date)
  if (updateData.end_date !== undefined) patch.end_date = normalizeDate(updateData.end_date)
  if (updateData.progress !== undefined) patch.progress = normalizeProgress(updateData.progress)

  if (updateData.status !== undefined) {
    const status = String(updateData.status ?? "").trim()
    patch.status = status || "Not Started"
  }

  if (updateData.dependencies !== undefined) {
    patch.dependencies = normalizeDependencies(updateData.dependencies)
  }

  if (updateData.resources !== undefined) {
    patch.resources = normalizeResources(updateData.resources)
  }

  if (updateData.is_milestone !== undefined) {
    patch.is_milestone = Boolean(updateData.is_milestone)
  }

  if (updateData.schedule_mode !== undefined) {
    patch.schedule_mode = normalizeScheduleMode(updateData.schedule_mode)
  }

  if (updateData.constraint_type !== undefined) {
    patch.constraint_type = normalizeConstraintType(updateData.constraint_type)
  }

  if (updateData.constraint_date !== undefined) {
    const constraintDate = normalizeDate(updateData.constraint_date)
    if (constraintDate && Number.isNaN(Date.parse(constraintDate))) {
      throw new Error("constraint_date must be a valid date")
    }
    patch.constraint_date = constraintDate
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("No valid fields were provided for update")
  }

  const startDate =
    patch.start_date !== undefined ? (patch.start_date as string | null) : undefined
  const endDate = patch.end_date !== undefined ? (patch.end_date as string | null) : undefined
  if (startDate !== undefined && endDate !== undefined) {
    validateDateOrder(startDate, endDate)
  }
  const isMilestone =
    patch.is_milestone !== undefined ? Boolean(patch.is_milestone) : undefined
  if (isMilestone !== undefined && startDate !== undefined && endDate !== undefined) {
    validateMilestoneDates(isMilestone, startDate, endDate)
  }

  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("gantt_tasks")
    .update(patch)
    .eq("id", id)
    .select(GANTT_SELECT)
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update gantt task")
  }

  return toGanttTask(data as Record<string, unknown>)
}

export async function deleteTask(taskId: string): Promise<{ ok: true; id: string }> {
  const id = String(taskId ?? "").trim()
  if (!id) throw new Error("taskId is required")

  const supabase = await createSupabaseServerAuthClient()
  const { error } = await supabase
    .schema("public")
    .from("gantt_tasks")
    .delete()
    .eq("id", id)

  if (error) throw new Error(error.message)
  return { ok: true, id }
}
