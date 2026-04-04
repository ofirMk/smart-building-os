"use server"

import { revalidatePath } from "next/cache"
import { format, subDays } from "date-fns"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type {
  DailyLogEquipmentKind,
  DailyManpowerRole,
  SiteMediaFieldTag,
} from "@/types/marker-ofek"
import { formatError } from "@/lib/utils"

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

const MANPOWER_ROLE_SET = new Set<string>(DAILY_MANPOWER_ROLES)
const FIELD_TAG_SET = new Set<string>(SITE_MEDIA_FIELD_TAGS)
const EQUIP_KIND_SET = new Set<string>(DAILY_LOG_EQUIPMENT_KINDS)

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

/** יוצר/מעדכן אתר ביצוע; אופציונלי: קישור חוזה ראשי זוכה (אותו פרויקט). */
export async function upsertProjectSite(params: {
  projectId: string
  primaryContractId?: string | null
  displayName?: string | null
  siteAddress?: string | null
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const projectId = params.projectId?.trim()
  if (!projectId) return { ok: false, error: "חסר פרויקט" }
  try {
    const supabase = await createSupabaseServerAuthClient()
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (params.primaryContractId !== undefined) {
      updatePayload.primary_contract_id = params.primaryContractId?.trim() || null
    }
    if (params.displayName !== undefined) {
      updatePayload.display_name = params.displayName?.trim() || null
    }
    if (params.siteAddress !== undefined) {
      updatePayload.site_address = params.siteAddress?.trim() || null
    }

    const { data: existing } = await supabase
      .from("project_sites")
      .select("id")
      .eq("project_id", projectId)
      .maybeSingle()

    if (existing?.id) {
      const { error } = await supabase
        .from("project_sites")
        .update(updatePayload)
        .eq("id", (existing as { id: string }).id)
      if (error) throw error
      revalidatePath(`/marker-ofek/projects/${projectId}`)
      return { ok: true, id: (existing as { id: string }).id }
    }

    const { data: ins, error: insErr } = await supabase
      .from("project_sites")
      .insert({
        project_id: projectId,
        primary_contract_id:
          params.primaryContractId !== undefined
            ? params.primaryContractId?.trim() || null
            : null,
        display_name:
          params.displayName !== undefined ? params.displayName?.trim() || null : null,
        site_address:
          params.siteAddress !== undefined ? params.siteAddress?.trim() || null : null,
      })
      .select("id")
      .single()
    if (insErr) throw insErr
    revalidatePath(`/marker-ofek/projects/${projectId}`)
    return { ok: true, id: (ins as { id: string }).id }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function ensureProjectSiteForProject(projectId: string): Promise<void> {
  const id = projectId?.trim()
  if (!id) return
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data: site } = await supabase.from("project_sites").select("id").eq("project_id", id).maybeSingle()
    if (site) return
    const { data: mainContract } = await supabase
      .from("contracts")
      .select("id")
      .eq("project_id", id)
      .eq("is_deleted", false)
      .eq("contract_type", "main_contract")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const cid = (mainContract as { id?: string } | null)?.id ?? null
    await upsertProjectSite({
      projectId: id,
      primaryContractId: cid,
    })
  } catch {
    /* non-fatal */
  }
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

export async function fetchProjectSiteId(projectId: string): Promise<string | null> {
  const id = projectId?.trim()
  if (!id) return null
  try {
    await ensureProjectSiteForProject(id)
    const supabase = await createSupabaseServerAuthClient()
    const { data } = await supabase.from("project_sites").select("id").eq("project_id", id).maybeSingle()
    return (data as { id?: string } | null)?.id?.trim() || null
  } catch {
    return null
  }
}

/** שורות כוח אדם מהיום הקודם (אותו פרויקט) — להעתקה מהירה בשטח. */
export async function fetchPreviousDayManpowerDraft(
  projectId: string,
  logDateIso: string
): Promise<
  | { ok: true; lines: ManpowerLineInput[] }
  | { ok: false; error: string }
> {
  const pid = projectId?.trim()
  const d = logDateIso?.trim()
  if (!pid || !d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return { ok: false, error: "תאריך או פרויקט לא תקינים" }
  }
  try {
    const supabase = await createSupabaseServerAuthClient()
    const prev = format(subDays(new Date(`${d}T12:00:00`), 1), "yyyy-MM-dd")
    const { data: logs } = await supabase
      .from("project_daily_logs")
      .select("id")
      .eq("project_id", pid)
      .eq("log_date", prev)
      .order("created_at", { ascending: false })
      .limit(1)
    const logId = (logs as { id?: string }[] | null)?.[0]?.id
    if (!logId) return { ok: true, lines: [] }

    const { data: rows, error } = await supabase
      .from("daily_manpower")
      .select("role, count, hours, task_id")
      .eq("project_daily_log_id", logId)
      .order("created_at", { ascending: true })
    if (error) throw error

    const lines: ManpowerLineInput[] = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      role: r.role as DailyManpowerRole,
      count: Math.max(1, Math.floor(Number(r.count) || 1)),
      hours: Math.max(0, Number(r.hours) || 0),
      taskId: r.task_id ? String(r.task_id) : null,
    }))
    return { ok: true, lines }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/** יומן מלא: לוג + daily_manpower + ציוד כבד (תמונות נרשמות בנפרד עם daily_log_id). */
export async function submitProjectDailyLogBundle(input: {
  projectId: string
  siteId: string
  logDate?: string
  weather: string
  workPerformed: string
  taskIds: string[]
  redFlags?: string | null
  photoPaths: string[]
  manpower: ManpowerLineInput[]
  equipment: EquipmentLineInput[]
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const projectId = input.projectId?.trim()
  const siteId = input.siteId?.trim()
  if (!projectId || !siteId) return { ok: false, error: "חסר פרויקט או אתר" }
  const work = input.workPerformed?.trim() ?? ""
  if (!work) return { ok: false, error: "נא לתאר את ביצוע העבודה" }
  const weather = input.weather?.trim() || "sunny"
  const allowed = new Set(["sunny", "cloudy", "rain", "heat_wind", "other"])
  if (!allowed.has(weather)) return { ok: false, error: "מזג אוויר לא תקין" }

  const manpower = input.manpower ?? []
  if (manpower.length === 0) {
    return { ok: false, error: "נא להוסיף לפחות שורת נוכחות (כוח אדם)" }
  }
  for (const m of manpower) {
    if (!MANPOWER_ROLE_SET.has(m.role)) return { ok: false, error: "תפקיד לא תקין בשורת כוח אדם" }
    if (!Number.isFinite(m.count) || m.count < 1) return { ok: false, error: "מספר אנשים בשורה חייב להיות חיובי" }
    if (!Number.isFinite(m.hours) || m.hours < 0) return { ok: false, error: "שעות לא תקינות" }
    if (m.taskId != null && !String(m.taskId).trim()) {
      return { ok: false, error: "משימה לא תקינה" }
    }
  }
  for (const eq of input.equipment ?? []) {
    if (!EQUIP_KIND_SET.has(eq.kind)) return { ok: false, error: "סוג ציוד לא תקין" }
    if (!Number.isFinite(eq.hours) || eq.hours < 0) return { ok: false, error: "שעות ציוד לא תקינות" }
  }

  const crewCount = manpower.reduce((s, m) => s + Math.floor(m.count), 0)
  const taskIdsFromManpower = manpower.map((m) => m.taskId).filter((x): x is string => Boolean(x?.trim()))
  const taskIds = [
    ...new Set([
      ...taskIdsFromManpower,
      ...(input.taskIds ?? []).map((x) => String(x).trim()).filter(Boolean),
    ]),
  ]

  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data: logRow, error: logErr } = await supabase
      .from("project_daily_logs")
      .insert({
        project_id: projectId,
        log_date: input.logDate?.trim() || undefined,
        weather,
        crew_count: crewCount,
        work_performed: work,
        task_ids: taskIds,
        red_flags: input.redFlags?.trim() || null,
        photo_paths: input.photoPaths ?? [],
        created_by: user?.id ?? null,
      })
      .select("id")
      .single()
    if (logErr) throw logErr
    const logId = (logRow as { id: string }).id

    const mpPayload = manpower.map((m) => ({
      project_daily_log_id: logId,
      site_id: siteId,
      role: m.role,
      count: Math.floor(m.count),
      task_id: m.taskId?.trim() || null,
      hours: Number(m.hours),
    }))
    const { error: mpErr } = await supabase.from("daily_manpower").insert(mpPayload)
    if (mpErr) throw mpErr

    const eqRows = input.equipment ?? []
    if (eqRows.length > 0) {
      const eqPayload = eqRows.map((eq) => ({
        project_daily_log_id: logId,
        equipment_kind: eq.kind,
        asset_label: eq.assetLabel?.trim() || null,
        hours: Number(eq.hours),
        notes: eq.notes?.trim() || null,
      }))
      const { error: eqErr } = await supabase.from("daily_log_heavy_equipment").insert(eqPayload)
      if (eqErr) throw eqErr
    }

    revalidatePath(`/marker-ofek/projects/${projectId}`)
    revalidatePath(`/marker-ofek/projects/${projectId}/daily-log`)
    return { ok: true, id: logId }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/** אישור יומן לחיוב — נכלל ב־`applyApprovedFieldLogsToPartialAccount`. */
export async function setDailyLogFieldApproval(input: {
  logId: string
  status: "draft" | "approved"
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const logId = input.logId?.trim()
  if (!logId) return { ok: false, error: "חסר מזהה יומן" }
  if (input.status !== "draft" && input.status !== "approved") {
    return { ok: false, error: "סטטוס לא תקין" }
  }
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const { data: row, error: fErr } = await supabase
      .from("project_daily_logs")
      .select("project_id")
      .eq("id", logId)
      .maybeSingle()
    if (fErr) throw fErr
    if (!row) return { ok: false, error: "יומן לא נמצא" }

    const patch: Record<string, unknown> = {
      field_approval_status: input.status,
    }
    if (input.status === "approved") {
      patch.field_approved_at = new Date().toISOString()
      patch.field_approved_by = user.id
    } else {
      patch.field_approved_at = null
      patch.field_approved_by = null
    }

    const { error } = await supabase
      .from("project_daily_logs")
      .update(patch)
      .eq("id", logId)
    if (error) throw error

    const projectId = (row as { project_id: string }).project_id
    revalidatePath(`/marker-ofek/projects/${projectId}`)
    revalidatePath(`/marker-ofek/projects/${projectId}/daily-log`)
    revalidatePath("/marker-ofek/finance/billing")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function insertProjectDailyLog(input: {
  projectId: string
  logDate?: string
  weather: string
  crewCount: number
  workPerformed: string
  taskIds: string[]
  redFlags?: string | null
  photoPaths?: string[]
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const projectId = input.projectId?.trim()
  if (!projectId) return { ok: false, error: "חסר פרויקט" }
  const work = input.workPerformed?.trim() ?? ""
  if (!work) return { ok: false, error: "נא לתאר את ביצוע העבודה" }
  const weather = input.weather?.trim() || "sunny"
  const allowed = new Set(["sunny", "cloudy", "rain", "heat_wind", "other"])
  if (!allowed.has(weather)) return { ok: false, error: "מזג אוויר לא תקין" }
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from("project_daily_logs")
      .insert({
        project_id: projectId,
        log_date: input.logDate?.trim() || undefined,
        weather,
        crew_count: Math.max(0, Math.floor(Number(input.crewCount) || 0)),
        work_performed: work,
        task_ids: [...new Set((input.taskIds ?? []).map((x) => String(x).trim()).filter(Boolean))],
        red_flags: input.redFlags?.trim() || null,
        photo_paths: input.photoPaths ?? [],
        created_by: user?.id ?? null,
      })
      .select("id")
      .single()
    if (error) throw error
    revalidatePath(`/marker-ofek/projects/${projectId}`)
    revalidatePath(`/marker-ofek/projects/${projectId}/daily-log`)
    return { ok: true, id: (data as { id: string }).id }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function insertSiteMediaRecord(input: {
  projectId: string
  storagePath: string
  mimeType?: string | null
  caption?: string | null
  takenAt?: string | null
  fieldTag?: SiteMediaFieldTag | null
  latitude?: number | null
  longitude?: number | null
  dailyLogId?: string | null
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const projectId = input.projectId?.trim()
  const path = input.storagePath?.trim()
  if (!projectId || !path) return { ok: false, error: "חסר נתיב או פרויקט" }
  const tag = input.fieldTag
  if (tag != null && !FIELD_TAG_SET.has(tag)) {
    return { ok: false, error: "תיוג תמונה לא תקין" }
  }
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const lat =
      input.latitude != null && Number.isFinite(Number(input.latitude))
        ? Number(input.latitude)
        : null
    const lng =
      input.longitude != null && Number.isFinite(Number(input.longitude))
        ? Number(input.longitude)
        : null
    const { data, error } = await supabase
      .from("site_media")
      .insert({
        project_id: projectId,
        storage_path: path,
        mime_type: input.mimeType?.trim() || null,
        caption: input.caption?.trim() || null,
        taken_at: input.takenAt?.trim() || null,
        field_tag: tag ?? null,
        latitude: lat,
        longitude: lng,
        daily_log_id: input.dailyLogId?.trim() || null,
        uploaded_by: user?.id ?? null,
      })
      .select("id")
      .single()
    if (error) throw error
    revalidatePath(`/marker-ofek/projects/${projectId}`)
    return { ok: true, id: (data as { id: string }).id }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function registerProjectDocumentVersion(input: {
  projectId: string
  filePath: string
  title?: string | null
  mimeType?: string | null
  documentKind?: string | null
  versionGroupId?: string | null
  parentDocumentId?: string | null
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const projectId = input.projectId?.trim()
  const filePath = input.filePath?.trim()
  if (!projectId || !filePath) return { ok: false, error: "חסר נתיב או פרויקט" }
  try {
    const supabase = await createSupabaseServerAuthClient()
    const groupId = input.versionGroupId?.trim() || crypto.randomUUID()

    const { data: siblings } = await supabase
      .from("project_documents")
      .select("version_number")
      .eq("version_group_id", groupId)

    const maxV = Math.max(
      0,
      ...((siblings ?? []) as { version_number?: number }[]).map((r) =>
        Number(r.version_number) || 0
      )
    )
    const nextVersion = maxV + 1

    if (maxV > 0) {
      await supabase
        .from("project_documents")
        .update({ is_current: false })
        .eq("version_group_id", groupId)
    }

    const { data, error } = await supabase
      .from("project_documents")
      .insert({
        project_id: projectId,
        file_path: filePath,
        title: input.title?.trim() || null,
        mime_type: input.mimeType?.trim() || null,
        document_kind: input.documentKind?.trim() || null,
        version_group_id: groupId,
        version_number: nextVersion,
        is_current: true,
        parent_document_id: input.parentDocumentId?.trim() || null,
      })
      .select("id")
      .single()
    if (error) throw error
    revalidatePath(`/marker-ofek/projects/${projectId}`)
    return { ok: true, id: (data as { id: string }).id }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
