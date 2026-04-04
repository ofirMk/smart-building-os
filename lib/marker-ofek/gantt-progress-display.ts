import type { GanttTaskRow } from "@/lib/marker-ofek/gantt-actions"
import { diffWorkingDaysWithHolidaySet } from "@/lib/utils/calendar-utils"

const NO_HOLIDAYS = new Set<string>()

const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * Portfolio-style progress: Σ(weight × progress) / Σ(weight) for **leaf** tasks only.
 * Weight = working-day duration (matches server rollup in `rollupSummaryTaskProgress`).
 */
/**
 * Portfolio-style progress for an arbitrary subset of tasks (no parent/child filtering).
 * Use when tasks are already scoped (e.g. linked to one BOQ line).
 */
export function weightedProgressForTaskRows(rows: GanttTaskRow[]): number | null {
  let wsum = 0
  let psum = 0
  for (const t of rows) {
    const s = t.start_date?.trim() ?? ""
    const e = t.end_date?.trim() ?? ""
    if (!ISO.test(s) || !ISO.test(e)) continue
    let w = 1
    try {
      w = Math.max(1, diffWorkingDaysWithHolidaySet(s, e, NO_HOLIDAYS))
    } catch {
      w = 1
    }
    wsum += w
    psum += w * (Number(t.progress) || 0)
  }
  if (wsum <= 0) return null
  return Math.max(0, Math.min(100, Math.round(psum / wsum)))
}

export function weightedLeafProgressPercent(rows: GanttTaskRow[]): number | null {
  const hasChildren = new Set<string>()
  for (const t of rows) {
    if (t.parent_id) hasChildren.add(t.parent_id)
  }
  let wsum = 0
  let psum = 0
  for (const t of rows) {
    if (hasChildren.has(t.id)) continue
    const s = t.start_date?.trim() ?? ""
    const e = t.end_date?.trim() ?? ""
    if (!ISO.test(s) || !ISO.test(e)) continue
    let w = 1
    try {
      w = Math.max(1, diffWorkingDaysWithHolidaySet(s, e, NO_HOLIDAYS))
    } catch {
      w = 1
    }
    wsum += w
    psum += w * (Number(t.progress) || 0)
  }
  if (wsum <= 0) return null
  return Math.max(0, Math.min(100, Math.round(psum / wsum)))
}

export function workingDaysBetweenLabel(startIso: string | null, endIso: string | null): string {
  const s = startIso?.trim() ?? ""
  const e = endIso?.trim() ?? ""
  if (!ISO.test(s) || !ISO.test(e)) return "—"
  try {
    const n = Math.max(1, diffWorkingDaysWithHolidaySet(s, e, NO_HOLIDAYS))
    return `${n} ימ׳`
  } catch {
    return "—"
  }
}
