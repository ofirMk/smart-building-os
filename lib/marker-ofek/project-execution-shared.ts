import type {
  DailyLogEquipmentKind,
  DailyManpowerRole,
  SiteMediaFieldTag,
} from "@/types/marker-ofek"

export const DAILY_MANPOWER_ROLES: readonly DailyManpowerRole[] = [
  "project_manager",
  "team_lead",
  "certified_electrician",
  "assistant",
  "subcontractor_crew",
] as const

export const SITE_MEDIA_FIELD_TAGS: readonly SiteMediaFieldTag[] = [
  "before",
  "after",
  "obstacle",
  "inspection",
] as const

export const DAILY_LOG_EQUIPMENT_KINDS: readonly DailyLogEquipmentKind[] = [
  "scissor_lift",
  "generator",
] as const

export type ProjectSiteRow = {
  id: string
  project_id: string
  primary_contract_id: string | null
  display_name: string | null
  site_address: string | null
}

export type SiteMediaRow = {
  id: string
  project_id: string
  storage_path: string
  mime_type: string | null
  caption: string | null
  taken_at: string | null
  created_at: string
}

export type ProjectDailyLogRow = {
  id: string
  project_id: string
  log_date: string
  weather: string
  crew_count: number
  work_performed: string
  task_ids: string[]
  red_flags: string | null
  photo_paths: string[]
  created_at: string
}

export type ManpowerLineInput = {
  role: DailyManpowerRole
  count: number
  hours: number
  taskId: string | null
}

export type EquipmentLineInput = {
  kind: DailyLogEquipmentKind
  assetLabel?: string | null
  hours: number
  notes?: string | null
}
