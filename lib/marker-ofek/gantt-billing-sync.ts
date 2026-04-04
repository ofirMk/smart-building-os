/**
 * Compares partial-account line “נוכחי %” (billing) to Gantt-derived progress.
 * Primary match: BOQ bridge (`section_number` ↔ `item_code` → `task_boq_links`; surfaced as `gantt_suggested_percent`).
 * Fallback: single unambiguous substring match between line label and task name (milestones included).
 */

/** Highlight in UI when |Gantt − Billing| exceeds this (percentage points). */
export const GAP_ALERT_THRESHOLD_PCT = 5

export function gapExceedsAlertThreshold(gap: number | null | undefined): boolean {
  if (gap == null || Number.isNaN(gap)) return false
  return Math.abs(gap) > GAP_ALERT_THRESHOLD_PCT
}

export type GanttTaskSyncLite = {
  id: string
  name: string
  progress: number
}

export type PartialLineForSync = {
  id: string
  label: string
  quantity_current: number
  gantt_suggested_percent: number | null
  contract_line_item_id: string | null
  contract_milestone_id: string | null
}

export type GanttBillingSyncRow = {
  lineId: string
  label: string
  billingPercent: number
  ganttPercent: number | null
  gap: number | null
  match: "boq" | "fuzzy_name" | "none"
}

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, n))
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

/**
 * Resolved “field” % for one partial line: BOQ (`gantt_suggested_percent`) else fuzzy name match.
 */
export function resolveFieldPercentForPartialLine(
  line: Pick<PartialLineForSync, "label" | "gantt_suggested_percent">,
  tasks: GanttTaskSyncLite[]
): number | null {
  if (line.gantt_suggested_percent != null && Number.isFinite(line.gantt_suggested_percent)) {
    return clampPct(Number(line.gantt_suggested_percent))
  }
  return fuzzySingleTaskProgressForLabel(tasks, line.label)
}

/** If exactly one task name matches label by substring (either direction), return its progress. */
export function fuzzySingleTaskProgressForLabel(
  tasks: GanttTaskSyncLite[],
  label: string
): number | null {
  const L = norm(label)
  if (L.length < 2) return null
  const hits = tasks.filter((t) => {
    const n = norm(t.name)
    if (n.length < 2) return false
    return L.includes(n) || n.includes(L)
  })
  if (hits.length !== 1) return null
  return clampPct(Number(hits[0]!.progress) || 0)
}

export function buildGanttBillingSyncComparison(
  lines: PartialLineForSync[],
  tasks: GanttTaskSyncLite[]
): GanttBillingSyncRow[] {
  return lines.map((li) => {
    const billingPercent = clampPct(Number(li.quantity_current) || 0)

    let ganttPercent: number | null = null
    let match: GanttBillingSyncRow["match"] = "none"

    if (li.gantt_suggested_percent != null && Number.isFinite(li.gantt_suggested_percent)) {
      ganttPercent = clampPct(Number(li.gantt_suggested_percent))
      match = "boq"
    } else {
      const fuzzy = fuzzySingleTaskProgressForLabel(tasks, li.label)
      if (fuzzy != null) {
        ganttPercent = fuzzy
        match = "fuzzy_name"
      }
    }

    const gap =
      ganttPercent != null ? Math.round((ganttPercent - billingPercent) * 100) / 100 : null

    return {
      lineId: li.id,
      label: li.label,
      billingPercent,
      ganttPercent,
      gap,
      match,
    }
  })
}
