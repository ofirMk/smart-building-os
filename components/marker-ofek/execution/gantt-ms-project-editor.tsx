"use client"

import * as React from "react"
import { addDays, format, parseISO, startOfDay } from "date-fns"
import { Gantt, ViewMode, type Task } from "gantt-task-react"
import "gantt-task-react/dist/index.css"

import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { BarChart3, Loader2, Network } from "lucide-react"

import {
  addFinishToStartPredecessor,
  createTask,
  fetchProjectTasks,
  fetchResourceEngine,
  fetchTaskBoqLinks,
  groupTasksAsHammock,
  updateTaskGridRow,
  type GanttTaskRow,
  type ProjectBoqRow,
  type TaskBoqLinkRow,
} from "@/lib/marker-ofek/gantt-actions"
import { derivativeIsDiamondAlert, masterTaskForDerivative, type DerivativeScheduleRow } from "@/lib/marker-ofek/derivative-gantt"
import { computeWbsDisplayCodes } from "@/lib/marker-ofek/wbs-display-codes"
import { sanitizeLibGanttTasksForChart } from "@/lib/marker-ofek/gantt-lib-task-sanitize"
import { formatWbsPrefixedDisplayName } from "@/lib/marker-ofek/wbs-code-numbering"
import { canonicalWbsFlatIds, type WbsScheduleTask } from "@/lib/marker-ofek/wbs-schedule"
import { cn, formatError } from "@/lib/utils"
import { toast } from "sonner"

import { GanttWbsImportDialog } from "@/components/marker-ofek/execution/gantt-wbs-import-dialog"
import { TaskPlanVaultSheet } from "@/components/marker-ofek/execution/task-plan-vault-sheet"
import { GanttMsProjectTaskListHeader, GanttMsProjectTaskListTable } from "@/components/marker-ofek/execution/gantt-ms-project-task-list"
import { GanttMsTaskDetailDialog } from "@/components/marker-ofek/execution/gantt-ms-task-detail-dialog"
import { GanttMsResourcePoolDialog } from "@/components/marker-ofek/execution/gantt-ms-resource-pool-dialog"
import { GanttDependencyLinkOverlay } from "@/components/marker-ofek/execution/gantt-dependency-link-overlay"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type ProjectOption = { id: string; name: string; internal_project_code: string }

type ResourceEngine = Awaited<ReturnType<typeof fetchResourceEngine>>

type Props = {
  projectId: string
  projectName: string
  projectCode: string
  projectOptions?: ProjectOption[]
  initialTasks: GanttTaskRow[]
  initialBoqLinks: TaskBoqLinkRow[]
  projectBoq: ProjectBoqRow[]
  initialResourceEngine: ResourceEngine
  supplierEntities: { id: string; name: string }[]
}

function toWbsSchedule(row: GanttTaskRow): WbsScheduleTask {
  return {
    id: row.id,
    parent_id: row.parent_id,
    name: row.name,
    start_date: row.start_date,
    end_date: row.end_date,
    wbs_order: row.wbs_order,
    level: row.level,
    predecessor_index: row.predecessor_index,
    predecessor_task_id: row.predecessor_task_id,
    dependency_ids: row.dependency_ids ?? [],
    dependency_lags: row.dependency_lags ?? {},
    is_derivative: row.is_derivative,
  }
}

function toIso(d: Date | undefined | null): string | null {
  if (d == null || !(d instanceof Date) || Number.isNaN(d.getTime())) return null
  return format(d, "yyyy-MM-dd")
}

function safeParseDay(iso: string | null | undefined, fallback: Date): Date {
  const raw = String(iso ?? "").trim()
  if (!raw) return fallback
  const d = parseISO(raw)
  return Number.isNaN(d.getTime()) ? fallback : d
}

