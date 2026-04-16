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

export interface GanttTask {
  id: string
  project_id: string
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
  constraint_type: string | null
  constraint_date: string | null
  created_at: string
}

export interface CreateGanttTaskInput {
  project_id: string
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
  constraint_type?: string | null
  constraint_date?: string | null
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
  constraint_type?: string | null
  constraint_date?: string | null
}
