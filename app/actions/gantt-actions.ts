"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type {
  CreateGanttTaskInput,
  GanttDependencyType,
  GanttRecord,
  GanttScheduleMode,
  GanttSnapshotRow,
  GanttTask,
  GanttTaskDependency,
  GanttTaskResource,
  UpdateGanttTaskInput,
} from "@/types/gantt"

const DEPENDENCY_TYPES: GanttDependencyType[] = ["FS", "SS", "FF", "SF"]

const dateOrNullSchema = z
  .union([z.string(), z.date(), z.null(), z.undefined()])
  .transform((value) => normalizeDate(value))

const createTaskSchema = z.object({
  project_id: z.string().trim().min(1, "project_id is required"),
  gantt_id: z.string().trim().min(1, "gantt_id is required"),
  parent_id: z.string().trim().nullable().optional(),
  title: z.string().trim().min(1, "title is required"),
  phase: z.string().trim().min(1, "phase is required"),
  start_date: dateOrNullSchema.optional(),
  end_date: dateOrNullSchema.optional(),
  progress: z.coerce.number().optional(),
  status: z.string().optional(),
  is_milestone: z.boolean().optional(),
  schedule_mode: z.enum(["auto", "manual"]).optional(),
  dependencies: z.unknown().optional(),
  resources: z.unknown().optional(),
  cost: z.coerce.number().optional(),
  baseline_start: dateOrNullSchema.optional(),
  baseline_end: dateOrNullSchema.optional(),
  actual_start: dateOrNullSchema.optional(),
  actual_end: dateOrNullSchema.optional(),
  constraint_type: z.string().nullable().optional(),
  constraint_date: dateOrNullSchema.optional(),
  notes: z.union([z.string(), z.null()]).optional(),
})

const updateTaskSchema = z
  .object({
    parent_id: z.string().trim().nullable().optional(),
    title: z.string().optional(),
    phase: z.string().optional(),
    start_date: dateOrNullSchema.optional(),
    end_date: dateOrNullSchema.optional(),
    progress: z.coerce.number().optional(),
    status: z.string().optional(),
    is_milestone: z.boolean().optional(),
    schedule_mode: z.enum(["auto", "manual"]).optional(),
    dependencies: z.unknown().optional(),
    resources: z.unknown().optional(),
    cost: z.coerce.number().optional(),
    baseline_start: dateOrNullSchema.optional(),
    baseline_end: dateOrNullSchema.optional(),
    actual_start: dateOrNullSchema.optional(),
    actual_end: dateOrNullSchema.optional(),
    constraint_type: z.string().nullable().optional(),
    constraint_date: dateOrNullSchema.optional(),
    notes: z.union([z.string(), z.null()]).optional(),
  })
  .partial()

function normalizeDate(value: unknown): string | null {
  const normalized = String(value ?? "").trim()
  if (!normalized) return null
  const parsed = new Date(normalized)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }
  return normalized
}

function normalizeProgress(value: unknown): number {
  return Math.max(0, Math.min(100, Math.round(Number(value ?? 0) || 0)))
}

function normalizeCost(value: unknown): number {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Number(numeric.toFixed(2)))
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

function normalizeNotes(value: unknown): string | null {
  const s = String(value ?? "").trim()
  return s.length > 0 ? s : null
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
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((label) => ({ label }))
  }
  if (!Array.isArray(value)) return []
  const out: GanttTaskResource[] = []
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const allocationRaw = row.allocation
    const allocation =
      allocationRaw == null || allocationRaw === ""
        ? undefined
        : Number.isFinite(Number(allocationRaw))
          ? Number(allocationRaw)
          : undefined
    out.push({
      resourceId: String(row.resourceId ?? "").trim() || undefined,
      subcontractorId: String(row.subcontractorId ?? "").trim() || undefined,
      label: String(row.label ?? "").trim() || undefined,
      role: String(row.role ?? "").trim() || undefined,
      allocation,
    })
  }
  return out
}

function normalizeResourcesText(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .join(", ")
    return normalized || null
  }

  const normalized = normalizeResources(value)
    .map((item) => item.label || item.role || item.resourceId || item.subcontractorId || "")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ")
  return normalized || null
}

