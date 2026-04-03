"use client"

import * as React from "react"
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { he } from "date-fns/locale"
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  FolderTree,
  GripHorizontal,
  Layers3,
  Save,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  assignResourceToTask,
  fetchTaskBoqLinks,
  fetchProjectTasks,
  fetchResourceEngine,
  generateProjectWbsFromDocuments,
  groupTasksAsHammock,
  type GanttTaskRow,
  type ProjectResourceRow,
  type ResourceVacationRow,
  type TaskResourceAssignmentRow,
  updateTaskGridRow,
  updateTaskDatesWithDependencies,
} from "@/lib/actions/gantt-actions"
import { addWorkingDaysSync, isWorkDay } from "@/lib/utils/calendar-utils"
import { formatError } from "@/lib/utils"

type GanttClientProps = {
  projectId: string
  projectName: string
  projectCode: string
  initialTasks: GanttTaskRow[]
  perTaskVariance: Record<string, { estimatedCost: number; actualCost: number }>
  summary: {
    plannedCost: number
    actualCost: number
    variance: number
    variancePercent: number
    status: "over" | "under" | "on_track"
  }
}

type FlatTask = GanttTaskRow & { depth: number; rowNumber: number }
type TreeMaps = {
  byParent: Map<string | null, GanttTaskRow[]>
  hasChildren: Set<string>
}

type SyncState = "idle" | "saving" | "saved" | "error"
const EMPTY_HOLIDAY_DATES = new Set<string>()

function draftStorageKey(projectId: string): string {
  return `marker-ofek:gantt:drafts:${projectId}`
}

function overlapsDateRanges(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null
): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false
  const aS = dateToMs(aStart)
  const aE = dateToMs(aEnd)
  const bS = dateToMs(bStart)
  const bE = dateToMs(bEnd)
  return aS <= bE && bS <= aE
}