function mapRowsToLibTasks(
  rows: GanttTaskRow[],
  collapsedProjectIds: Set<string>,
  todayIso: string,
  wbsCodeByTaskId: Map<string, string>,
  barSuffixByTaskId: Map<string, string>
): Task[] {
  if (rows.length === 0) return []

  const byId = new Map(rows.map((r) => [r.id, r]))
  const hasChildren = new Set<string>()
  for (const t of rows) {
    if (t.parent_id) hasChildren.add(t.parent_id)
  }

  const flatIds = canonicalWbsFlatIds(rows.map(toWbsSchedule))
  const defaultStart = startOfDay(new Date())
  const derivRows = rows as DerivativeScheduleRow[]

  const out: Task[] = []
  let displayOrder = 0

  for (const id of flatIds) {
    const row = byId.get(id)
    if (!row) continue

    const start = safeParseDay(row.start_date, defaultStart)
    let end = row.end_date ? safeParseDay(row.end_date, addDays(start, 1)) : addDays(start, 1)
    if (end <= start) end = addDays(start, 1)

    const isProject = hasChildren.has(row.id)

    const deps = (row.dependency_ids ?? []).filter((d) => byId.has(d))

    const master = masterTaskForDerivative(derivRows, row as DerivativeScheduleRow)
    const diamond =
      row.is_derivative && derivativeIsDiamondAlert(row as DerivativeScheduleRow, master, todayIso)
    const styles = diamond
      ? {
          backgroundColor: "#fecaca",
          backgroundSelectedColor: "#fca5a5",
          progressColor: "#dc2626",
          progressSelectedColor: "#b91c1c",
        }
      : row.is_derivative
        ? {
            backgroundColor: "#e0e7ff",
            backgroundSelectedColor: "#c7d2fe",
            progressColor: "#4f46e5",
            progressSelectedColor: "#4338ca",
          }
        : {
            backgroundColor: "#ede9fe",
            backgroundSelectedColor: "#ddd6fe",
            progressColor: "#7c3aed",
            progressSelectedColor: "#6d28d9",
          }

    const baseLabel =
      row.is_derivative && master ? `◆ ${row.name} ← ${master.name}` : row.name
    const wbsDisp = (wbsCodeByTaskId.get(row.id) ?? "").trim()
    let name = formatWbsPrefixedDisplayName(wbsDisp || null, baseLabel)
    const suf = (barSuffixByTaskId.get(row.id) ?? "").trim()
    if (suf) name = `${name}  ·  ${suf}`

    out.push({
      id: row.id,
      name,
      type: isProject ? "project" : "task",
      start,
      end,
      progress: Math.max(0, Math.min(100, Math.round(Number(row.progress) || 0))),
      project: row.parent_id ?? undefined,
      dependencies: deps,
      displayOrder: displayOrder++,
      hideChildren: isProject ? collapsedProjectIds.has(row.id) : undefined,
      styles,
    })
  }

  return out
}

type TimeZoom = "week" | "month" | "quarter"

const TIME_ZOOM_PRESETS: {
  id: TimeZoom
  label: string
  mode: ViewMode
  columnWidth: number
  preStepsCount: number
}[] = [
  { id: "week", label: "שבוע", mode: ViewMode.Week, columnWidth: 72, preStepsCount: 1 },
  { id: "month", label: "חודש", mode: ViewMode.Month, columnWidth: 56, preStepsCount: 1 },
  { id: "quarter", label: "3 חודשים", mode: ViewMode.Month, columnWidth: 30, preStepsCount: 2 },
]

function formatBudgetIls(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—"
  return `₪${Math.round(n).toLocaleString("he-IL")}`
}