function toTimestampStartOfDay(value: unknown): string | null {
  const normalized = normalizeDate(value)
  return normalized ? new Date(`${normalized}T00:00:00.000Z`).toISOString() : null
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
    gantt_id: String(row.gantt_id ?? ""),
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
    cost: normalizeCost(row.cost),
    baseline_start: normalizeDate(row.baseline_start),
    baseline_end: normalizeDate(row.baseline_end),
    actual_start: normalizeDate(row.actual_start),
    actual_end: normalizeDate(row.actual_end),
    constraint_type: normalizeConstraintType(row.constraint_type),
    constraint_date: normalizeDate(row.constraint_date),
    notes: normalizeNotes(row.notes),
    created_at: String(row.created_at ?? ""),
  }
}

const GANTT_SELECT =
  "id, project_id, gantt_id, parent_id, title, phase, start_date, end_date, progress, status, is_milestone, schedule_mode, dependencies, resources, cost, baseline_start, baseline_end, actual_start, actual_end, constraint_type, constraint_date, notes, created_at"

function toGanttRecord(row: Record<string, unknown>): GanttRecord {
  return {
    id: String(row.id ?? ""),
    project_id: String(row.project_id ?? ""),
    name: String(row.name ?? "").trim(),
    status: String(row.status ?? "active").trim() || "active",
    created_at: String(row.created_at ?? ""),
  }
}

export async function fetchGanttById(ganttId: string): Promise<GanttRecord | null> {
  const gid = String(ganttId ?? "").trim()
  if (!gid) return null

  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("gantts")
    .select("id, project_id, name, status, created_at")
    .eq("id", gid)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  return toGanttRecord(data as Record<string, unknown>)
}

export async function fetchGanttsByProject(projectId: string): Promise<GanttRecord[]> {
  const pid = String(projectId ?? "").trim()
  if (!pid) return []

  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("gantts")
    .select("id, project_id, name, status, created_at")
    .eq("project_id", pid)
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<Record<string, unknown>>).map(toGanttRecord)
}

export async function fetchAllGantts(): Promise<GanttRecord[]> {
  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("gantts")
    .select("id, project_id, name, status, created_at")
    .order("created_at", { ascending: false })

  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<Record<string, unknown>>).map(toGanttRecord)
}

export type GanttManagementRow = GanttRecord & { project_name: string }

export async function fetchGanttManagementList(): Promise<GanttManagementRow[]> {
  const supabase = await createSupabaseServerAuthClient()
  const { data: gantts, error } = await supabase
    .schema("public")
    .from("gantts")
    .select("id, project_id, name, status, created_at")
    .order("created_at", { ascending: false })

  if (error) throw new Error(error.message)
  const rows = (gantts ?? []) as Array<Record<string, unknown>>
  if (rows.length === 0) return []

  const projectIds = [...new Set(rows.map((r) => String(r.project_id ?? "")).filter(Boolean))]
  const { data: projects, error: pErr } = await supabase
    .schema("public")
    .from("projects")
    .select("id, name")
    .in("id", projectIds)

  if (pErr) throw new Error(pErr.message)
  const nameById = new Map(
    ((projects ?? []) as { id: string; name: string }[]).map((p) => [
      p.id,
      String(p.name ?? "").trim() || "פרויקט",
    ])
  )

  return rows.map((row) => {
    const base = toGanttRecord(row)
    const project_name = nameById.get(base.project_id) ?? "פרויקט"
    return { ...base, project_name }
  })
}

export async function fetchActiveProjectsForGantt(): Promise<{ id: string; name: string }[]> {
  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("projects")
    .select("id, name")
    .eq("is_deleted", false)
    .order("name", { ascending: true })

  if (error) throw new Error(error.message)
  return ((data ?? []) as { id: string; name: string }[]).map((row) => ({
    id: String(row.id ?? ""),
    name: String(row.name ?? "").trim() || "ללא שם",
  }))
}

const createGanttInputSchema = z.object({
  project_id: z.string().trim().min(1),
  name: z.string().trim().min(1, "נדרש שם לגאנט"),
  status: z.string().trim().optional(),
})

export async function createGantt(
  projectIdOrInput: string | z.infer<typeof createGanttInputSchema>,
  nameArg?: string
): Promise<GanttRecord> {
  const parsed = createGanttInputSchema.parse(
    typeof projectIdOrInput === "string"
      ? { project_id: projectIdOrInput, name: String(nameArg ?? "") }
      : projectIdOrInput
  )
  const status = String(parsed.status ?? "active").trim() || "active"

  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("gantts")
    .insert({
      project_id: parsed.project_id,
      name: parsed.name,
      status,
    })
    .select("id, project_id, name, status, created_at")
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create gantt")
  }

  const record = toGanttRecord(data as Record<string, unknown>)
  revalidatePath("/marker-ofek/projects/gantt")
  revalidatePath(`/marker-ofek/projects/gantt/${record.id}`)
  revalidatePath(`/marker-ofek/projects/${parsed.project_id}`)
  return record
}

