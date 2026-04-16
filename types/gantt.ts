export type GanttDependencyType = "FS" | "SS" | "FF" | "SF"

export interface GanttTaskDependency {
  taskId: string
  type: GanttDependencyType
  lag: number
}

export interface GanttTaskResource {
  resourceId?: string
  subcontractorId?: string
  label?: string
  role?: string
  allocation?: number
}

export type GanttScheduleMode = "auto" | "manual"

/** A Gantt board (schedule) under a project — MS Project multi-chart model. */
export interface GanttRecord {
  id: string
  project_id: string
  name: string
  status: string
  created_at: string
}

export interface GanttTask {
  id: string
  project_id: string
  gantt_id: string
  parent_id: string | null
  title: string
  phase: string
  start_date: string | null
  end_date: string | null
  progress: number
  status: string
  is_milestone: boolean
  schedule_mode: GanttScheduleMode
  dependencies: GanttTaskDependency[]
  resources: GanttTaskResource[]
  cost: number
  baseline_start: string | null
  baseline_end: string | null
  actual_start: string | null
  actual_end: string | null
  constraint_type: string | null
  constraint_date: string | null
  /** Delay / claims documentation (free text). */
  notes: string | null
  created_at: string
}

export interface CreateGanttTaskInput {
  project_id: string
  gantt_id: string
  parent_id?: string | null
  title: string
  phase: string
  start_date?: string | null
  end_date?: string | null
  progress?: number
  status?: string
  is_milestone?: boolean
  schedule_mode?: GanttScheduleMode
  dependencies?: GanttTaskDependency[]
  resources?: GanttTaskResource[]
  cost?: number
  baseline_start?: string | null
  baseline_end?: string | null
  actual_start?: string | null
  actual_end?: string | null
  constraint_type?: string | null
  constraint_date?: string | null
  notes?: string | null
}

export interface UpdateGanttTaskInput {
  parent_id?: string | null
  title?: string
  phase?: string
  start_date?: string | null
  end_date?: string | null
  progress?: number
  status?: string
  is_milestone?: boolean
  schedule_mode?: GanttScheduleMode
  dependencies?: GanttTaskDependency[]
  resources?: GanttTaskResource[]
  cost?: number
  baseline_start?: string | null
  baseline_end?: string | null
  actual_start?: string | null
  actual_end?: string | null
  constraint_type?: string | null
  constraint_date?: string | null
  notes?: string | null
}

/** Persisted schedule snapshot (versioning). */
export interface GanttSnapshotRow {
  id: string
  project_id: string
  gantt_id: string
  /** Canonical snapshot name (new contract). */
  name: string
  /** Canonical snapshot type (new contract). */
  type: "UPDATE" | "RECOVERY" | "CHANGE_ORDER"
  /** Backward-compatible aliases used by legacy UI callers. */
  snapshot_name: string
  snapshot_type: "UPDATE" | "RECOVERY" | "CHANGE_ORDER"
  tasks_data: unknown
  created_at: string
}