export default function GanttMsProjectEditor({
  projectId,
  projectName,
  projectCode,
  projectOptions = [],
  initialTasks,
  initialBoqLinks,
  projectBoq,
  initialResourceEngine,
  supplierEntities,
}: Props) {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const [themeReady, setThemeReady] = React.useState(false)
  React.useEffect(() => {
    setThemeReady(true)
  }, [])

  const [tasks, setTasks] = React.useState<GanttTaskRow[]>(initialTasks)
  const [boqLinks, setBoqLinks] = React.useState<TaskBoqLinkRow[]>(initialBoqLinks)
  const [resourceEngine, setResourceEngine] = React.useState<ResourceEngine>(initialResourceEngine)

  const [timeZoom, setTimeZoom] = React.useState<TimeZoom>("week")
  const [goToTodayPulse, setGoToTodayPulse] = React.useState<number | null>(null)
  const [collapsedProjectIds, setCollapsedProjectIds] = React.useState<Set<string>>(() => new Set())

  const [wbsImportOpen, setWbsImportOpen] = React.useState(false)
  const [planVaultOpen, setPlanVaultOpen] = React.useState(false)
  const [planVaultTask, setPlanVaultTask] = React.useState<{ id: string; name: string } | null>(null)

  const [detailTaskId, setDetailTaskId] = React.useState<string | null>(null)
  const [poolOpen, setPoolOpen] = React.useState(false)

  const [hammockOpen, setHammockOpen] = React.useState(false)
  const [hammockName, setHammockName] = React.useState("")
  const [hammockIds, setHammockIds] = React.useState<Set<string>>(() => new Set())
  const [hammockBusy, setHammockBusy] = React.useState(false)

  const [addRootOpen, setAddRootOpen] = React.useState(false)
  const [addRootName, setAddRootName] = React.useState("")
  const [addRootBusy, setAddRootBusy] = React.useState(false)

  const entityMap = React.useMemo(
    () => new Map(supplierEntities.map((e) => [e.id, e.name])),
    [supplierEntities]
  )

  const resourceById = React.useMemo(
    () => new Map(resourceEngine.resources.map((r) => [r.id, r])),
    [resourceEngine.resources]
  )

  React.useEffect(() => {
    setTasks(initialTasks)
  }, [initialTasks])
  React.useEffect(() => {
    setBoqLinks(initialBoqLinks)
  }, [initialBoqLinks])
  React.useEffect(() => {
    setResourceEngine(initialResourceEngine)
  }, [initialResourceEngine])

  const refreshAll = React.useCallback(async () => {
    const [t, b, e] = await Promise.all([
      fetchProjectTasks(projectId),
      fetchTaskBoqLinks(projectId),
      fetchResourceEngine(projectId),
    ])
    setTasks(t)
    setBoqLinks(b)
    setResourceEngine(e)
  }, [projectId])

  const todayIso = format(startOfDay(new Date()), "yyyy-MM-dd")

  const wbsByTaskId = React.useMemo(() => {
    const computed = computeWbsDisplayCodes(tasks)
    const m = new Map<string, string>()
    for (const t of tasks) {
      const manual = t.wbs_code?.trim()
      m.set(t.id, manual || computed.get(t.id) || "")
    }
    return m
  }, [tasks])

  const rowsById = React.useMemo(() => new Map(tasks.map((r) => [r.id, r])), [tasks])

  const hasChildren = React.useMemo(() => {
    const s = new Set<string>()
    for (const t of tasks) {
      if (t.parent_id) s.add(t.parent_id)
    }
    return s
  }, [tasks])

  const boqCostByTaskId = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const l of boqLinks) {
      const cur = m.get(l.task_id) ?? 0
      m.set(l.task_id, cur + (Number(l.boq_cost) || 0))
    }
    return m
  }, [boqLinks])

  const budgetLabelByTaskId = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const row of tasks) {
      const boq = boqCostByTaskId.get(row.id) ?? 0
      if (boq > 0) m.set(row.id, formatBudgetIls(boq))
      else m.set(row.id, formatBudgetIls(row.estimated_cost))
    }
    return m
  }, [tasks, boqCostByTaskId])

  const barSuffixByTaskId = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const row of tasks) {
      const parts: string[] = []
      if (row.subcontractor_id) {
        const n = entityMap.get(row.subcontractor_id)
        if (n) parts.push(n)
      }
      for (const a of resourceEngine.assignments) {
        if (a.task_id !== row.id) continue
        const rn = resourceById.get(a.resource_id)?.name
        if (rn) parts.push(rn)
      }
      const uniq = [...new Set(parts)]
      if (uniq.length) m.set(row.id, uniq.join(" · "))
    }
    return m
  }, [tasks, resourceEngine.assignments, entityMap, resourceById])

  const resourceLabelByTaskId = barSuffixByTaskId

  const predecessorLabelByTaskId = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const row of tasks) {
      const ids = row.dependency_ids ?? []
      if (ids.length === 0) m.set(row.id, "—")
      else
        m.set(
          row.id,
          ids.map((id) => wbsByTaskId.get(id) || id.slice(0, 6)).join("+")
        )
    }
    return m
  }, [tasks, wbsByTaskId])

  const ganttHostRef = React.useRef<HTMLDivElement>(null)

  const onLinkFs = React.useCallback(
    async (predecessorTaskId: string, successorTaskId: string) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== successorTaskId) return t
          const dep = [...(t.dependency_ids ?? [])]
          if (dep.includes(predecessorTaskId)) return t
          return {
            ...t,
            dependency_ids: [...dep, predecessorTaskId],
            dependency_lags: { ...t.dependency_lags, [predecessorTaskId]: 0 },
          }
        })
      )
      try {
        await addFinishToStartPredecessor({
          projectId,
          successorTaskId,
          predecessorTaskId,
        })
        toast.success("נוצר קשר Finish-to-Start")
        await refreshAll()
        router.refresh()
      } catch (e) {
        await refreshAll()
        const msg = formatError(e)
        if (msg.includes("CONFLICT_CIRCULAR")) {
          toast.error("קשר מעגלי — הפעולה בוטלה")
        } else {
          toast.error(msg)
        }
      }
    },
    [projectId, refreshAll, router]
  )

  const ganttTasks = React.useMemo(
    () => mapRowsToLibTasks(tasks, collapsedProjectIds, todayIso, wbsByTaskId, barSuffixByTaskId),
    [tasks, collapsedProjectIds, todayIso, wbsByTaskId, barSuffixByTaskId]
  )

  const sanitizedGanttTasks = React.useMemo(
    (): Task[] => sanitizeLibGanttTasksForChart(ganttTasks),
    [ganttTasks]
  )

  const zoomConfig = React.useMemo(
    () => TIME_ZOOM_PRESETS.find((z) => z.id === timeZoom) ?? TIME_ZOOM_PRESETS[0],
    [timeZoom]
  )
  const viewMode = zoomConfig.mode
  const columnWidth = zoomConfig.columnWidth
  const preStepsCount = zoomConfig.preStepsCount

  const viewDateProp = React.useMemo(
    () => (goToTodayPulse != null ? new Date(goToTodayPulse) : undefined),
    [goToTodayPulse]
  )

  const ganttBarProps = {
    projectBackgroundColor: "#4f46e5",
    projectProgressColor: "#6366f1",
    barBackgroundColor: "#6366f1",
    barProgressColor: "#a5b4fc",
  }

  const TaskListHeader = React.useCallback(
    (props: React.ComponentProps<typeof GanttMsProjectTaskListHeader>) => (
      <GanttMsProjectTaskListHeader {...props} />
    ),
    []
  )

  const TaskListTable = React.useCallback(
    (props: Omit<
      React.ComponentProps<typeof GanttMsProjectTaskListTable>,
      | "projectId"
      | "wbsByTaskId"
      | "onCreated"
      | "onOpenTaskPlans"
      | "rowsById"
      | "resourceLabelByTaskId"
      | "budgetLabelByTaskId"
      | "predecessorLabelByTaskId"
      | "onRowDoubleClick"
    >) => (
      <GanttMsProjectTaskListTable
        {...props}
        projectId={projectId}
        wbsByTaskId={wbsByTaskId}
        onCreated={refreshAll}
        rowsById={rowsById}
        resourceLabelByTaskId={resourceLabelByTaskId}
        budgetLabelByTaskId={budgetLabelByTaskId}
        predecessorLabelByTaskId={predecessorLabelByTaskId}
        onRowDoubleClick={(id) => setDetailTaskId(id)}
        onOpenTaskPlans={(taskId, taskName) => {
          setPlanVaultTask({ id: taskId, name: taskName })
          setPlanVaultOpen(true)
        }}
      />
    ),
    [projectId, wbsByTaskId, refreshAll, rowsById, resourceLabelByTaskId, budgetLabelByTaskId, predecessorLabelByTaskId]
  )

  const onDateChange = React.useCallback(
    async (next: Task, _children?: Task[]) => {
      try {
        const row = tasks.find((r) => r.id === next.id)
        const name = (row?.name ?? "").trim() || String(next.name ?? "").trim()
        const startIso = toIso(next.start)
        const endIso = toIso(next.end)
        if (startIso == null || endIso == null) {
          toast.error("תאריכי המשימה אינם תקינים.")
          return false
        }
        if (!name) {
          toast.error("שם משימה חסר.")
          return false
        }
        await updateTaskGridRow({
          taskId: next.id,
          projectId,
          name,
          startDate: startIso,
          endDate: endIso,
          progress: next.progress,
        })
        await refreshAll()
        router.refresh()
        toast.success("התאריכים עודכנו.")
        return true
      } catch (error) {
        toast.error(formatError(error))
        return false
      }
    },
    [projectId, refreshAll, router, tasks]
  )

  const onProgressChange = React.useCallback(
    async (next: Task, _children?: Task[]) => {
      try {
        const row = tasks.find((r) => r.id === next.id)
        const name = (row?.name ?? "").trim() || String(next.name ?? "").trim()
        const startIso = toIso(next.start)
        const endIso = toIso(next.end)
        if (startIso == null || endIso == null) {
          toast.error("תאריכי המשימה אינם תקינים.")
          return false
        }
        if (!name) {
          toast.error("שם משימה חסר.")
          return false
        }
        await updateTaskGridRow({
          taskId: next.id,
          projectId,
          name,
          startDate: startIso,
          endDate: endIso,
          progress: next.progress,
        })
        await refreshAll()
        router.refresh()
        toast.success("ההתקדמות עודכנה.")
        return true
      } catch (error) {
        toast.error(formatError(error))
        return false
      }
    },
    [projectId, refreshAll, router, tasks]
  )

  const onExpanderClick = React.useCallback((task: Task) => {
    if (task.type !== "project") return
    setCollapsedProjectIds((prev) => {
      const next = new Set(prev)
      if (next.has(task.id)) next.delete(task.id)
      else next.add(task.id)
      return next
    })
  }, [])

  const detailTask = detailTaskId ? rowsById.get(detailTaskId) ?? null : null

  async function submitAddRoot(e: React.FormEvent) {
    e.preventDefault()
    const n = addRootName.trim()
    if (!n) return
    const start = format(startOfDay(new Date()), "yyyy-MM-dd")
    const end = format(addDays(startOfDay(new Date()), 7), "yyyy-MM-dd")
    setAddRootBusy(true)
    try {
      await createTask({
        projectId,
        parentId: null,
        name: n,
        startDate: start,
        endDate: end,
        progress: 0,
      })
      toast.success("המשימה נוספה.")
      setAddRootOpen(false)
      setAddRootName("")
      await refreshAll()
      router.refresh()
    } catch (err) {
      toast.error(formatError(err))
    } finally {
      setAddRootBusy(false)
    }
  }

  async function submitHammock(e: React.FormEvent) {
    e.preventDefault()
    const name = hammockName.trim()
    const ids = [...hammockIds]
    if (ids.length < 2 || !name) {
      toast.error("בחרו לפחות שתי משימות והזינו שם לערסל.")
      return
    }
    setHammockBusy(true)
    try {
      await groupTasksAsHammock({ projectId, name, taskIds: ids })
      toast.success("נוצרה קבוצת ערסל.")
      setHammockOpen(false)
      setHammockName("")
      setHammockIds(new Set())
      await refreshAll()
      router.refresh()
    } catch (err) {
      toast.error(formatError(err))
    } finally {
      setHammockBusy(false)
    }
  }

  const hammockCandidates = React.useMemo(() => {
    return tasks.filter((t) => !hasChildren.has(t.id))
  }, [tasks, hasChildren])

  return (
    <div dir="rtl" className="flex min-h-0 flex-col gap-3 bg-white text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <BarChart3 className="size-4 shrink-0 text-indigo-600" aria-hidden />
          <h2 className="truncate text-sm font-bold text-slate-900">עורך גאנט — משאבים ותקציב</h2>
          <span className="hidden text-xs text-slate-500 sm:inline">
            {projectCode ? `${projectName} (${projectCode})` : projectName}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {projectOptions.length > 0 ? (
            <Select
              value={projectId || ""}
              onValueChange={(v) => {
                const id = v ?? ""
                if (id) router.push(`/marker-ofek/projects/${id}/gantt-editor`)
              }}
            >
              <SelectTrigger className="h-8 w-[min(100%,220px)] border-slate-200 bg-white text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projectOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{" "}
                    <span className="font-currency-mono text-[10px] text-slate-500">{p.internal_project_code}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-slate-200 text-xs"
            onClick={() => {
              void refreshAll()
              router.refresh()
              toast.message("נתונים רועננו מהשרת.")
            }}
          >
            שמור / רענון
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setAddRootOpen(true)}
          >
            הוסף משימה
          </Button>
          <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={() => setHammockOpen(true)}>
            <Network className="ms-1 size-3.5" />
            הוסף ערסל
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPoolOpen(true)}>
            ניהול מאגר משאבים
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setWbsImportOpen(true)}>
            טען WBS
          </Button>
        </div>
      </div>

      {tasks.length > 0 && sanitizedGanttTasks.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2 text-xs">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => setGoToTodayPulse(Date.now())}
          >
            גלול להיום
          </Button>
          <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
            {TIME_ZOOM_PRESETS.map((z) => (
              <button
                key={z.id}
                type="button"
                onClick={() => setTimeZoom(z.id)}
                className={cn(
                  "rounded px-2 py-1 text-[11px] font-semibold",
                  timeZoom === z.id ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:text-indigo-900"
                )}
              >
                {z.label}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-slate-500">
            קשר FS: גרירה מהעיגול בקצה סיום הבר אל משימת היעד.
          </span>
        </div>
      ) : null}

      <GanttWbsImportDialog
        open={wbsImportOpen}
        onOpenChange={setWbsImportOpen}
        targetProjectId={projectId}
        projects={projectOptions}
        onImported={() => void refreshAll()}
      />

      <TaskPlanVaultSheet
        open={planVaultOpen}
        onOpenChange={setPlanVaultOpen}
        projectId={projectId}
        taskId={planVaultTask?.id ?? null}
        taskName={planVaultTask?.name ?? null}
      />

      <GanttMsTaskDetailDialog
        open={detailTaskId != null && detailTask != null}
        onOpenChange={(o) => {
          if (!o) setDetailTaskId(null)
        }}
        projectId={projectId}
        task={detailTask}
        resources={resourceEngine.resources}
        assignments={resourceEngine.assignments}
        projectBoq={projectBoq}
        taskBoqLinks={boqLinks}
        supplierEntities={supplierEntities}
        onSaved={async () => {
          await refreshAll()
          router.refresh()
        }}
      />

      <GanttMsResourcePoolDialog
        open={poolOpen}
        onOpenChange={setPoolOpen}
        projectId={projectId}
        resources={resourceEngine.resources}
        onRefresh={async () => {
          await refreshAll()
          router.refresh()
        }}
      />

      <Dialog open={addRootOpen} onOpenChange={setAddRootOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl" showCloseButton>
          <form onSubmit={submitAddRoot}>
            <DialogHeader>
              <DialogTitle>משימה בשורש הפרויקט</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="root-name">שם משימה</Label>
              <Input id="root-name" value={addRootName} onChange={(e) => setAddRootName(e.target.value)} autoFocus />
            </div>
            <DialogFooter>
              <Button type="submit" size="sm" disabled={addRootBusy || !addRootName.trim()}>
                {addRootBusy ? <Loader2 className="size-4 animate-spin" /> : "יצירה"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={hammockOpen} onOpenChange={setHammockOpen}>
        <DialogContent className="max-h-[min(90vh,560px)] overflow-y-auto sm:max-w-lg" dir="rtl" showCloseButton>
          <form onSubmit={submitHammock}>
            <DialogHeader>
              <DialogTitle>הוספת ערסל (קיבוץ משימות)</DialogTitle>
              <p className="text-xs text-slate-500">בחרו לפחות שתי משימות ברמה (ללא צאצאים) לקיבוץ תחת משימת הורה.</p>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="ham-name">שם קבוצת ערסל</Label>
              <Input id="ham-name" value={hammockName} onChange={(e) => setHammockName(e.target.value)} />
            </div>
            <div className="max-h-52 space-y-1 overflow-y-auto rounded border border-slate-100 p-2 text-start text-xs">
              {hammockCandidates.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-2 py-0.5 hover:bg-slate-50">
                  <Checkbox
                    checked={hammockIds.has(t.id)}
                    onCheckedChange={(v) => {
                      setHammockIds((prev) => {
                        const next = new Set(prev)
                        if (v === true) next.add(t.id)
                        else next.delete(t.id)
                        return next
                      })
                    }}
                  />
                  <span className="truncate">{t.name}</span>
                </label>
              ))}
            </div>
            <DialogFooter className="mt-3">
              <Button type="submit" size="sm" disabled={hammockBusy}>
                {hammockBusy ? <Loader2 className="size-4 animate-spin" /> : "יצירת ערסל"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {tasks.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-10 text-center text-sm text-slate-600">
          אין משימות — הוסיפו משימה או טענו מבנה WBS.
        </div>
      ) : sanitizedGanttTasks.length === 0 ? (
        <div className="rounded-lg border border-amber-100 bg-amber-50/80 p-6 text-center text-sm text-amber-900">
          לא ניתן להציג את הלו״ז — תאריכי התחלה/סיום לא תקינים.
        </div>
      ) : (
        <div
          className={cn(
            "overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm",
            "[&_.mo-gantt-root]:flex [&_.mo-gantt-root]:flex-row-reverse"
          )}
        >
          <div className="pharmacy-gantt-surface gantt-grid-mesh relative rounded-lg">
            <div ref={ganttHostRef} className="gantt-container min-h-[560px] w-full overflow-auto">
              <Gantt
                key={`${themeReady ? resolvedTheme ?? "light" : "light"}-${timeZoom}-${columnWidth}-${viewMode}`}
                tasks={sanitizedGanttTasks}
                viewMode={viewMode}
                rtl
                viewDate={viewDateProp}
                preStepsCount={preStepsCount}
                locale="he"
                headerHeight={44}
                rowHeight={36}
                columnWidth={columnWidth}
                listCellWidth="980px"
                ganttHeight={560}
                fontSize="12px"
                barFill={78}
                barCornerRadius={5}
                TaskListHeader={TaskListHeader}
                TaskListTable={TaskListTable}
                {...ganttBarProps}
                onDateChange={onDateChange}
                onProgressChange={onProgressChange}
                onExpanderClick={onExpanderClick}
                onDoubleClick={(task) => setDetailTaskId(task.id)}
              />
              <GanttDependencyLinkOverlay
                ganttHostRef={ganttHostRef}
                tasks={sanitizedGanttTasks}
                rtl
                onLinkFs={onLinkFs}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