export async function fetchGantts(projectId: string): Promise<GanttRecord[]> {
  return fetchGanttsByProject(projectId)
}

export async function fetchTasks(ganttId: string): Promise<GanttTask[]> {
  const gid = String(ganttId ?? "").trim()
  if (!gid) return []

  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("gantt_tasks")
    .select(GANTT_SELECT)
    .eq("gantt_id", gid)
    .order("parent_id", { ascending: true, nullsFirst: true })
    .order("start_date", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<Record<string, unknown>>).map(toGanttTask)
}

export async function createTask(taskData: CreateGanttTaskInput): Promise<GanttTask> {
  const parsed = createTaskSchema.parse(taskData)
  const project_id = String(parsed.project_id ?? "").trim()
  const gantt_id = String(parsed.gantt_id ?? "").trim()
  const parent_id = normalizeParentId(parsed.parent_id)
  const title = String(parsed.title ?? "").trim()
  const phase = String(parsed.phase ?? "").trim()
  const start_date = normalizeDate(parsed.start_date)
  const end_date = normalizeDate(parsed.end_date)
  const progress = normalizeProgress(parsed.progress)
  const status = String(parsed.status ?? "Not Started").trim() || "Not Started"
  const is_milestone = Boolean(parsed.is_milestone)
  const schedule_mode = normalizeScheduleMode(parsed.schedule_mode)
  const dependencies = normalizeDependencies(parsed.dependencies)
  const resources = normalizeResourcesText(parsed.resources)
  const cost = normalizeCost(parsed.cost)
  const baseline_start = toTimestampStartOfDay(parsed.baseline_start)
  const baseline_end = toTimestampStartOfDay(parsed.baseline_end)
  const actual_start = toTimestampStartOfDay(parsed.actual_start)
  const actual_end = toTimestampStartOfDay(parsed.actual_end)
  const constraint_type = normalizeConstraintType(parsed.constraint_type)
  const constraint_date = normalizeDate(parsed.constraint_date)
  const notes = normalizeNotes(parsed.notes)

  if (!project_id) throw new Error("project_id is required")
  if (!gantt_id) throw new Error("gantt_id is required")
  if (!title) throw new Error("title is required")
  if (!phase) throw new Error("phase is required")

  const supabase = await createSupabaseServerAuthClient()
  const { data: ganttRow, error: ganttErr } = await supabase
    .schema("public")
    .from("gantts")
    .select("id, project_id")
    .eq("id", gantt_id)
    .maybeSingle()

  if (ganttErr) throw new Error(ganttErr.message)
  if (!ganttRow || String((ganttRow as { project_id: string }).project_id) !== project_id) {
    throw new Error("gantt_id does not match project")
  }

  validateDateOrder(start_date, end_date)
  validateDateOrder(normalizeDate(baseline_start), normalizeDate(baseline_end))
  validateDateOrder(normalizeDate(actual_start), normalizeDate(actual_end))
  validateMilestoneDates(is_milestone, start_date, end_date)
  if (constraint_date && Number.isNaN(Date.parse(constraint_date))) {
    throw new Error("constraint_date must be a valid date")
  }

  const { data, error } = await supabase
    .schema("public")
    .from("gantt_tasks")
    .insert({
      project_id,
      gantt_id,
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
      cost,
      baseline_start,
      baseline_end,
      actual_start,
      actual_end,
      constraint_type,
      constraint_date,
      notes,
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
  const parsed = updateTaskSchema.parse(updateData)

  const patch: Record<string, unknown> = {}

  if (parsed.title !== undefined) {
    const title = String(parsed.title ?? "").trim()
    if (!title) throw new Error("title cannot be empty")
    patch.title = title
  }

  if (parsed.phase !== undefined) {
    const phase = String(parsed.phase ?? "").trim()
    if (!phase) throw new Error("phase cannot be empty")
    patch.phase = phase
  }

  if (parsed.parent_id !== undefined) patch.parent_id = normalizeParentId(parsed.parent_id)
  if (parsed.start_date !== undefined) patch.start_date = normalizeDate(parsed.start_date)
  if (parsed.end_date !== undefined) patch.end_date = normalizeDate(parsed.end_date)
  if (parsed.progress !== undefined) patch.progress = normalizeProgress(parsed.progress)

  if (parsed.status !== undefined) {
    const status = String(parsed.status ?? "").trim()
    patch.status = status || "Not Started"
  }

  if (parsed.dependencies !== undefined) {
    patch.dependencies = normalizeDependencies(parsed.dependencies)
  }

  if (parsed.resources !== undefined) {
    patch.resources = normalizeResourcesText(parsed.resources)
  }

  if (parsed.cost !== undefined) {
    patch.cost = normalizeCost(parsed.cost)
  }

  if (parsed.baseline_start !== undefined) {
    patch.baseline_start = toTimestampStartOfDay(parsed.baseline_start)
  }

  if (parsed.baseline_end !== undefined) {
    patch.baseline_end = toTimestampStartOfDay(parsed.baseline_end)
  }

  if (parsed.actual_start !== undefined) {
    patch.actual_start = toTimestampStartOfDay(parsed.actual_start)
  }

  if (parsed.actual_end !== undefined) {
    patch.actual_end = toTimestampStartOfDay(parsed.actual_end)
  }

  if (parsed.is_milestone !== undefined) {
    patch.is_milestone = Boolean(parsed.is_milestone)
  }

  if (parsed.schedule_mode !== undefined) {
    patch.schedule_mode = normalizeScheduleMode(parsed.schedule_mode)
  }

  if (parsed.constraint_type !== undefined) {
    patch.constraint_type = normalizeConstraintType(parsed.constraint_type)
  }

  if (parsed.constraint_date !== undefined) {
    const constraintDate = normalizeDate(parsed.constraint_date)
    if (constraintDate && Number.isNaN(Date.parse(constraintDate))) {
      throw new Error("constraint_date must be a valid date")
    }
    patch.constraint_date = constraintDate
  }

  if (parsed.notes !== undefined) {
    patch.notes = normalizeNotes(parsed.notes)
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

  const baselineStart =
    patch.baseline_start !== undefined ? normalizeDate(patch.baseline_start) : undefined
  const baselineEnd =
    patch.baseline_end !== undefined ? normalizeDate(patch.baseline_end) : undefined
  if (baselineStart !== undefined && baselineEnd !== undefined) {
    validateDateOrder(baselineStart, baselineEnd)
  }

  const actualStart =
    patch.actual_start !== undefined ? normalizeDate(patch.actual_start) : undefined
  const actualEnd =
    patch.actual_end !== undefined ? normalizeDate(patch.actual_end) : undefined
  if (actualStart !== undefined && actualEnd !== undefined) {
    validateDateOrder(actualStart, actualEnd)
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

export async function setGanttBaseline(ganttId: string): Promise<{ ok: true; updated: number }> {
  const gid = String(ganttId ?? "").trim()
  if (!gid) throw new Error("ganttId is required")

  const supabase = await createSupabaseServerAuthClient()
  const { data: ganttMeta } = await supabase
    .schema("public")
    .from("gantts")
    .select("project_id")
    .eq("id", gid)
    .maybeSingle()

  const projectId = String((ganttMeta as { project_id?: string } | null)?.project_id ?? "").trim()

  const { data, error } = await supabase
    .schema("public")
    .from("gantt_tasks")
    .select("id, start_date, end_date")
    .eq("gantt_id", gid)

  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<Record<string, unknown>>
  if (rows.length === 0) return { ok: true, updated: 0 }

  await Promise.all(
    rows.map(async (row) => {
      const baselineStart = toTimestampStartOfDay(row.start_date)
      const baselineEnd = toTimestampStartOfDay(row.end_date)
      const { error: updateError } = await supabase
        .schema("public")
        .from("gantt_tasks")
        .update({
          baseline_start: baselineStart,
          baseline_end: baselineEnd,
        })
        .eq("id", String(row.id ?? ""))
        .eq("gantt_id", gid)
      if (updateError) throw new Error(updateError.message)
    })
  )

  revalidatePath("/marker-ofek/projects/gantt")
  if (projectId) {
    revalidatePath(`/marker-ofek/projects/${projectId}`)
    revalidatePath(`/marker-ofek/projects/gantt/${gid}`)
  }
  return { ok: true, updated: rows.length }
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

const ganttSnapshotTypeSchema = z.enum(["UPDATE", "RECOVERY", "CHANGE_ORDER"])

const createSnapshotInputSchema = z.object({
  project_id: z.string().trim().min(1, "project_id is required"),
  name: z.string().trim().min(1, "name is required"),
  type: ganttSnapshotTypeSchema,
  current_tasks: z.array(z.unknown()),
})

const createGanttSnapshotInputSchema = z.object({
  gantt_id: z.string().trim().min(1),
  snapshot_name: z.string().trim().min(1, "נדרש שם לצילום המצב"),
  snapshot_type: ganttSnapshotTypeSchema,
})

function toGanttSnapshot(row: Record<string, unknown>): GanttSnapshotRow {
  const t = String(row.type ?? row.snapshot_type ?? "")
  const type: GanttSnapshotRow["snapshot_type"] =
    t === "UPDATE" || t === "RECOVERY" || t === "CHANGE_ORDER" ? t : "UPDATE"
  const name = String(row.name ?? row.snapshot_name ?? "").trim()
  return {
    id: String(row.id ?? ""),
    project_id: String(row.project_id ?? ""),
    gantt_id: String(row.gantt_id ?? ""),
    name,
    type,
    snapshot_name: name,
    snapshot_type: type,
    tasks_data: row.tasks_data,
    created_at: String(row.created_at ?? ""),
  }
}

async function resolveProjectGanttId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>,
  projectId: string
): Promise<string> {
  const pid = String(projectId ?? "").trim()
  if (!pid) throw new Error("project_id is required")

  const { data: existing, error: existingErr } = await supabase
    .schema("public")
    .from("gantts")
    .select("id")
    .eq("project_id", pid)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (existingErr) throw new Error(existingErr.message)
  if (existing?.id) return String(existing.id)

  const { data: created, error: createErr } = await supabase
    .schema("public")
    .from("gantts")
    .insert({ project_id: pid, name: "Main Schedule", status: "active" })
    .select("id")
    .single()
  if (createErr || !created?.id) {
    throw new Error(createErr?.message ?? "Failed to create default gantt")
  }
  return String(created.id)
}

export async function createSnapshot(
  projectId: string,
  name: string,
  type: GanttSnapshotRow["snapshot_type"],
  currentTasks: unknown[]
): Promise<GanttSnapshotRow> {
  const parsed = createSnapshotInputSchema.parse({
    project_id: projectId,
    name,
    type,
    current_tasks: currentTasks,
  })

  const supabase = await createSupabaseServerAuthClient()
  const ganttId = await resolveProjectGanttId(supabase, parsed.project_id)
  const tasks_data = JSON.parse(JSON.stringify(parsed.current_tasks))

  const { data, error } = await supabase
    .schema("public")
    .from("gantt_snapshots")
    .insert({
      project_id: parsed.project_id,
      gantt_id: ganttId,
      name: parsed.name,
      type: parsed.type,
      snapshot_name: parsed.name,
      snapshot_type: parsed.type,
      tasks_data,
    })
    .select("id, project_id, gantt_id, name, type, snapshot_name, snapshot_type, tasks_data, created_at")
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save snapshot")
  }

  revalidatePath("/marker-ofek/projects/gantt")
  revalidatePath(`/marker-ofek/projects/gantt/${ganttId}`)
  revalidatePath(`/marker-ofek/projects/${parsed.project_id}`)
  return toGanttSnapshot(data as Record<string, unknown>)
}

/** Saves the current Gantt task list as a versioned JSON snapshot (MS Project–style baseline history). */
export async function createGanttSnapshot(
  ganttId: string,
  snapshotName: string,
  snapshotType: GanttSnapshotRow["snapshot_type"]
): Promise<GanttSnapshotRow> {
  const parsed = createGanttSnapshotInputSchema.parse({
    gantt_id: ganttId,
    snapshot_name: snapshotName,
    snapshot_type: snapshotType,
  })

  const supabase = await createSupabaseServerAuthClient()
  const { data: ganttMeta, error: ganttErr } = await supabase
    .schema("public")
    .from("gantts")
    .select("id, project_id")
    .eq("id", parsed.gantt_id)
    .single()

  if (ganttErr || !ganttMeta) {
    throw new Error(ganttErr?.message ?? "Gantt not found")
  }

  const project_id = String((ganttMeta as { project_id: string }).project_id ?? "").trim()
  const tasks = await fetchTasks(parsed.gantt_id)
  return createSnapshot(project_id, parsed.snapshot_name, parsed.snapshot_type, tasks)
}

export async function fetchGanttSnapshots(ganttId: string): Promise<GanttSnapshotRow[]> {
  const gid = String(ganttId ?? "").trim()
  if (!gid) return []

  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("gantt_snapshots")
    .select("id, project_id, gantt_id, name, type, snapshot_name, snapshot_type, tasks_data, created_at")
    .eq("gantt_id", gid)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<Record<string, unknown>>).map(toGanttSnapshot)
}
