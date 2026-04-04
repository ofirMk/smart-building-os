import { differenceInCalendarDays, parseISO } from "date-fns"

import {
  addWorkingDaysOffsetSync,
  addWorkingDaysSync,
  diffWorkingDaysWithHolidaySet,
} from "@/lib/utils/calendar-utils"

/** Minimal task shape for scheduling (avoid circular imports with gantt-actions). */
export type WbsScheduleTask = {
  id: string
  parent_id: string | null
  name: string
  start_date: string | null
  end_date: string | null
  wbs_order: number
  level: number
  predecessor_index: number | null
  predecessor_task_id: string | null
  dependency_ids: string[]
  /** Working-day lag per predecessor id (negative = lead). */
  dependency_lags?: Record<string, number>
  /** Subcontractor derivative rows: excluded from FS auto-shift; dates follow master cascade. */
  is_derivative?: boolean
}

export type CriticalPathInputTask = {
  id: string
  start_date: string | null
  end_date: string | null
  dependency_ids: string[]
}

function normalizeIso(value: string | null | undefined): string | null {
  const v = String(value ?? "").trim()
  if (!v) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  return v
}

function dateToUtcMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00.000Z`)
}

function buildChildLists(tasks: WbsScheduleTask[]): {
  byParent: Map<string | null, WbsScheduleTask[]>
  hasChildren: Set<string>
} {
  const byParent = new Map<string | null, WbsScheduleTask[]>()
  const hasChildren = new Set<string>()
  for (const t of tasks) {
    const key = t.parent_id ?? null
    const list = byParent.get(key) ?? []
    list.push(t)
    byParent.set(key, list)
    if (t.parent_id) hasChildren.add(t.parent_id)
  }
  for (const rows of byParent.values()) {
    rows.sort((a, b) => {
      const wo = (a.wbs_order ?? 0) - (b.wbs_order ?? 0)
      if (wo !== 0) return wo
      return a.name.localeCompare(b.name, "he")
    })
  }
  return { byParent, hasChildren }
}

/**
 * Same preorder as Gantt "all rows expanded": parent before descendants, siblings by `wbs_order`.
 */
export function canonicalWbsFlatIds(tasks: WbsScheduleTask[]): string[] {
  const { byParent, hasChildren } = buildChildLists(tasks)
  const out: string[] = []
  const visited = new Set<string>()
  const walk = (parentId: string | null) => {
    const children = byParent.get(parentId) ?? []
    for (const child of children) {
      if (visited.has(child.id)) continue
      visited.add(child.id)
      out.push(child.id)
      if (hasChildren.has(child.id)) walk(child.id)
    }
  }
  walk(null)
  for (const t of tasks) {
    if (!visited.has(t.id)) {
      visited.add(t.id)
      out.push(t.id)
    }
  }
  return out
}

export function rowNumberByTaskId(flatIds: string[]): Map<string, number> {
  const m = new Map<string, number>()
  flatIds.forEach((id, i) => m.set(id, i + 1))
  return m
}

function collectPredecessorIds(
  task: WbsScheduleTask,
  flatIds: string[],
  idToIndex: Map<string, number>
): string[] {
  const selfIdx = idToIndex.get(task.id) ?? -1
  const candidates: string[] = []
  const predFk = task.predecessor_task_id ? String(task.predecessor_task_id).trim() : ""
  if (predFk && predFk !== task.id) candidates.push(predFk)
  const pr = task.predecessor_index
  if (pr != null && pr >= 1 && pr <= flatIds.length) {
    const rowIdx0 = pr - 1
    const tid = flatIds[rowIdx0]
    if (tid && tid !== task.id && (selfIdx < 0 || rowIdx0 < selfIdx)) candidates.push(tid)
  }
  for (const d of task.dependency_ids ?? []) {
    if (d && d !== task.id) candidates.push(d)
  }
  return [...new Set(candidates)]
}

/** Max required early start over FS predecessors (with per-link working-day lag). */
function maxRequiredStartFromFsPredecessors(
  task: WbsScheduleTask,
  predIds: string[],
  dates: Map<string, { start: string | null; end: string | null }>,
  byId: Map<string, WbsScheduleTask>,
  holidayDates: ReadonlySet<string>
): string | null {
  const lags = task.dependency_lags ?? {}
  let maxStart: string | null = null
  for (const pid of predIds) {
    const endP = dates.get(pid)?.end ?? normalizeIso(byId.get(pid)?.end_date ?? null)
    if (!endP) continue
    const lag = Number(lags[pid] ?? 0) || 0
    const base = addWorkingDaysSync(endP, 1, holidayDates)
    const req = addWorkingDaysOffsetSync(base, lag, holidayDates)
    if (!maxStart || dateToUtcMs(req) > dateToUtcMs(maxStart)) maxStart = req
  }
  return maxStart
}

/**
 * Finish-to-start scheduling for leaf tasks + summary roll-up for parents.
 * FS + working-day lag; preserves working-day span on leaf tasks.
 */
export function calculateTaskDates(
  tasks: WbsScheduleTask[],
  holidayDates: ReadonlySet<string>,
  options?: { projectMinStartDate?: string | null }
): Map<string, { start_date: string | null; end_date: string | null }> {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const flatIds = canonicalWbsFlatIds(tasks)
  const idToIndex = new Map(flatIds.map((id, i) => [id, i]))
  const { hasChildren } = buildChildLists(tasks)

  const dates = new Map<string, { start: string | null; end: string | null }>()
  for (const t of tasks) {
    dates.set(t.id, {
      start: normalizeIso(t.start_date),
      end: normalizeIso(t.end_date),
    })
  }

  const minProj = normalizeIso(options?.projectMinStartDate ?? null)
  if (minProj) {
    for (const t of tasks) {
      const cur = dates.get(t.id)!
      if (cur.start && dateToUtcMs(cur.start) < dateToUtcMs(minProj)) {
        const dur =
          cur.end && cur.start
            ? diffWorkingDaysWithHolidaySet(cur.start, cur.end, holidayDates)
            : 0
        const newStart = minProj
        const newEnd = dur > 0 ? addWorkingDaysSync(newStart, dur, holidayDates) : newStart
        dates.set(t.id, { start: newStart, end: newEnd })
      }
    }
  }

  const parentIds = tasks.filter((t) => hasChildren.has(t.id)).map((t) => t.id)
  const depthById = new Map<string, number>()
  for (const id of flatIds) {
    let d = 0
    let cur: string | null = id
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      const row = byId.get(cur)
      const p = row?.parent_id ? String(row.parent_id) : null
      if (!p) break
      d += 1
      cur = p
    }
    depthById.set(id, d)
  }
  parentIds.sort((a, b) => (depthById.get(b) ?? 0) - (depthById.get(a) ?? 0))

  const maxIter = Math.max(50, tasks.length * 8)
  for (let iter = 0; iter < maxIter; iter += 1) {
    let changed = false

    for (const id of flatIds) {
      if (hasChildren.has(id)) continue
      const t = byId.get(id)
      if (!t || t.is_derivative) continue
      const predIds = collectPredecessorIds(t, flatIds, idToIndex)
      if (predIds.length === 0) continue

      const requiredStart = maxRequiredStartFromFsPredecessors(t, predIds, dates, byId, holidayDates)
      if (!requiredStart) continue

      const cur = dates.get(id)!
      const curStart = cur.start
      const curEnd = cur.end
      if (!curStart) continue

      if (dateToUtcMs(curStart) >= dateToUtcMs(requiredStart)) continue

      const dur =
        curEnd && curStart
          ? diffWorkingDaysWithHolidaySet(curStart, curEnd, holidayDates)
          : 0
      const newStart = requiredStart
      const newEnd = dur > 0 ? addWorkingDaysSync(newStart, dur, holidayDates) : newStart
      if (curStart !== newStart || curEnd !== newEnd) {
        dates.set(id, { start: newStart, end: newEnd })
        changed = true
      }
    }

    for (const pid of parentIds) {
      const kids = tasks.filter((c) => c.parent_id === pid)
      if (kids.length === 0) continue
      const starts: string[] = []
      const ends: string[] = []
      for (const k of kids) {
        const d = dates.get(k.id)
        const s = d?.start ?? normalizeIso(k.start_date)
        const e = d?.end ?? normalizeIso(k.end_date)
        if (s) starts.push(s)
        if (e) ends.push(e)
      }
      const minStart = starts.length
        ? starts.reduce((a, b) => (dateToUtcMs(a) <= dateToUtcMs(b) ? a : b))
        : null
      const maxEnd = ends.length ? ends.reduce((a, b) => (dateToUtcMs(a) >= dateToUtcMs(b) ? a : b)) : null
      const cur = dates.get(pid)!
      if (cur.start !== minStart || cur.end !== maxEnd) {
        dates.set(pid, { start: minStart, end: maxEnd })
        changed = true
      }
    }

    if (!changed) break
  }

  const out = new Map<string, { start_date: string | null; end_date: string | null }>()
  for (const [id, d] of dates) {
    out.set(id, { start_date: d.start, end_date: d.end })
  }
  return out
}

function calendarDurationDays(t: CriticalPathInputTask): number {
  const s = normalizeIso(t.start_date)
  const e = normalizeIso(t.end_date)
  if (!s || !e) return 1
  return Math.max(1, differenceInCalendarDays(parseISO(e), parseISO(s)) + 1)
}

/**
 * Longest-path (calendar duration) critical tasks — proxy for zero-float critical path in FS networks.
 */
export function computeCriticalPathTaskIds(tasks: CriticalPathInputTask[]): Set<string> {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const ids = new Set(tasks.map((t) => t.id))
  const memo = new Map<string, number>()

  function lp(tid: string): number {
    if (memo.has(tid)) return memo.get(tid)!
    const t = byId.get(tid)
    if (!t) return 0
    let base = 0
    for (const p of t.dependency_ids ?? []) {
      if (!ids.has(p)) continue
      base = Math.max(base, lp(p))
    }
    const v = base + calendarDurationDays(t)
    memo.set(tid, v)
    return v
  }

  let projectLen = 0
  for (const t of tasks) {
    projectLen = Math.max(projectLen, lp(t.id))
  }

  const critical = new Set<string>()

  function traceBack(tid: string) {
    const t = byId.get(tid)
    if (!t) return
    critical.add(tid)
    const d = calendarDurationDays(t)
    const target = (lp(tid) ?? 0) - d
    if (target <= 0) return
    for (const p of t.dependency_ids ?? []) {
      if (!ids.has(p)) continue
      if ((lp(p) ?? 0) === target) traceBack(p)
    }
  }

  for (const t of tasks) {
    if ((lp(t.id) ?? 0) === projectLen) traceBack(t.id)
  }

  return critical
}
