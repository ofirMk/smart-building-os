"use client"

import * as React from "react"
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns"
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  FolderTree,
  GripHorizontal,
  Plus,
  Save,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Label } from "@/components/ui/label"
import {
  createTask,
  fetchProjectTasks,
  type GanttTaskRow,
  updateTaskProgress,
  updateTaskDatesWithDependencies,
} from "@/lib/actions/gantt-actions"
import { formatError } from "@/lib/utils"

type GanttClientProps = {
  projectId: string
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

type FlatTask = GanttTaskRow & { depth: number }
type TreeMaps = {
  byParent: Map<string | null, GanttTaskRow[]>
  hasChildren: Set<string>
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
  const base = parseISO(isoDate)
  return format(addDays(base, deltaDays), "yyyy-MM-dd")
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
  const walk = (parentId: string | null, depth: number, force = false) => {
    const children = maps.byParent.get(parentId) ?? []
    for (const child of children) {
      if (visited.has(child.id)) continue
      visited.add(child.id)
      out.push({ ...child, depth })
      if (force || expanded.has(child.id)) {
        walk(child.id, depth + 1, false)
      }
    }
  }

  walk(null, 0, true)
  for (const task of allTasks) {
    if (!visited.has(task.id)) out.push({ ...task, depth: 0 })
  }
  return out
}

function timelineRange(tasks: FlatTask[]) {
  const dated = tasks.filter((t) => t.start_date && t.end_date)
  if (dated.length === 0) {
    const start = new Date()
    const end = addDays(start, 30)
    return { min: start, max: end, days: 31 }
  }

  let min = parseISO(dated[0]!.start_date as string)
  let max = parseISO(dated[0]!.end_date as string)
  for (const row of dated) {
    const s = parseISO(row.start_date as string)
    const e = parseISO(row.end_date as string)
    if (s < min) min = s
    if (e > max) max = e
  }
  const days = Math.max(1, differenceInCalendarDays(max, min) + 1)
  return { min, max, days }
}

export default function GanttClient(props: GanttClientProps) {
  const { projectId, perTaskVariance, summary } = props
  const [tasks, setTasks] = React.useState<GanttTaskRow[]>(props.initialTasks)
  const [savingTaskId, setSavingTaskId] = React.useState<string | null>(null)
  const [expandedTaskIds, setExpandedTaskIds] = React.useState<Set<string>>(
    () => new Set()
  )
  const [scrollTop, setScrollTop] = React.useState(0)
  const [modalOpen, setModalOpen] = React.useState(false)
  const [newTask, setNewTask] = React.useState({
    name: "",
    parentId: "",
    startDate: "",
    endDate: "",
    estimatedCost: "",
  })
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
  const syncLockRef = React.useRef(false)

  const ROW_HEIGHT = 78
  const OVERSCAN = 8

  const maps = React.useMemo(() => buildTreeMaps(tasks), [tasks])
  const visibleTasks = React.useMemo(
    () => flattenVisible(maps, expandedTaskIds, tasks),
    [maps, expandedTaskIds, tasks]
  )
  const [dateDrafts, setDateDrafts] = React.useState<Record<string, { start: string; end: string }>>(() => {
    const base: Record<string, { start: string; end: string }> = {}
    for (const t of props.initialTasks) {
      base[t.id] = {
        start: dateOrEmpty(t.start_date),
        end: dateOrEmpty(t.end_date),
      }
    }
    return base
  })
  const [progressDrafts, setProgressDrafts] = React.useState<Record<string, number>>(
    () =>
      Object.fromEntries(
        props.initialTasks.map((t) => [t.id, Number(t.progress) || 0])
      ) as Record<string, number>
  )

  const range = React.useMemo(() => timelineRange(visibleTasks), [visibleTasks])
  const totalHeight = visibleTasks.length * ROW_HEIGHT
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIndex = Math.min(
    visibleTasks.length,
    Math.ceil((scrollTop + 700) / ROW_HEIGHT) + OVERSCAN
  )
  const renderedRows = visibleTasks.slice(startIndex, endIndex)
  const spacerTop = startIndex * ROW_HEIGHT
  const spacerBottom = Math.max(0, totalHeight - endIndex * ROW_HEIGHT)

  React.useEffect(() => {
    const nextExpanded = new Set<string>()
    for (const row of visibleTasks) {
      if (row.depth === 0) nextExpanded.add(row.id)
    }
    if (nextExpanded.size > 0 && expandedTaskIds.size === 0) {
      setExpandedTaskIds(nextExpanded)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.length])

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
        toast.success("המשימה הוזזה והמערכת עדכנה תלותים.")
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
  }, [dragState, projectId, range.days])

  function syncScroll(
    source: "table" | "timeline",
    nextTop: number,
    element: HTMLDivElement
  ) {
    if (syncLockRef.current) return
    syncLockRef.current = true
    setScrollTop(nextTop)
    const other =
      source === "table" ? timelineScrollRef.current : tableScrollRef.current
    if (other && other !== element) other.scrollTop = nextTop
    requestAnimationFrame(() => {
      syncLockRef.current = false
    })
  }

  async function refreshTasks() {
    const fresh = await fetchProjectTasks(projectId)
    setTasks(fresh)
    setDateDrafts((prev) => {
      const next = { ...prev }
      for (const t of fresh) {
        next[t.id] = {
          start: dateOrEmpty(t.start_date),
          end: dateOrEmpty(t.end_date),
        }
      }
      return next
    })
    setProgressDrafts(
      Object.fromEntries(fresh.map((t) => [t.id, Number(t.progress) || 0]))
    )
  }

  async function saveTaskDates(task: FlatTask) {
    const draft = dateDrafts[task.id] ?? {
      start: dateOrEmpty(task.start_date),
      end: dateOrEmpty(task.end_date),
    }
    setSavingTaskId(task.id)
    try {
      await updateTaskDatesWithDependencies({
        taskId: task.id,
        projectId,
        startDate: draft.start || null,
        endDate: draft.end || null,
      })
      toast.success("התאריכים עודכנו כולל הסטת תלותים.")
      await refreshTasks()
    } catch (error) {
      toast.error(formatError(error))
    } finally {
      setSavingTaskId(null)
    }
  }

  async function saveProgress(taskId: string) {
    const progress = Math.max(
      0,
      Math.min(100, Number(progressDrafts[taskId] ?? 0) || 0)
    )
    setSavingTaskId(taskId)
    try {
      await updateTaskProgress({
        taskId,
        projectId,
        progress,
      })
      toast.success("אחוז התקדמות עודכן.")
      await refreshTasks()
    } catch (error) {
      toast.error(formatError(error))
    } finally {
      setSavingTaskId(null)
    }
  }

  async function createNewTask() {
    if (!newTask.name.trim()) {
      toast.error("נא למלא שם משימה.")
      return
    }
    try {
      await createTask({
        projectId,
        parentId: newTask.parentId || null,
        name: newTask.name,
        startDate: newTask.startDate || null,
        endDate: newTask.endDate || null,
        estimatedCost: Number(newTask.estimatedCost || 0),
      })
      toast.success("משימה חדשה נוספה בהצלחה.")
      setModalOpen(false)
      setNewTask({
        name: "",
        parentId: "",
        startDate: "",
        endDate: "",
        estimatedCost: "",
      })
      await refreshTasks()
    } catch (error) {
      toast.error(formatError(error))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="bg-violet-600/20 text-violet-200">
          עלות מתוכננת: {currencyFormatter.format(summary.plannedCost)}
        </Badge>
        <Badge variant="secondary" className="bg-slate-700/60 text-slate-100">
          עלות בפועל: {currencyFormatter.format(summary.actualCost)}
        </Badge>
        <Badge
          variant="secondary"
          className={
            summary.status === "over"
              ? "bg-red-500/20 text-red-300"
              : summary.status === "under"
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-amber-500/20 text-amber-300"
          }
        >
          סטייה: {currencyFormatter.format(summary.variance)} ({summary.variancePercent.toFixed(1)}%)
        </Badge>
        </div>
        <Button
          type="button"
          className="gap-2 bg-violet-600 text-white hover:bg-violet-500"
          onClick={() => setModalOpen(true)}
        >
          <Plus className="size-4" />
          New Task
        </Button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <Card className="border-violet-500/20 bg-slate-950/40 lg:basis-[35%]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <FolderTree className="size-5 text-violet-300" />
              WBS
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-[1.3fr_1fr_0.9fr] border-b border-slate-700/70 px-3 py-2 text-xs text-slate-300">
              <div>משימה</div>
              <div>תאריכים</div>
              <div>התקדמות</div>
            </div>
            <div
              ref={tableScrollRef}
              className="max-h-[72vh] overflow-auto"
              onScroll={(e) =>
                syncScroll(
                  "table",
                  e.currentTarget.scrollTop,
                  e.currentTarget as HTMLDivElement
                )
              }
            >
              <div style={{ paddingTop: spacerTop, paddingBottom: spacerBottom }}>
                {renderedRows.map((task) => {
                  const hasChildren = maps.hasChildren.has(task.id)
                  const isExpanded = expandedTaskIds.has(task.id)
                  const draft = dateDrafts[task.id] ?? {
                    start: dateOrEmpty(task.start_date),
                    end: dateOrEmpty(task.end_date),
                  }
                  const costs = perTaskVariance[task.id] ?? {
                    estimatedCost: task.estimated_cost,
                    actualCost: task.actual_cost,
                  }
                  return (
                    <div
                      key={task.id}
                      className="grid grid-cols-[1.3fr_1fr_0.9fr] items-start gap-2 border-b border-slate-800/60 px-3 py-2"
                      style={{ minHeight: ROW_HEIGHT }}
                    >
                      <div className="text-start">
                        <div
                          className="flex items-center gap-1.5"
                          style={{ paddingInlineStart: `${task.depth * 14}px` }}
                        >
                          {hasChildren ? (
                            <button
                              type="button"
                              className="rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                              onClick={() =>
                                setExpandedTaskIds((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(task.id)) next.delete(task.id)
                                  else next.add(task.id)
                                  return next
                                })
                              }
                            >
                              {isExpanded ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronLeft className="size-4" />
                              )}
                            </button>
                          ) : (
                            <span className="inline-block size-4" />
                          )}
                          <p className="text-sm font-medium text-slate-100">{task.name}</p>
                        </div>
                        <div className="mt-1">
                          <Badge variant="outline" className="text-xs">
                            {currencyFormatter.format(costs.actualCost)} / {currencyFormatter.format(costs.estimatedCost)}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <div className="space-y-1">
                          <Input
                            type="date"
                            value={draft.start}
                            onChange={(e) =>
                              setDateDrafts((prev) => ({
                                ...prev,
                                [task.id]: { ...draft, start: e.target.value },
                              }))
                            }
                            className="h-8"
                          />
                          <Input
                            type="date"
                            value={draft.end}
                            onChange={(e) =>
                              setDateDrafts((prev) => ({
                                ...prev,
                                [task.id]: { ...draft, end: e.target.value },
                              }))
                            }
                            className="h-8"
                          />
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 gap-1 bg-violet-600 text-white hover:bg-violet-500"
                            disabled={savingTaskId === task.id}
                            onClick={() => void saveTaskDates(task)}
                          >
                            <Save className="size-3.5" />
                            עדכן
                          </Button>
                        </div>
                      </div>
                      <div>
                        <div className="space-y-1">
                          <Input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.max(
                              0,
                              Math.min(
                                100,
                                Number(progressDrafts[task.id] ?? task.progress)
                              )
                            )}
                            onChange={(e) =>
                              setProgressDrafts((prev) => ({
                                ...prev,
                                [task.id]: Number(e.target.value),
                              }))
                            }
                            className="h-7"
                          />
                          <div className="flex items-center gap-1">
                            <p className="text-xs text-slate-300">
                              {Math.round(
                                Number(progressDrafts[task.id] ?? task.progress)
                              )}
                              %
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-violet-300 hover:bg-slate-800"
                              disabled={savingTaskId === task.id}
                              onClick={() => void saveProgress(task.id)}
                            >
                              <Save className="size-3.5" />
                            </Button>
                          </div>
                          <Progress
                            value={Number(progressDrafts[task.id] ?? task.progress)}
                            className="h-1.5"
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-violet-500/20 bg-slate-950/40 lg:basis-[65%]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <CalendarDays className="size-5 text-violet-300" />
              Timeline
              <span className="text-xs font-normal text-slate-400">
                {format(range.min, "dd/MM/yyyy")} <MoveHorizontal className="mx-1 inline size-3" /> {format(range.max, "dd/MM/yyyy")}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div
              ref={timelineScrollRef}
              className="max-h-[72vh] overflow-auto"
              onScroll={(e) =>
                syncScroll(
                  "timeline",
                  e.currentTarget.scrollTop,
                  e.currentTarget as HTMLDivElement
                )
              }
            >
              <div
                ref={timelineWidthRef}
                className="relative min-w-[980px]"
                style={{ paddingTop: spacerTop, paddingBottom: spacerBottom }}
              >
              {renderedRows.map((task, index) => {
                if (!task.start_date || !task.end_date) {
                  return (
                    <div
                      key={task.id}
                      className="flex items-center rounded-md border-b border-slate-800/60 px-3 py-2 text-xs text-slate-400"
                      style={{ minHeight: ROW_HEIGHT }}
                    >
                      {task.name}: ללא טווח תאריכים מתוכנן
                    </div>
                  )
                }

                const start = parseISO(task.start_date)
                const end = parseISO(task.end_date)
                const offsetDays = Math.max(0, differenceInCalendarDays(start, range.min))
                const durationDays = Math.max(1, differenceInCalendarDays(end, start) + 1)
                const right = (offsetDays / range.days) * 100
                const width = Math.max((durationDays / range.days) * 100, 1.8)
                const hasDelay =
                  Boolean(task.actual_end_date) &&
                  Boolean(task.end_date) &&
                  dateOrEmpty(task.actual_end_date) > dateOrEmpty(task.end_date)
                const draftProgress = Math.max(
                  0,
                  Math.min(100, Number(progressDrafts[task.id] ?? task.progress))
                )
                const dragDelta =
                  dragState && dragState.taskId === task.id
                    ? dragState.deltaDays
                    : 0
                const deltaPercent =
                  (dragDelta / Math.max(1, range.days)) * 100

                return (
                  <div
                    key={task.id}
                    className="relative border-b border-slate-800/60 px-3 py-2"
                    style={{ minHeight: ROW_HEIGHT }}
                  >
                    <div className="mb-1 text-xs text-slate-300">{task.name}</div>
                    <div className="relative h-9 rounded-md bg-slate-900/80 ring-1 ring-slate-700/70">
                      <div
                        className="absolute top-1/2 h-6 -translate-y-1/2 rounded-md bg-gradient-to-l from-violet-500 to-violet-700 shadow-[0_0_15px_-4px_rgba(139,92,246,0.9)]"
                        style={{
                          right: `${right + deltaPercent}%`,
                          width: `${width}%`,
                          border: hasDelay ? "1px solid rgba(248,113,113,0.9)" : undefined,
                        }}
                        title={`מתוכנן: ${task.start_date} - ${task.end_date} | עלות: ${currencyFormatter.format(perTaskVariance[task.id]?.actualCost ?? task.actual_cost)} / ${currencyFormatter.format(perTaskVariance[task.id]?.estimatedCost ?? task.estimated_cost)}`}
                        onMouseDown={(e) => {
                          if (!task.start_date || !task.end_date) return
                          setDragState({
                            taskId: task.id,
                            startX: e.clientX,
                            baseStart: task.start_date,
                            baseEnd: task.end_date,
                            deltaDays: 0,
                          })
                        }}
                      />
                      <div
                        className="pointer-events-none absolute top-1/2 h-2.5 -translate-y-1/2 rounded-md bg-emerald-400/85"
                        style={{
                          right: `${right + deltaPercent}%`,
                          width: `${(width * draftProgress) / 100}%`,
                        }}
                      />
                      <div
                        className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-1 text-[10px] text-slate-200"
                      >
                        <GripHorizontal className="size-3" />
                        {task.start_date} → {task.end_date}
                      </div>
                    </div>
                  </div>
                )
              })}
              {(() => {
                const width =
                  timelineWidthRef.current?.getBoundingClientRect().width || 980
                const centers: Record<string, number> = {}
                for (let i = 0; i < renderedRows.length; i++) {
                  centers[renderedRows[i]!.id] =
                    spacerTop + i * ROW_HEIGHT + ROW_HEIGHT / 2
                }
                const lines: Array<{
                  fromX: number
                  toX: number
                  fromY: number
                  toY: number
                }> = []
                for (const task of renderedRows) {
                  if (!task.start_date || !task.end_date) continue
                  for (const depId of task.dependency_ids ?? []) {
                    const source = renderedRows.find((r) => r.id === depId)
                    if (!source?.start_date || !source.end_date) continue
                    const sourceOffset = Math.max(
                      0,
                      differenceInCalendarDays(parseISO(source.start_date), range.min)
                    )
                    const sourceDur = Math.max(
                      1,
                      differenceInCalendarDays(
                        parseISO(source.end_date),
                        parseISO(source.start_date)
                      ) + 1
                    )
                    const targetOffset = Math.max(
                      0,
                      differenceInCalendarDays(parseISO(task.start_date), range.min)
                    )
                    const sourceRight = (sourceOffset / range.days) * width
                    const sourceWidth = (sourceDur / range.days) * width
                    const fromX = width - sourceRight - sourceWidth
                    const targetRight = (targetOffset / range.days) * width
                    const toX = width - targetRight
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
                    {lines.map((line, i) => (
                      <path
                        key={`dep-${i}`}
                        d={`M ${line.fromX} ${line.fromY} L ${(line.fromX + line.toX) / 2} ${line.fromY} L ${(line.fromX + line.toX) / 2} ${line.toY} L ${line.toX} ${line.toY}`}
                        stroke="rgba(148,163,184,0.6)"
                        strokeWidth="1.4"
                        fill="none"
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

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>יצירת משימה חדשה</DialogTitle>
            <DialogDescription>
              ניתן ליצור משימת־אב או תת־משימה תחת WBS קיים.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label htmlFor="task-name">שם משימה</Label>
              <Input
                id="task-name"
                value={newTask.name}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="task-parent">משימת־אב (אופציונלי)</Label>
              <select
                id="task-parent"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={newTask.parentId}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, parentId: e.target.value }))
                }
              >
                <option value="">ללא (משימת־שורש)</option>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="task-start">תאריך התחלה</Label>
                <Input
                  id="task-start"
                  type="date"
                  value={newTask.startDate}
                  onChange={(e) =>
                    setNewTask((prev) => ({ ...prev, startDate: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="task-end">תאריך סיום</Label>
                <Input
                  id="task-end"
                  type="date"
                  value={newTask.endDate}
                  onChange={(e) =>
                    setNewTask((prev) => ({ ...prev, endDate: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="task-cost">עלות מתוכננת</Label>
              <Input
                id="task-cost"
                type="number"
                min={0}
                step="any"
                value={newTask.estimatedCost}
                onChange={(e) =>
                  setNewTask((prev) => ({
                    ...prev,
                    estimatedCost: e.target.value,
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              ביטול
            </Button>
            <Button type="button" className="bg-violet-600 text-white hover:bg-violet-500" onClick={() => void createNewTask()}>
              שמירה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
