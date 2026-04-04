import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { fetchHebcalHolidayDates } from "@/lib/utils/calendar-utils"
import { diffWorkingDaysWithHolidaySet } from "@/lib/utils/calendar-utils"

type MinimalSupabase = Pick<SupabaseClient, "from">

/**
 * Labor cost from Gantt: Σ (working days on task × resource cost/day) per assignment.
 * Matches duration semantics used in the Gantt cost column (holiday-aware when Hebcal loads).
 */
export async function computeGanttLaborCostByProjectId(
  supabase: MinimalSupabase,
  projectIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (projectIds.length === 0) return out

  const { data: assigns, error: aErr } = await supabase
    .from("task_resource_assignments")
    .select("project_id, task_id, resource_id")
    .in("project_id", projectIds)
  if (aErr) throw new Error(aErr.message)

  const rows = (assigns ?? []) as Array<{
    project_id: string
    task_id: string
    resource_id: string
  }>
  if (rows.length === 0) return out

  const taskIds = [...new Set(rows.map((r) => r.task_id))]
  const resourceIds = [...new Set(rows.map((r) => r.resource_id))]

  const [{ data: tasks, error: tErr }, { data: resources, error: rErr }] = await Promise.all([
    supabase.from("tasks").select("id, start_date, end_date").in("id", taskIds),
    supabase.from("resources").select("id, cost_per_day").in("id", resourceIds),
  ])
  if (tErr) throw new Error(tErr.message)
  if (rErr) throw new Error(rErr.message)

  const taskMap = new Map(
    (tasks ?? []).map((t) => [
      String((t as { id: string }).id),
      {
        start: (t as { start_date: string | null }).start_date,
        end: (t as { end_date: string | null }).end_date,
      },
    ])
  )
  const resMap = new Map(
    (resources ?? []).map((r) => [
      String((r as { id: string }).id),
      Number((r as { cost_per_day: number }).cost_per_day ?? 0) || 0,
    ])
  )

  let minY = 9999
  let maxY = 0
  for (const t of tasks ?? []) {
    const s = (t as { start_date?: string | null }).start_date
    const e = (t as { end_date?: string | null }).end_date
    for (const iso of [s, e]) {
      if (!iso || typeof iso !== "string") continue
      const y = Number(iso.slice(0, 4))
      if (Number.isFinite(y)) {
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (minY > maxY) {
    const y = new Date().getFullYear()
    minY = y
    maxY = y
  }

  const holidaySet = new Set<string>()
  for (let y = minY; y <= maxY; y++) {
    const s = await fetchHebcalHolidayDates(y)
    for (const d of s) holidaySet.add(d)
  }

  for (const a of rows) {
    const t = taskMap.get(a.task_id)
    const rate = resMap.get(a.resource_id) ?? 0
    const start = t?.start ? String(t.start).slice(0, 10) : ""
    const end = t?.end ? String(t.end).slice(0, 10) : ""
    if (!start || !end || rate <= 0) continue
    const wd = diffWorkingDaysWithHolidaySet(start, end, holidaySet)
    const cost = wd * rate
    const pid = a.project_id
    out.set(pid, (out.get(pid) ?? 0) + cost)
  }

  return out
}

/**
 * ימי עבודה כוללים בגאנט (ללא מחיר) — משקל להעמסת עקיפות לפי `labor_hours`.
 */
export async function computeGanttLaborDaysByProjectId(
  supabase: MinimalSupabase,
  projectIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (projectIds.length === 0) return out

  const { data: assigns, error: aErr } = await supabase
    .from("task_resource_assignments")
    .select("project_id, task_id, resource_id")
    .in("project_id", projectIds)
  if (aErr) throw new Error(aErr.message)

  const rows = (assigns ?? []) as Array<{
    project_id: string
    task_id: string
    resource_id: string
  }>
  if (rows.length === 0) return out

  const taskIds = [...new Set(rows.map((r) => r.task_id))]

  const { data: tasks, error: tErr } = await supabase
    .from("tasks")
    .select("id, start_date, end_date")
    .in("id", taskIds)
  if (tErr) throw new Error(tErr.message)

  const taskMap = new Map(
    (tasks ?? []).map((t) => [
      String((t as { id: string }).id),
      {
        start: (t as { start_date: string | null }).start_date,
        end: (t as { end_date: string | null }).end_date,
      },
    ])
  )

  let minY = 9999
  let maxY = 0
  for (const t of tasks ?? []) {
    const s = (t as { start_date?: string | null }).start_date
    const e = (t as { end_date?: string | null }).end_date
    for (const iso of [s, e]) {
      if (!iso || typeof iso !== "string") continue
      const y = Number(iso.slice(0, 4))
      if (Number.isFinite(y)) {
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (minY > maxY) {
    const y = new Date().getFullYear()
    minY = y
    maxY = y
  }

  const holidaySet = new Set<string>()
  for (let y = minY; y <= maxY; y++) {
    const s = await fetchHebcalHolidayDates(y)
    for (const d of s) holidaySet.add(d)
  }

  for (const a of rows) {
    const t = taskMap.get(a.task_id)
    const start = t?.start ? String(t.start).slice(0, 10) : ""
    const end = t?.end ? String(t.end).slice(0, 10) : ""
    if (!start || !end) continue
    const wd = diffWorkingDaysWithHolidaySet(start, end, holidaySet)
    if (wd <= 0) continue
    const pid = a.project_id
    out.set(pid, (out.get(pid) ?? 0) + wd)
  }

  return out
}