function dateToMs(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00.000Z`)
}

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

function dateOrEmpty(value: string | null | undefined): string {
  return String(value ?? "").trim()
}

function shiftIso(isoDate: string, deltaDays: number): string {
  return format(addDays(parseISO(isoDate), deltaDays), "yyyy-MM-dd")
}

function formatHebDate(isoDate: string): string {
  return format(parseISO(isoDate), "dd/MM/yyyy", { locale: he })
}

function rtlOffsetPercent(offsetDays: number, totalDays: number): number {
  return (Math.max(0, offsetDays) / Math.max(1, totalDays)) * 100
}

function rightPercentToLeftX(rightPercent: number, width: number): number {
  return width - (rightPercent / 100) * width
}

function buildTreeMaps(tasks: GanttTaskRow[]): TreeMaps {
  const byParent = new Map<string | null, GanttTaskRow[]>()
  const hasChildren = new Set<string>()
  for (const task of tasks) {
    const key = task.parent_id ?? null
    const list = byParent.get(key) ?? []
    list.push(task)
    byParent.set(key, list)
    if (task.parent_id) hasChildren.add(task.parent_id)
  }
  for (const rows of byParent.values()) {
    rows.sort((a, b) => {
      const aStart = dateOrEmpty(a.start_date)
      const bStart = dateOrEmpty(b.start_date)
      if (aStart !== bStart) return aStart.localeCompare(bStart)
      return a.name.localeCompare(b.name, "he")
    })
  }
  return { byParent, hasChildren }
}

function flattenVisible(
  maps: TreeMaps,
  expanded: Set<string>,
  allTasks: GanttTaskRow[]
): FlatTask[] {
  const out: FlatTask[] = []
  const visited = new Set<string>()
  const walk = (parentId: string | null, depth: number) => {
    const children = maps.byParent.get(parentId) ?? []
    for (const child of children) {
      if (visited.has(child.id)) continue
      visited.add(child.id)
      out.push({ ...child, depth, rowNumber: out.length + 1 })
      if (expanded.has(child.id)) walk(child.id, depth + 1)
    }
  }

  walk(null, 0)
  for (const task of allTasks) {
    if (!visited.has(task.id)) {
      out.push({ ...task, depth: 0, rowNumber: out.length + 1 })
    }
  }
  return out
}

function timelineRange(tasks: FlatTask[]) {
  const dated = tasks.filter((t) => t.start_date && t.end_date)
  if (dated.length === 0) {
    const start = startOfWeek(new Date(), { weekStartsOn: 0 })
    const end = addDays(start, 90)
    return { min: start, max: end, days: differenceInCalendarDays(end, start) + 1 }
  }
  let min = parseISO(dated[0]!.start_date as string)
  let max = parseISO(dated[0]!.end_date as string)
  for (const row of dated) {
    const s = parseISO(row.start_date as string)
    const e = parseISO(row.end_date as string)
    if (s < min) min = s
    if (e > max) max = e
  }
  min = startOfWeek(min, { weekStartsOn: 0 })
  max = endOfWeek(max, { weekStartsOn: 0 })
  return { min, max, days: Math.max(1, differenceInCalendarDays(max, min) + 1) }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function diffWorkingDaysWithHolidaySet(
  startIso: string,
  endIso: string,
  holidayDates: Set<string> | null | undefined
): number {
  if (!startIso || !endIso || dateToMs(endIso) < dateToMs(startIso)) return 0
  const safeHolidayDates = holidayDates ?? EMPTY_HOLIDAY_DATES
  let count = 0
  let cursor = startIso
  while (dateToMs(cursor) < dateToMs(endIso)) {
    cursor = shiftIso(cursor, 1)
    if (isWorkDay(cursor, safeHolidayDates)) count += 1
  }
  return count
}

export default function GanttClient({
  projectId,
  projectName,
  projectCode,
  initialTasks,
  perTaskVariance,
  summary,
}: GanttClientProps) {
  // Keep this first to avoid TDZ-like ordering regressions.
  const [holidayDates, setHolidayDates] = React.useState<Set<string>>(new Set())
  const initialHolidayDates = EMPTY_HOLIDAY_DATES
  const [tasks, setTasks] = React.useState<GanttTaskRow[]>(initialTasks)
  const [expandedTaskIds, setExpandedTaskIds] = React.useState<Set<string>>(
    () => new Set(initialTasks.filter((t) => !t.parent_id).map((t) => t.id))
  )
  const [dateDrafts, setDateDrafts] = React.useState<Record<string, { start: string; end: string }>>(
    () =>
      Object.fromEntries(
        initialTasks.map((t) => [t.id, { start: dateOrEmpty(t.start_date), end: dateOrEmpty(t.end_date) }])
      )
  )
  const [progressDrafts, setProgressDrafts] = React.useState<Record<string, number>>(
    () => Object.fromEntries(initialTasks.map((t) => [t.id, Number(t.progress) || 0]))
  )
  const [nameDrafts, setNameDrafts] = React.useState<Record<string, string>>(
    () => Object.fromEntries(initialTasks.map((t) => [t.id, t.name]))
  )
  const [durationDrafts, setDurationDrafts] = React.useState<Record<string, number>>(
    () =>
      Object.fromEntries(
        initialTasks.map((t) => {
          const start = dateOrEmpty(t.start_date)
          const end = dateOrEmpty(t.end_date)
          return [t.id, start && end ? diffWorkingDaysWithHolidaySet(start, end, initialHolidayDates) : 0]
        })
      )
  )
  const [selectedTaskIds, setSelectedTaskIds] = React.useState<Set<string>>(new Set())
  const [groupName, setGroupName] = React.useState("")
  const [resources, setResourceRows] = React.useState<ProjectResourceRow[]>([])
  const [vacations, setVacations] = React.useState<ResourceVacationRow[]>([])
  const [assignments, setAssignments] = React.useState<TaskResourceAssignmentRow[]>([])
  const [taskBoqCostByTask, setTaskBoqCostByTask] = React.useState<Record<string, number>>({})
  const [resourceFilterByTask, setResourceFilterByTask] = React.useState<Record<string, string>>({})
  const [savingTaskId, setSavingTaskId] = React.useState<string | null>(null)
  const [savingLayout, setSavingLayout] = React.useState(false)
  const [syncState, setSyncState] = React.useState<SyncState>("idle")
  const [theme, setTheme] = React.useState<"swiss" | "command" | "monolith">("swiss")
  const [activeEditCell, setActiveEditCell] = React.useState<string | null>(null)
  const [recentlySavedTaskId, setRecentlySavedTaskId] = React.useState<string | null>(null)
  const [resourceMenu, setResourceMenu] = React.useState<{
    open: boolean
    taskId: string | null
  }>({
    open: false,
    taskId: null,
  })
  const [scrollTop, setScrollTop] = React.useState(0)
  const [dragState, setDragState] = React.useState<{
    taskId: string
    startX: number
    baseStart: string
    baseEnd: string
    deltaDays: number
  } | null>(null)

  const tableScrollRef = React.useRef<HTMLDivElement | null>(null)
  const timelineScrollRef = React.useRef<HTMLDivElement | null>(null)
  const timelineWidthRef = React.useRef<HTMLDivElement | null>(null)
  const gridRootRef = React.useRef<HTMLDivElement | null>(null)
  const editCellInitialValueRef = React.useRef<string>("")
  const syncLockRef = React.useRef(false)
  const syncInFlightRef = React.useRef(false)

  const ROW_HEIGHT = 28
  const VIEWPORT_HEIGHT = 680
  const OVERSCAN = 8

  const maps = React.useMemo(() => buildTreeMaps(tasks), [tasks])
  const visibleTasks = React.useMemo(
    () => flattenVisible(maps, expandedTaskIds, tasks),
    [maps, expandedTaskIds, tasks]
  )
  const range = React.useMemo(() => timelineRange(visibleTasks), [visibleTasks])
  const totalHeight = visibleTasks.length * ROW_HEIGHT
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIndex = Math.min(
    visibleTasks.length,
    Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN
  )
  const renderedRows = visibleTasks.slice(startIndex, endIndex)
  const spacerTop = startIndex * ROW_HEIGHT
  const spacerBottom = Math.max(0, totalHeight - endIndex * ROW_HEIGHT)

  const financialHealthScore = React.useMemo(() => {
    const overrun = Math.max(0, summary.variancePercent)
    return clamp(Math.round(100 - overrun), 0, 100)
  }, [summary.variancePercent])

  const taskById = React.useMemo(
    () => new Map(tasks.map((t) => [t.id, t])),
    [tasks]
  )

  const assignedNamesByTask = React.useMemo(() => {
    const namesByResource = new Map(resources.map((r) => [r.id, r.name]))
    const map = new Map<string, string[]>()
    for (const assignment of assignments) {
      const label = namesByResource.get(assignment.resource_id)
      if (!label) continue
      const list = map.get(assignment.task_id) ?? []
      list.push(label)
      map.set(assignment.task_id, list)
    }
    return map
  }, [resources, assignments])

  const conflictTaskIds = React.useMemo(() => {
    const byResource = new Map<string, TaskResourceAssignmentRow[]>()
    for (const assignment of assignments) {
      const list = byResource.get(assignment.resource_id) ?? []
      list.push(assignment)
      byResource.set(assignment.resource_id, list)
    }
    const conflicts = new Set<string>()
    for (const list of byResource.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]!
          const b = list[j]!
          if (a.task_id === b.task_id) continue
          if (overlapsDateRanges(a.start_date, a.end_date, b.start_date, b.end_date)) {
            conflicts.add(a.task_id)
            conflicts.add(b.task_id)
          }
        }
      }
    }
    return conflicts
  }, [assignments])

  const criticalDelayDays = React.useMemo(() => {
    const todayIso = format(new Date(), "yyyy-MM-dd")
    let maxDelay = 0
    for (const task of tasks) {
      const end = dateOrEmpty(task.end_date)
      const progress = Number(progressDrafts[task.id] ?? task.progress)
      if (!end || progress >= 100) continue
      if (end < todayIso) {
        const delay = differenceInCalendarDays(parseISO(todayIso), parseISO(end))
        if (delay > maxDelay) maxDelay = delay
      }
    }
    return maxDelay
  }, [tasks, progressDrafts])

  const resourceWasteIls = React.useMemo(() => {
    const resourceMap = new Map(resources.map((r) => [r.id, r.cost_per_day]))
    let sum = 0
    for (const assignment of assignments) {
      if (!conflictTaskIds.has(assignment.task_id)) continue
      const rate = Number(resourceMap.get(assignment.resource_id) ?? 0)
      sum += rate
    }
    return sum
  }, [assignments, conflictTaskIds, resources])

  const taskCostImpactById = React.useMemo(() => {
    const resourceRateById = new Map(resources.map((r) => [r.id, Number(r.cost_per_day) || 0]))
    const assignmentCostByTask = new Map<string, number>()
    for (const assignment of assignments) {
      const rate = Number(resourceRateById.get(assignment.resource_id) ?? 0)
      const durationDays =
        assignment.start_date && assignment.end_date
          ? Math.max(
              1,
              Math.round(
                (dateToMs(String(assignment.end_date)) - dateToMs(String(assignment.start_date))) /
                  (24 * 60 * 60 * 1000)
              ) + 1
            )
          : 0
      assignmentCostByTask.set(
        assignment.task_id,
        (assignmentCostByTask.get(assignment.task_id) ?? 0) + durationDays * rate
      )
    }
    const out: Record<string, number> = {}
    for (const task of tasks) {
      const taskId = task.id
      out[taskId] =
        (assignmentCostByTask.get(taskId) ?? 0) +
        Number(taskBoqCostByTask[taskId] ?? 0)
    }
    return out
  }, [assignments, resources, taskBoqCostByTask, tasks])

  const wipValueIls = React.useMemo(() => {
    return tasks.reduce((sum, task) => {
      const impact = Number(taskCostImpactById[task.id] ?? 0)
      const percent = clamp(Number(progressDrafts[task.id] ?? task.progress), 0, 100) / 100
      return sum + impact * percent
    }, 0)
  }, [tasks, taskCostImpactById, progressDrafts])

  const billingStatus = React.useMemo(() => {
    if (wipValueIls <= 0) return "Not Started"
    if (summary.variancePercent > 12 || criticalDelayDays > 7) return "At Risk"
    return "Ready for Partial"
  }, [wipValueIls, summary.variancePercent, criticalDelayDays])

  const projectHealthLabel = React.useMemo(() => {
    if (criticalDelayDays > 7 || summary.variancePercent > 12) return "At Risk"
    return "Good"
  }, [criticalDelayDays, summary.variancePercent])

  const monthSegments = React.useMemo(() => {
    const segments: Array<{ label: string; right: number; width: number }> = []
    let cursor = startOfMonth(range.min)
    while (cursor <= range.max) {
      const start = cursor < range.min ? range.min : cursor
      const end = endOfMonth(cursor) > range.max ? range.max : endOfMonth(cursor)
      const offset = Math.max(0, differenceInCalendarDays(start, range.min))
      const duration = Math.max(1, differenceInCalendarDays(end, start) + 1)
      segments.push({
        label: format(cursor, "LLLL yyyy", { locale: he }),
        right: rtlOffsetPercent(offset, range.days),
        width: (duration / range.days) * 100,
      })
      cursor = addMonths(cursor, 1)
    }
    return segments
  }, [range])

  const weekSegments = React.useMemo(() => {
    const segments: Array<{ label: string; right: number; width: number }> = []
    let cursor = startOfWeek(range.min, { weekStartsOn: 0 })
    while (cursor <= range.max) {
      const start = cursor < range.min ? range.min : cursor
      const end = endOfWeek(cursor, { weekStartsOn: 0 }) > range.max ? range.max : endOfWeek(cursor, { weekStartsOn: 0 })
      const offset = Math.max(0, differenceInCalendarDays(start, range.min))
      const duration = Math.max(1, differenceInCalendarDays(end, start) + 1)
      segments.push({
        label: `שבוע ${format(cursor, "II", { locale: he })}`,
        right: rtlOffsetPercent(offset, range.days),
        width: (duration / range.days) * 100,
      })
      cursor = addWeeks(cursor, 1)
    }
    return segments
  }, [range])

  const todayLineRight = React.useMemo(() => {
    const todayIso = format(new Date(), "yyyy-MM-dd")
    const offset = differenceInCalendarDays(parseISO(todayIso), range.min)
    if (offset < 0 || offset >= range.days) return null
    return rtlOffsetPercent(offset, range.days)
  }, [range])

  React.useEffect(() => {
    if (!recentlySavedTaskId) return
    const timer = window.setTimeout(() => setRecentlySavedTaskId(null), 850)
    return () => window.clearTimeout(timer)
  }, [recentlySavedTaskId])

  // Maintain explicit symbol usage for sheet imports while modals remain disabled.
  void Sheet
  void SheetContent
  void SheetHeader
  void SheetTitle

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [engine, boqLinks] = await Promise.all([
          fetchResourceEngine(projectId),
          fetchTaskBoqLinks(projectId),
        ])
        if (cancelled) return
        setResourceRows(engine.resources)
        setVacations(engine.vacations)
        setAssignments(engine.assignments)
        const boqByTask: Record<string, number> = {}
        for (const link of boqLinks) {
          boqByTask[link.task_id] = (boqByTask[link.task_id] ?? 0) + Number(link.boq_cost || 0)
        }
        setTaskBoqCostByTask(boqByTask)
      } catch {
        if (cancelled) return
        setResourceRows([])
        setVacations([])
        setAssignments([])
        setTaskBoqCostByTask({})
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  React.useEffect(() => {
    const root = document.documentElement
    root.classList.remove("theme-swiss", "theme-command", "theme-monolith")
    root.classList.add(
      theme === "swiss"
        ? "theme-swiss"
        : theme === "command"
          ? "theme-command"
          : "theme-monolith"
    )
    return () => {
      root.classList.remove("theme-swiss", "theme-command", "theme-monolith")
    }
  }, [theme])

  React.useEffect(() => {
    let cancelled = false
    const year = new Date().getFullYear()
    void (async () => {
      try {
        const res = await fetch(
          `https://www.hebcal.com/hebcal?v=1&cfg=json&year=${year}&maj=on&min=on&mod=on&nx=on&ss=on&mf=on&c=on&geo=none`
        )
        const data = (await res.json()) as { items?: Array<{ date?: string }> }
        if (cancelled) return
        const days = new Set<string>()
        for (const item of data.items ?? []) {
          const iso = String(item.date ?? "").slice(0, 10)
          if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) days.add(iso)
        }
        setHolidayDates(days)
      } catch {
        if (!cancelled) setHolidayDates(new Set())
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!dragState) return
    const onMove = (e: MouseEvent) => {
      const width = timelineWidthRef.current?.getBoundingClientRect().width ?? 0
      if (width <= 0) return
      const pxPerDay = width / Math.max(1, range.days)
      const dx = e.clientX - dragState.startX
      const deltaDays = -Math.round(dx / Math.max(1, pxPerDay))
      setDragState((prev) => (prev ? { ...prev, deltaDays } : prev))
    }
    const onUp = async () => {
      const curr = dragState
      setDragState(null)
      if (!curr || curr.deltaDays === 0) return
      setSavingTaskId(curr.taskId)
      try {
        await updateTaskDatesWithDependencies({
          taskId: curr.taskId,
          projectId,
          startDate: shiftIso(curr.baseStart, curr.deltaDays),
          endDate: shiftIso(curr.baseEnd, curr.deltaDays),
        })
        toast.success("תאריכי המשימה עודכנו כולל תלותים.")
        await refreshTasks()
      } catch (error) {
        toast.error(formatError(error))
      } finally {
        setSavingTaskId(null)
      }
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp, { once: true })
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [dragState, range.days, projectId])

  React.useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      const hasOpenState = Boolean(activeEditCell) || resourceMenu.open || Boolean(dragState)
      if (!hasOpenState) return
      event.preventDefault()
      setResourceMenu((prev) => (prev.open ? { open: false, taskId: null } : prev))
      if (dragState) setDragState(null)
      if (activeEditCell) {
        const [taskId, field] = activeEditCell.split(":")
        const original = editCellInitialValueRef.current
        if (taskId && field) {
          if (field === "name") {
            setNameDrafts((prev) => ({ ...prev, [taskId]: original }))
          } else if (field === "start") {
            updateStartDate(taskId, original)
          } else if (field === "end") {
            updateEndDate(taskId, original)
          } else if (field === "duration") {
            updateDuration(taskId, Number(original || 0))
          } else if (field === "progress") {
            setProgressDrafts((prev) => ({ ...prev, [taskId]: Number(original || 0) }))
          }
        }
        setActiveEditCell(null)
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
        requestAnimationFrame(() => gridRootRef.current?.focus())
        return
      }
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
      requestAnimationFrame(() => gridRootRef.current?.focus())
    }
    window.addEventListener("keydown", onEsc)
    return () => {
      window.removeEventListener("keydown", onEsc)
    }
  }, [activeEditCell, resourceMenu.open, dragState])

  React.useEffect(() => {
    if (!activeEditCell) return
    const activeRowId = activeEditCell.split(":")[0] ?? ""
    const closeIfClickedOutsideRow = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (activeRowId && target.closest(`[data-grid-row-id="${activeRowId}"]`)) return
      setActiveEditCell(null)
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
      requestAnimationFrame(() => gridRootRef.current?.focus())
    }
    window.addEventListener("mousedown", closeIfClickedOutsideRow)
    return () => {
      window.removeEventListener("mousedown", closeIfClickedOutsideRow)
    }
  }, [activeEditCell])

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(draftStorageKey(projectId))
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        nameDrafts?: Record<string, string>
        dateDrafts?: Record<string, { start: string; end: string }>
        durationDrafts?: Record<string, number>
        progressDrafts?: Record<string, number>
      }
      if (parsed.nameDrafts) setNameDrafts((prev) => ({ ...prev, ...parsed.nameDrafts }))
      if (parsed.dateDrafts) setDateDrafts((prev) => ({ ...prev, ...parsed.dateDrafts }))
      if (parsed.durationDrafts) setDurationDrafts((prev) => ({ ...prev, ...parsed.durationDrafts }))
      if (parsed.progressDrafts) setProgressDrafts((prev) => ({ ...prev, ...parsed.progressDrafts }))
    } catch {
      // ignore invalid local drafts
    }
  }, [projectId])

  React.useEffect(() => {
    try {
      localStorage.setItem(
        draftStorageKey(projectId),
        JSON.stringify({
          nameDrafts,
          dateDrafts,
          durationDrafts,
          progressDrafts,
        })
      )
    } catch {
      // ignore local storage failures
    }
  }, [projectId, nameDrafts, dateDrafts, durationDrafts, progressDrafts])

  function syncScroll(source: "table" | "timeline", nextTop: number, element: HTMLDivElement) {
    if (syncLockRef.current) return
    syncLockRef.current = true
    setScrollTop(nextTop)
    const other = source === "table" ? timelineScrollRef.current : tableScrollRef.current
    if (other && other !== element) other.scrollTop = nextTop
    requestAnimationFrame(() => {
      syncLockRef.current = false
    })
  }

  function handleInlineEditKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" && event.key !== "Escape") return
    const cellKey = activeEditCell
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      if (cellKey) {
        const [taskId, field] = cellKey.split(":")
        const original = editCellInitialValueRef.current
        if (taskId && field) {
          if (field === "name") {
            setNameDrafts((prev) => ({ ...prev, [taskId]: original }))
          } else if (field === "start") {
            updateStartDate(taskId, original)
          } else if (field === "end") {
            updateEndDate(taskId, original)
          } else if (field === "duration") {
            updateDuration(taskId, Number(original || 0))
          } else if (field === "progress") {
            setProgressDrafts((prev) => ({ ...prev, [taskId]: Number(original || 0) }))
          }
        }
      }
    } else if (cellKey) {
      const [taskId] = cellKey.split(":")
      if (taskId) void commitTaskRow(taskId)
    }
    setActiveEditCell(null)
    event.currentTarget.blur()
    requestAnimationFrame(() => gridRootRef.current?.focus())
  }

  function getChangedRows() {
    return tasks.filter((task) => {
      const draftDates = dateDrafts[task.id]
      const draftName = String(nameDrafts[task.id] ?? task.name).trim()
      const draftProgress = Number(progressDrafts[task.id] ?? task.progress)
      if (!draftDates) return false
      return (
        draftName !== task.name ||
        draftDates.start !== dateOrEmpty(task.start_date) ||
        draftDates.end !== dateOrEmpty(task.end_date) ||
        Math.round(draftProgress) !== Math.round(Number(task.progress) || 0)
      )
    })
  }

  async function refreshTasks() {
    const fresh = await fetchProjectTasks(projectId)
    setTasks(fresh)
    setDateDrafts(
      Object.fromEntries(
        fresh.map((t) => [t.id, { start: dateOrEmpty(t.start_date), end: dateOrEmpty(t.end_date) }])
      )
    )
    setProgressDrafts(Object.fromEntries(fresh.map((t) => [t.id, Number(t.progress) || 0])))
    setNameDrafts(Object.fromEntries(fresh.map((t) => [t.id, t.name])))
    setDurationDrafts(
      Object.fromEntries(
        fresh.map((t) => {
          const start = dateOrEmpty(t.start_date)
          const end = dateOrEmpty(t.end_date)
          return [t.id, start && end ? diffWorkingDays(start, end) : 0]
        })
      )
    )
    const [engine, boqLinks] = await Promise.all([
      fetchResourceEngine(projectId),
      fetchTaskBoqLinks(projectId),
    ])
    setResourceRows(engine.resources)
    setVacations(engine.vacations)
    setAssignments(engine.assignments)
    const boqByTask: Record<string, number> = {}
    for (const link of boqLinks) {
      boqByTask[link.task_id] = (boqByTask[link.task_id] ?? 0) + Number(link.boq_cost || 0)
    }
    setTaskBoqCostByTask(boqByTask)
  }

  function updateStartDate(taskId: string, nextStart: string) {
    setDateDrafts((prev) => {
      const end = prev[taskId]?.end ?? ""
      const normalizedEnd =
        nextStart && end && dateToMs(end) < dateToMs(nextStart) ? nextStart : end
      if (nextStart && normalizedEnd) {
        setDurationDrafts((dPrev) => ({
          ...dPrev,
          [taskId]: diffWorkingDays(nextStart, normalizedEnd),
        }))
      }
      return {
        ...prev,
        [taskId]: { start: nextStart, end: normalizedEnd },
      }
    })
  }

  function updateEndDate(taskId: string, nextEnd: string) {
    setDateDrafts((prev) => {
      const start = prev[taskId]?.start ?? ""
      const normalizedStart =
        nextEnd && start && dateToMs(nextEnd) < dateToMs(start) ? nextEnd : start
      if (normalizedStart && nextEnd) {
        setDurationDrafts((dPrev) => ({
          ...dPrev,
          [taskId]: diffWorkingDays(normalizedStart, nextEnd),
        }))
      }
      return {
        ...prev,
        [taskId]: { start: normalizedStart, end: nextEnd },
      }
    })
  }

  function updateDuration(taskId: string, nextDuration: number) {
    const clampedDuration = Math.max(0, Math.floor(nextDuration))
    setDurationDrafts((prev) => ({ ...prev, [taskId]: clampedDuration }))
    const start = dateDrafts[taskId]?.start ?? ""
    if (!start) return
    const end = calculateTaskEndDate(start, clampedDuration, taskId)
    setDateDrafts((prev) => ({
      ...prev,
      [taskId]: { start, end },
    }))
  }

  function collectBlockedVacationDates(taskId: string, extraResourceId?: string): Set<string> {
    const resourceIds = new Set(
      assignments.filter((a) => a.task_id === taskId).map((a) => a.resource_id)
    )
    if (extraResourceId) resourceIds.add(extraResourceId)
    if (resourceIds.size === 0) return EMPTY_HOLIDAY_DATES
    const blocked = new Set<string>()
    for (const vacation of vacations) {
      if (!resourceIds.has(vacation.resource_id)) continue
      let cursor = String(vacation.start_date ?? "").trim()
      const end = String(vacation.end_date ?? "").trim()
      if (!cursor || !end) continue
      while (dateToMs(cursor) <= dateToMs(end)) {
        blocked.add(cursor)
        cursor = shiftIso(cursor, 1)
      }
    }
    return blocked
  }

  function calculateTaskEndDate(
    startIso: string,
    durationDays: number,
    taskId: string,
    extraResourceId?: string
  ): string {
    const blockedDates = collectBlockedVacationDates(taskId, extraResourceId)
    if (blockedDates.size === 0) {
      return addWorkingDaysSync(startIso, durationDays, holidayDates)
    }
    const mergedCalendar = new Set<string>(holidayDates)
    for (const day of blockedDates) mergedCalendar.add(day)
    return addWorkingDaysSync(startIso, durationDays, mergedCalendar)
  }

  function diffWorkingDays(startIso: string, endIso: string): number {
    if (!holidayDates) return 0
    return diffWorkingDaysWithHolidaySet(startIso, endIso, holidayDates ?? EMPTY_HOLIDAY_DATES)
  }

  async function commitTaskRow(taskId: string) {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    const draft = dateDrafts[taskId]
    if (!draft) return
    const nextName = String(nameDrafts[taskId] ?? task.name).trim() || task.name
    const nextProgress = Number(progressDrafts[taskId] ?? task.progress)

    const hasChanged =
      nextName !== task.name ||
      draft.start !== dateOrEmpty(task.start_date) ||
      draft.end !== dateOrEmpty(task.end_date) ||
      Math.round(nextProgress) !== Math.round(Number(task.progress) || 0)
    if (!hasChanged) return

    setSyncState("saving")
    setSavingTaskId(taskId)
    try {
      await updateTaskGridRow({
        taskId,
        projectId,
        name: nextName,
        startDate: draft.start || null,
        endDate: draft.end || null,
        progress: nextProgress,
      })
      setTasks((prev) =>
        prev.map((row) =>
          row.id === taskId
            ? {
                ...row,
                name: nextName,
                start_date: draft.start || null,
                end_date: draft.end || null,
                progress: nextProgress,
              }
            : row
        )
      )
      setRecentlySavedTaskId(taskId)
      setSyncState("saved")
    } catch {
      setSyncState("error")
    } finally {
      setSavingTaskId((curr) => (curr === taskId ? null : curr))
    }
  }

  async function syncDraftsInBackground() {
    if (syncInFlightRef.current) return
    const changedRows = getChangedRows()
    if (changedRows.length === 0) {
      setSyncState("saved")
      return
    }
    syncInFlightRef.current = true
    setSyncState("saving")
    try {
      await Promise.all(
        changedRows.map((task) => {
          const draft = dateDrafts[task.id]!
          return updateTaskGridRow({
            taskId: task.id,
            projectId,
            name: String(nameDrafts[task.id] ?? task.name).trim() || task.name,
            startDate: draft.start || null,
            endDate: draft.end || null,
            progress: Number(progressDrafts[task.id] ?? task.progress),
          })
        })
      )
      const fresh = await fetchProjectTasks(projectId)
      setTasks(fresh)
      setDateDrafts(
        Object.fromEntries(
          fresh.map((t) => [t.id, { start: dateOrEmpty(t.start_date), end: dateOrEmpty(t.end_date) }])
        )
      )
      setNameDrafts(Object.fromEntries(fresh.map((t) => [t.id, t.name])))
      setProgressDrafts(Object.fromEntries(fresh.map((t) => [t.id, Number(t.progress) || 0])))
      setDurationDrafts(
        Object.fromEntries(
          fresh.map((t) => {
            const start = dateOrEmpty(t.start_date)
            const end = dateOrEmpty(t.end_date)
            return [t.id, start && end ? diffWorkingDays(start, end) : 0]
          })
        )
      )
      setSyncState("saved")
    } catch {
      setSyncState("error")
    } finally {
      syncInFlightRef.current = false
    }
  }

  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      void syncDraftsInBackground()
    }, 1200)
    return () => {
      window.clearTimeout(handle)
    }
  }, [nameDrafts, dateDrafts, progressDrafts, projectId, tasks])

  async function saveLayout() {
    const changedRows = getChangedRows()

    if (changedRows.length === 0) {
      toast.message("אין שינויים לשמירה.")
      return
    }

    setSavingLayout(true)
    try {
      for (const task of changedRows) {
        const draft = dateDrafts[task.id]!
        await updateTaskGridRow({
          taskId: task.id,
          projectId,
          name: String(nameDrafts[task.id] ?? task.name).trim() || task.name,
          startDate: draft.start || null,
          endDate: draft.end || null,
          progress: Number(progressDrafts[task.id] ?? task.progress),
        })
      }
      await refreshTasks()
      toast.success("הפריסה נשמרה בהצלחה ב-Supabase.")
    } catch (error) {
      toast.error(formatError(error))
    } finally {
      setSavingLayout(false)
    }
  }

  async function createHammockGroup() {
    const ids = [...selectedTaskIds]
    if (ids.length < 2) {
      toast.error("יש לבחור לפחות שתי משימות ליצירת ערסל.")
      return
    }
    const name = groupName.trim() || "קבוצת ערסל"
    try {
      await groupTasksAsHammock({ projectId, name, taskIds: ids })
      toast.success("קבוצת ערסל נוצרה בהצלחה.")
      setSelectedTaskIds(new Set())
      setGroupName("")
      await refreshTasks()
    } catch (error) {
      toast.error(formatError(error))
    }
  }

  async function generateFromContractBoq() {
    try {
      const result = await generateProjectWbsFromDocuments(projectId)
      toast.success(`הופק WBS אוטומטי (${result.phases} שלבים).`)
      await refreshTasks()
    } catch (error) {
      toast.error(formatError(error))
    }
  }

  function availableResourcesForTask(taskId: string): Array<{
    resource: ProjectResourceRow
    available: boolean
    reason: string
  }> {
    const task = taskById.get(taskId)
    if (!task?.start_date || !task.end_date) {
      return resources.map((resource) => ({
        resource,
        available: resource.availability_status === "available",
        reason:
          resource.availability_status === "available"
            ? "זמין"
            : "לא זמין לפי סטטוס",
      }))
    }
    return resources.map((resource) => {
      if (resource.availability_status !== "available") {
        return { resource, available: false, reason: "לא זמין לפי סטטוס" }
      }
      const hasVacation = vacations.some(
        (v) =>
          v.resource_id === resource.id &&
          overlapsDateRanges(task.start_date, task.end_date, v.start_date, v.end_date)
      )
      if (hasVacation) return { resource, available: false, reason: "בחופשה" }
      const hasOverlapAssignment = assignments.some(
        (a) =>
          a.resource_id === resource.id &&
          a.task_id !== taskId &&
          overlapsDateRanges(task.start_date, task.end_date, a.start_date, a.end_date)
      )
      if (hasOverlapAssignment) {
        return { resource, available: false, reason: "התנגשות שיבוץ" }
      }
      return { resource, available: true, reason: "זמין" }
    })
  }

  async function assignResource(taskId: string, resourceId: string) {
    if (!taskId || !resourceId) return
    try {
      await assignResourceToTask({
        projectId,
        taskId,
        resourceId,
      })
      const draft = dateDrafts[taskId]
      const nextName = String(nameDrafts[taskId] ?? taskById.get(taskId)?.name ?? "").trim()
      const nextProgress = Number(progressDrafts[taskId] ?? taskById.get(taskId)?.progress ?? 0)
      const start = draft?.start ?? dateOrEmpty(taskById.get(taskId)?.start_date)
      const duration = Math.max(0, Math.floor(Number(durationDrafts[taskId] ?? 0)))
      const end =
        start && duration >= 0
          ? calculateTaskEndDate(start, duration, taskId, resourceId)
          : draft?.end ?? dateOrEmpty(taskById.get(taskId)?.end_date)

      setAssignments((prev) => {
        if (prev.some((a) => a.task_id === taskId && a.resource_id === resourceId)) return prev
        return [
          ...prev,
          {
            id: `optimistic-${taskId}-${resourceId}`,
            task_id: taskId,
            resource_id: resourceId,
            project_id: projectId,
            task_name: taskById.get(taskId)?.name ?? "",
            start_date: start || null,
            end_date: end || null,
          },
        ]
      })

      if (start && end) {
        setDateDrafts((prev) => ({
          ...prev,
          [taskId]: { start, end },
        }))
        await updateTaskGridRow({
          taskId,
          projectId,
          name: nextName || taskById.get(taskId)?.name || "",
          startDate: start,
          endDate: end,
          progress: nextProgress,
        })
        setTasks((prev) =>
          prev.map((row) =>
            row.id === taskId
              ? {
                  ...row,
                  start_date: start,
                  end_date: end,
                }
              : row
          )
        )
        setRecentlySavedTaskId(taskId)
      }
      toast.success("המשאב שויך למשימה.")
      await refreshTasks()
    } catch (error) {
      toast.error(formatError(error))
    }
  }

  return (
    <div
      className="flex flex-col gap-2 bg-zinc-50 p-1.5 font-sans text-[13px] leading-tight text-zinc-900 dark:bg-bg-main dark:text-text-primary"
      style={{ fontFamily: "Inter, var(--font-heebo), ui-sans-serif, sans-serif" }}
    >
      <div className="rounded-sm border border-zinc-200 bg-white p-2 shadow-sm dark:border-border-muted dark:bg-bg-grid">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-zinc-600 dark:text-zinc-300">MS Project / WBS</p>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {projectName} <span className="text-xs text-zinc-600 dark:text-zinc-300">({projectCode})</span>
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="border border-zinc-200 bg-white font-mono tabular-nums text-zinc-900">תכנון: {currencyFormatter.format(summary.plannedCost)}</Badge>
            <Badge className="border border-zinc-200 bg-white font-mono tabular-nums text-zinc-900">בפועל: {currencyFormatter.format(summary.actualCost)}</Badge>
            <Badge className={financialHealthScore >= 85 ? "bg-emerald-500/20 text-emerald-300" : financialHealthScore >= 65 ? "bg-amber-500/20 text-amber-300" : "bg-red-500/20 text-red-300"}>
              בריאות פיננסית: {financialHealthScore}
            </Badge>
            <Badge className={syncState === "error" ? "bg-red-500/20 text-red-300" : syncState === "saving" ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"}>
              {syncState === "saving"
                ? "מסנכרן..."
                : syncState === "error"
                  ? "שגיאת סנכרון"
                  : "מסונכרן"}
            </Badge>
            <Button type="button" onClick={() => void saveLayout()} disabled={savingLayout} className="gap-2 rounded-sm border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100">
              <Save className="size-4" />
              שמירת פריסה
            </Button>
            <Button
              type="button"
              onClick={() => void generateFromContractBoq()}
              className="gap-2 rounded-sm border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100"
            >
              <Sparkles className="size-4" />
              Generate from Contract/BOQ
            </Button>
            <Button
              type="button"
              onClick={() => void createHammockGroup()}
              className="gap-2 rounded-sm border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100"
            >
              <Layers3 className="size-4" />
              קיבוץ (ערסל)
            </Button>
            <a
              href={`/marker-ofek/execution/gantt/${projectId}/field`}
              className="inline-flex items-center gap-2 rounded-sm border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
            >
              תצוגת שטח
            </a>
          </div>
        </div>
      </div>

      <div className="grid gap-1.5 md:grid-cols-6">
        <div className="rounded-sm border border-zinc-200 bg-white px-2 py-1.5 shadow-sm dark:border-border-muted dark:bg-bg-grid">
          <p className="text-[10px] uppercase tracking-wide text-zinc-600 dark:text-zinc-300">Health</p>
          <p className={projectHealthLabel === "Good" ? "font-mono tabular-nums text-[15px] font-semibold text-zinc-900 dark:text-zinc-100" : "font-mono tabular-nums text-[15px] font-semibold text-zinc-900 dark:text-zinc-100"}>
            {projectHealthLabel}
          </p>
        </div>
        <div className="rounded-sm border border-zinc-200 bg-white px-2 py-1.5 shadow-sm dark:border-border-muted dark:bg-bg-grid">
          <p className="text-[10px] uppercase tracking-wide text-zinc-600 dark:text-zinc-300">Delay</p>
          <p className="font-mono tabular-nums text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">{criticalDelayDays}d</p>
        </div>
        <div className="rounded-sm border border-zinc-200 bg-white px-2 py-1.5 shadow-sm dark:border-border-muted dark:bg-bg-grid">
          <p className="text-[10px] uppercase tracking-wide text-zinc-600 dark:text-zinc-300">Billing Status</p>
          <p className="font-mono tabular-nums text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">{billingStatus}</p>
        </div>
        <div className="rounded-sm border border-zinc-200 bg-white px-2 py-1.5 shadow-sm dark:border-border-muted dark:bg-bg-grid">
          <p className="text-[10px] uppercase tracking-wide text-zinc-600 dark:text-zinc-300">WIP Value</p>
          <p className="font-mono tabular-nums text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">{currencyFormatter.format(wipValueIls)}</p>
        </div>
        <div className="flex items-center justify-center rounded-sm border border-zinc-200 bg-white px-2 py-1.5 shadow-sm dark:border-border-muted dark:bg-bg-grid">
          <div className="flex items-center gap-1 border border-zinc-200 bg-white p-0.5 dark:border-border-muted dark:bg-bg-main">
            <button
              onClick={() => setTheme("swiss")}
              className={`px-2 py-1 text-xs radius-tokens ${theme === "swiss" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
            >
              SWISS
            </button>
            <button
              onClick={() => setTheme("command")}
              className={`px-2 py-1 text-xs radius-tokens ${theme === "command" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
            >
              COMMAND
            </button>
            <button
              onClick={() => setTheme("monolith")}
              className={`px-2 py-1 text-xs radius-tokens ${theme === "monolith" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
            >
              MONOLITH
            </button>
          </div>
        </div>
        <div className="rounded-sm border border-zinc-200 bg-white px-2 py-1.5 shadow-sm dark:border-border-muted dark:bg-bg-grid">
          <p className="text-[10px] uppercase tracking-wide text-zinc-600 dark:text-zinc-300">Waste</p>
          <p className="font-mono tabular-nums text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">{currencyFormatter.format(resourceWasteIls)}</p>
        </div>
      </div>

      <div ref={gridRootRef} tabIndex={-1} className="flex flex-col gap-2 text-zinc-900 outline-none dark:text-text-primary lg:flex-row">
        <Card className="order-1 rounded-sm border border-zinc-200 bg-white shadow-sm dark:border-border-muted dark:bg-bg-grid lg:order-1 lg:basis-[36%]">
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-1.5 text-zinc-900 dark:text-zinc-100">
              <FolderTree className="size-3.5 text-zinc-600 dark:text-zinc-300" />
              טבלת WBS
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-[0.4fr_1.9fr_0.95fr_0.95fr_0.65fr_0.8fr_0.9fr_1.3fr] border-b border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-zinc-900 dark:border-border-muted dark:bg-bg-main dark:text-zinc-100">
              <div className="text-center">
                <input
                  type="checkbox"
                  checked={selectedTaskIds.size > 0 && renderedRows.every((r) => selectedTaskIds.has(r.id))}
                  onChange={(e) => {
                    setSelectedTaskIds((prev) => {
                      const next = new Set(prev)
                      if (e.target.checked) {
                        for (const row of renderedRows) next.add(row.id)
                      } else {
                        for (const row of renderedRows) next.delete(row.id)
                      }
                      return next
                    })
                  }}
                />
              </div>
              <div className="space-y-0.5">
                <div>שם משימה</div>
                <Input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="שם קבוצת ערסל"
                  className="h-5 border-zinc-200 bg-white px-1.5 text-[10px] text-zinc-900 dark:border-border-muted dark:bg-bg-grid dark:text-zinc-100"
                />
              </div>
              <div>התחלה מתוכננת</div>
              <div>סיום מתוכנן</div>
              <div>משך (ימים)</div>
              <div>Percent Complete</div>
              <div>Cost Impact</div>
              <div>כוח אדם</div>
            </div>
            <div ref={tableScrollRef} className="max-h-[72vh] overflow-auto" onScroll={(e) => syncScroll("table", e.currentTarget.scrollTop, e.currentTarget)}>
              <div style={{ paddingTop: spacerTop, paddingBottom: spacerBottom }}>
                {renderedRows.map((task) => {
                  const hasChildren = maps.hasChildren.has(task.id)
                  const isExpanded = expandedTaskIds.has(task.id)
                  const isSavingRow = savingTaskId === task.id
                  const isJustSavedRow = recentlySavedTaskId === task.id
                  return (
                    <div
                      key={task.id}
                      data-grid-row-id={task.id}
                      className={`grid grid-cols-[0.4fr_1.9fr_0.95fr_0.95fr_0.65fr_0.8fr_0.9fr_1.3fr] items-center border-b border-zinc-200 px-1.5 py-0 text-[11px] text-zinc-900 hover:bg-zinc-50 dark:border-border-muted dark:text-zinc-100 dark:hover:bg-bg-main ${isJustSavedRow ? "bg-emerald-50/70 dark:bg-emerald-900/10" : ""}`}
                      style={{ minHeight: ROW_HEIGHT }}
                    >
                      <div className="text-center">
                        <input
                          type="checkbox"
                          checked={selectedTaskIds.has(task.id)}
                          onChange={(e) =>
                            setSelectedTaskIds((prev) => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(task.id)
                              else next.delete(task.id)
                              return next
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center gap-0.5 text-start" style={{ paddingInlineStart: `${task.depth * 12}px` }}>
                        {hasChildren ? (
                          <button
                            type="button"
                            className="p-0 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-bg-main"
                            onClick={(e) => {
                              e.stopPropagation()
                              setExpandedTaskIds((prev) => {
                                const next = new Set(prev)
                                if (next.has(task.id)) next.delete(task.id)
                                else next.add(task.id)
                                return next
                              })
                            }}
                          >
                            {isExpanded ? <ChevronDown className="size-4" /> : <ChevronLeft className="size-4" />}
                          </button>
                        ) : <span className="inline-block size-3.5" />}
                        <Input
                          value={nameDrafts[task.id] ?? task.name}
                          readOnly={activeEditCell !== `${task.id}:name`}
                          onClick={() => {
                            setActiveEditCell(`${task.id}:name`)
                            editCellInitialValueRef.current = nameDrafts[task.id] ?? task.name
                          }}
                          onBlur={() => {
                            setActiveEditCell((curr) => (curr === `${task.id}:name` ? null : curr))
                            void commitTaskRow(task.id)
                          }}
                          onKeyDown={handleInlineEditKeyDown}
                          onChange={(e) =>
                            setNameDrafts((prev) => ({
                              ...prev,
                              [task.id]: e.target.value,
                            }))
                          }
                          className="h-5 border-zinc-200 bg-white px-1.5 text-[11px] text-zinc-900 focus:border-zinc-400 focus:ring-0 dark:border-border-muted dark:bg-bg-grid dark:text-zinc-100"
                        />
                        {isSavingRow ? (
                          <span className="font-mono tabular-nums text-[9px] text-slate-500 dark:text-slate-400">Saving...</span>
                        ) : null}
                      </div>
                      <Input
                        type="date"
                        className="h-5 border-zinc-200 bg-white px-1.5 text-[11px] font-mono tabular-nums text-zinc-900 focus:border-zinc-400 focus:ring-0 dark:border-border-muted dark:bg-bg-grid dark:text-zinc-100"
                        value={dateDrafts[task.id]?.start ?? dateOrEmpty(task.start_date)}
                        readOnly={activeEditCell !== `${task.id}:start`}
                        onClick={() => {
                          setActiveEditCell(`${task.id}:start`)
                          editCellInitialValueRef.current =
                            dateDrafts[task.id]?.start ?? dateOrEmpty(task.start_date)
                        }}
                        onBlur={() => {
                          setActiveEditCell((curr) => (curr === `${task.id}:start` ? null : curr))
                          void commitTaskRow(task.id)
                        }}
                        onKeyDown={handleInlineEditKeyDown}
                        onChange={(e) => updateStartDate(task.id, e.target.value)}
                      />
                      <Input
                        type="date"
                        className="h-5 border-zinc-200 bg-white px-1.5 text-[11px] font-mono tabular-nums text-zinc-900 focus:border-zinc-400 focus:ring-0 dark:border-border-muted dark:bg-bg-grid dark:text-zinc-100"
                        value={dateDrafts[task.id]?.end ?? dateOrEmpty(task.end_date)}
                        readOnly={activeEditCell !== `${task.id}:end`}
                        onClick={() => {
                          setActiveEditCell(`${task.id}:end`)
                          editCellInitialValueRef.current =
                            dateDrafts[task.id]?.end ?? dateOrEmpty(task.end_date)
                        }}
                        onBlur={() => {
                          setActiveEditCell((curr) => (curr === `${task.id}:end` ? null : curr))
                          void commitTaskRow(task.id)
                        }}
                        onKeyDown={handleInlineEditKeyDown}
                        onChange={(e) => updateEndDate(task.id, e.target.value)}
                      />
                      <Input
                        type="number"
                        min={0}
                        className="h-5 border-zinc-200 bg-white px-1.5 text-[11px] font-mono tabular-nums text-zinc-900 focus:border-zinc-400 focus:ring-0 dark:border-border-muted dark:bg-bg-grid dark:text-zinc-100"
                        value={Number(durationDrafts[task.id] ?? 0)}
                        readOnly={activeEditCell !== `${task.id}:duration`}
                        onClick={() => {
                          setActiveEditCell(`${task.id}:duration`)
                          editCellInitialValueRef.current = String(Number(durationDrafts[task.id] ?? 0))
                        }}
                        onBlur={() => {
                          setActiveEditCell((curr) => (curr === `${task.id}:duration` ? null : curr))
                          void commitTaskRow(task.id)
                        }}
                        onKeyDown={handleInlineEditKeyDown}
                        onChange={(e) => updateDuration(task.id, Number(e.target.value))}
                      />
                      <div className="space-y-0.5">
                        <Input
                          type="range"
                          min={0}
                          max={100}
                          className="h-4"
                          value={Number(progressDrafts[task.id] ?? task.progress)}
                          onFocus={() => {
                            setActiveEditCell(`${task.id}:progress`)
                            editCellInitialValueRef.current = String(Number(progressDrafts[task.id] ?? task.progress))
                          }}
                          onBlur={() => {
                            setActiveEditCell((curr) => (curr === `${task.id}:progress` ? null : curr))
                            void commitTaskRow(task.id)
                          }}
                          onKeyDown={handleInlineEditKeyDown}
                          onChange={(e) =>
                            setProgressDrafts((prev) => ({
                              ...prev,
                              [task.id]: Number(e.target.value),
                            }))
                          }
                        />
                        <Progress value={Number(progressDrafts[task.id] ?? task.progress)} className="h-[3px] bg-sky-200 [&>div]:bg-emerald-600" />
                        {(() => {
                          const boqCost = Number(taskBoqCostByTask[task.id] ?? 0)
                          const progressPercent = clamp(Number(progressDrafts[task.id] ?? task.progress), 0, 100)
                          const previewAmount = boqCost * (progressPercent / 100)
                          if (boqCost <= 0 || progressPercent <= 0 || progressPercent >= 100) return null
                          return (
                            <p className="font-mono tabular-nums text-[9px] text-zinc-600 dark:text-zinc-300">
                              Partial Preview: {currencyFormatter.format(previewAmount)}
                            </p>
                          )
                        })()}
                      </div>
                      <div className="font-mono tabular-nums text-[10px] text-zinc-900 dark:text-zinc-100">
                        {currencyFormatter.format(Number(taskCostImpactById[task.id] ?? 0))}
                      </div>
                      <div className="space-y-0.5">
                        <Input
                          value={resourceFilterByTask[task.id] ?? ""}
                          onChange={(e) =>
                            setResourceFilterByTask((prev) => ({
                              ...prev,
                              [task.id]: e.target.value,
                            }))
                          }
                          placeholder="חיפוש עובד..."
                          className="h-5 border-zinc-200 bg-white px-1.5 text-[10px] text-zinc-900 placeholder:text-zinc-500 focus:border-zinc-400 focus:ring-0 dark:border-border-muted dark:bg-bg-grid dark:text-zinc-100"
                        />
                        <select
                          className="h-5 w-full border border-zinc-200 bg-white px-1.5 text-[10px] text-zinc-900 outline-none focus:border-zinc-400 focus:ring-0 dark:border-border-muted dark:bg-bg-grid dark:text-zinc-100"
                          defaultValue=""
                          onChange={(e) => {
                            const resourceId = e.target.value
                            if (!resourceId) return
                            void assignResource(task.id, resourceId)
                            e.currentTarget.value = ""
                          }}
                        >
                          <option value="">הקצאת כוח אדם...</option>
                          {availableResourcesForTask(task.id)
                            .filter(({ resource }) =>
                              `${resource.name} ${resource.profession}`
                                .toLowerCase()
                                .includes((resourceFilterByTask[task.id] ?? "").trim().toLowerCase())
                            )
                            .map(({ resource, available, reason }) => (
                              <option key={resource.id} value={resource.id} disabled={!available}>
                                {resource.name} - {reason}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="order-2 rounded-sm border border-zinc-200 bg-white shadow-sm dark:border-border-muted dark:bg-bg-grid lg:order-2 lg:basis-[64%]">
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-1.5 text-zinc-900 dark:text-zinc-100">
              <CalendarDays className="size-3.5 text-zinc-600 dark:text-zinc-300" />
              ציר זמן (חודשים / שבועות)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-border-muted dark:bg-bg-main/95">
              <div className="relative h-6 min-w-[980px]">
                {monthSegments.map((segment, i) => (
                  <div key={`m-${i}`} className="absolute top-0 h-6 border-l border-zinc-200 px-1 text-[10px] font-medium text-zinc-900 dark:border-border-muted dark:text-zinc-100" style={{ right: `${segment.right}%`, width: `${segment.width}%` }}>
                    {segment.label}
                  </div>
                ))}
              </div>
              <div className="relative h-6 min-w-[980px] border-t border-zinc-200 dark:border-border-muted">
                {weekSegments.map((segment, i) => (
                  <div key={`w-${i}`} className="absolute top-0 h-6 border-l border-zinc-200 px-1 text-[9px] text-zinc-600 dark:border-border-muted dark:text-zinc-300" style={{ right: `${segment.right}%`, width: `${segment.width}%` }}>
                    {segment.label}
                  </div>
                ))}
              </div>
            </div>
            <div ref={timelineScrollRef} className="max-h-[66vh] overflow-auto" onScroll={(e) => syncScroll("timeline", e.currentTarget.scrollTop, e.currentTarget)}>
              <div
                ref={timelineWidthRef}
                className="relative min-w-[980px]"
                style={{
                  paddingTop: spacerTop,
                  paddingBottom: spacerBottom,
                  backgroundImage:
                    "linear-gradient(to right, rgba(226,232,240,1) 1px, transparent 1px), linear-gradient(to bottom, rgba(226,232,240,1) 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              >
                {todayLineRight != null ? (
                  <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-red-500/90" style={{ right: `${todayLineRight}%` }} />
                ) : null}
                {renderedRows.map((task) => {
                  const startIso = dateOrEmpty(task.start_date)
                  const endIso = dateOrEmpty(task.end_date)
                  if (!startIso || !endIso) {
                    return <div key={task.id} className="border-b border-zinc-200 px-1.5 py-0 text-[10px] text-zinc-600 dark:border-border-muted dark:text-zinc-300" style={{ minHeight: ROW_HEIGHT }}>{task.name}</div>
                  }
                  const offsetDays = Math.max(0, differenceInCalendarDays(parseISO(startIso), range.min))
                  const durationDays = Math.max(1, differenceInCalendarDays(parseISO(endIso), parseISO(startIso)) + 1)
                  const right = rtlOffsetPercent(offsetDays, range.days)
                  const width = Math.max((durationDays / range.days) * 100, 1.8)
                  const progress = clamp(Number(progressDrafts[task.id] ?? task.progress), 0, 100)
                  const hasDelay = Boolean(task.actual_end_date) && dateOrEmpty(task.actual_end_date) > endIso
                  const hasConflict = conflictTaskIds.has(task.id)
                  const assignedNames = assignedNamesByTask.get(task.id) ?? []
                  const dragDelta = dragState?.taskId === task.id ? dragState.deltaDays : 0
                  const deltaPercent = (dragDelta / Math.max(1, range.days)) * 100
                  return (
                    <div key={task.id} className="relative border-b border-zinc-200 px-1.5 py-0.5 dark:border-border-muted" style={{ minHeight: ROW_HEIGHT }}>
                      <div className="mb-0.5 flex items-center gap-1 text-[10px] text-zinc-900 dark:text-zinc-100">
                        <span>{task.name}</span>
                        {hasConflict ? (
                          <span className="inline-flex items-center gap-1 rounded-sm bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">
                            <AlertTriangle className="size-3" />
                            Double-Booking
                          </span>
                        ) : null}
                      </div>
                      <div className="relative h-5 bg-transparent">
                        <div
                          className="absolute top-1/2 h-3.5 -translate-y-1/2 border border-sky-600 bg-sky-500"
                          style={{
                            right: `${right + deltaPercent}%`,
                            width: `${width}%`,
                            border:
                              hasConflict || hasDelay
                                ? "1px solid rgb(220 38 38)"
                                : "1px solid rgb(63 63 70)",
                            background:
                              hasConflict
                                ? "rgb(239 68 68)"
                                : "rgb(63 63 70)",
                          }}
                          title={`מתוכנן: ${formatHebDate(startIso)} - ${formatHebDate(endIso)} | בפועל/מתוכנן: ${currencyFormatter.format(perTaskVariance[task.id]?.actualCost ?? task.actual_cost)} / ${currencyFormatter.format(perTaskVariance[task.id]?.estimatedCost ?? task.estimated_cost)}`}
                          onMouseDown={(e) =>
                            setDragState({
                              taskId: task.id,
                              startX: e.clientX,
                              baseStart: startIso,
                              baseEnd: endIso,
                              deltaDays: 0,
                            })
                          }
                        />
                        <div
                          className="pointer-events-none absolute top-1/2 h-[3px] -translate-y-1/2 bg-emerald-600"
                          style={{ right: `${right + deltaPercent}%`, width: `${(width * progress) / 100}%` }}
                        />
                        <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5 font-mono tabular-nums text-[9px] text-zinc-900 dark:text-zinc-100">
                          <GripHorizontal className="size-3" />
                          {formatHebDate(startIso)} ← {formatHebDate(endIso)}
                        </div>
                        {assignedNames.length > 0 ? (
                          <span className="absolute top-1/2 -translate-y-1/2 border border-zinc-200 bg-white px-1 py-0 text-[9px] font-medium tracking-tight text-zinc-900 dark:border-border-muted dark:bg-bg-main dark:text-zinc-100" style={{ right: `${Math.max(0, right + deltaPercent - 8)}%` }}>
                            {assignedNames.join(", ")}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )
                })}

                {(() => {
                  const width = timelineWidthRef.current?.getBoundingClientRect().width || 980
                  const centers: Record<string, number> = {}
                  for (let i = 0; i < renderedRows.length; i++) {
                    centers[renderedRows[i]!.id] = spacerTop + i * ROW_HEIGHT + ROW_HEIGHT / 2
                  }
                  const lines: Array<{ fromX: number; toX: number; fromY: number; toY: number }> = []
                  for (const task of renderedRows) {
                    const startIso = dateOrEmpty(task.start_date)
                    if (!startIso) continue
                    for (const depId of task.dependency_ids ?? []) {
                      const source = renderedRows.find((r) => r.id === depId)
                      if (!source?.start_date || !source.end_date) continue
                      const sourceOffset = Math.max(0, differenceInCalendarDays(parseISO(source.start_date), range.min))
                      const sourceDur = Math.max(1, differenceInCalendarDays(parseISO(source.end_date), parseISO(source.start_date)) + 1)
                      const targetOffset = Math.max(0, differenceInCalendarDays(parseISO(startIso), range.min))
                      const sourceRight = rtlOffsetPercent(sourceOffset, range.days)
                      const sourceWidth = (sourceDur / range.days) * width
                      const sourceRightPx = (sourceRight / 100) * width
                      const targetRight = rtlOffsetPercent(targetOffset, range.days)
                      const fromX = rightPercentToLeftX((sourceRightPx + sourceWidth) / width * 100, width)
                      const toX = rightPercentToLeftX(targetRight, width)
                      lines.push({
                        fromX,
                        toX,
                        fromY: centers[source.id] ?? 0,
                        toY: centers[task.id] ?? 0,
                      })
                    }
                  }
                  return (
                    <svg className="pointer-events-none absolute inset-0">
                      <defs>
                        <marker id="dep-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                          <path d="M0,0 L0,6 L6,3 z" fill="rgba(148,163,184,0.8)" />
                        </marker>
                      </defs>
                      {lines.map((line, i) => (
                        <path
                          key={`dep-${i}`}
                          d={`M ${line.fromX} ${line.fromY} L ${(line.fromX + line.toX) / 2} ${line.fromY} L ${(line.fromX + line.toX) / 2} ${line.toY} L ${line.toX} ${line.toY}`}
                          stroke="rgba(148,163,184,0.72)"
                          strokeWidth="1.4"
                          fill="none"
                          markerEnd="url(#dep-arrow)"
                        />
                      ))}
                    </svg>
                  )
                })()}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  )
}
