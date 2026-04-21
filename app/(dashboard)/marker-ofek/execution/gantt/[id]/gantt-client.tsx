"use client"

import * as React from "react"
import { addDays, format, parseISO, startOfDay } from "date-fns"
import { Gantt, ViewMode, type Task } from "gantt-task-react"
import "gantt-task-react/dist/index.css"

import { useTheme } from "next-themes"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { fetchProjectTasks, updateTaskGridRow, type GanttTaskRow } from "@/lib/marker-ofek/gantt-actions"
import { derivativeIsDiamondAlert, masterTaskForDerivative, type DerivativeScheduleRow } from "@/lib/marker-ofek/derivative-gantt"
import { weightedLeafProgressPercent } from "@/lib/marker-ofek/gantt-progress-display"
import { computeWbsDisplayCodes } from "@/lib/marker-ofek/wbs-display-codes"
import { sanitizeLibGanttTasksForChart } from "@/lib/marker-ofek/gantt-lib-task-sanitize"
import { formatWbsPrefixedDisplayName } from "@/lib/marker-ofek/wbs-code-numbering"
import { canonicalWbsFlatIds, type WbsScheduleTask } from "@/lib/marker-ofek/wbs-schedule"
import { cn, formatError } from "@/lib/utils"
import { toast } from "sonner"

import { GanttWbsImportDialog } from "@/components/marker-ofek/execution/gantt-wbs-import-dialog"
import { TaskPlanVaultSheet } from "@/components/marker-ofek/execution/task-plan-vault-sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"

import { GanttTaskListHeader, GanttTaskListWithQuickAdd } from "./gantt-task-list-quick-add"

type ProjectOption = { id: string; name: string; internal_project_code: string }

type GanttClientProps = {
  projectId: string
  projectName: string
  projectCode: string
  projectOptions?: ProjectOption[]
  initialTasks: GanttTaskRow[]
  perTaskVariance: Record<string, { estimatedCost: number; actualCost: number }>
  summary: {
    plannedCost: number
    actualCost: number
    variance: number
    variancePercent: number
    status: string
  }
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

/** `parseISO` can yield Invalid Date for malformed DB strings — never pass that to gantt-task-react. */
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
  wbsCodeByTaskId: Map<string, string>
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
      row.is_derivative && master
        ? `◆ ${row.name} ← ${master.name}`
        : row.name
    const wbsDisp = (wbsCodeByTaskId.get(row.id) ?? "").trim()
    const name = formatWbsPrefixedDisplayName(wbsDisp || null, baseLabel)

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

const TIME_ZOOM_PRESETS: { id: TimeZoom; label: string; mode: ViewMode; columnWidth: number; preStepsCount: number }[] =
  [
    { id: "week", label: "שבוע", mode: ViewMode.Week, columnWidth: 72, preStepsCount: 1 },
    { id: "month", label: "חודש", mode: ViewMode.Month, columnWidth: 56, preStepsCount: 1 },
    { id: "quarter", label: "3 חודשים", mode: ViewMode.Month, columnWidth: 30, preStepsCount: 2 },
  ]

export default function GanttClient({
  projectId,
  projectName,
  projectCode,
  projectOptions = [],
  initialTasks,
  perTaskVariance: _perTaskVariance,
  summary,
}: GanttClientProps) {
  void _perTaskVariance
  void summary

  const router = useRouter()
  const [wbsImportOpen, setWbsImportOpen] = React.useState(false)
  const [planVaultOpen, setPlanVaultOpen] = React.useState(false)
  const [planVaultTask, setPlanVaultTask] = React.useState<{ id: string; name: string } | null>(null)
  const { resolvedTheme } = useTheme()
  const [themeReady, setThemeReady] = React.useState(false)
  React.useEffect(() => {
    setThemeReady(true)
  }, [])
  const [tasks, setTasks] = React.useState<GanttTaskRow[]>(initialTasks)
  const [timeZoom, setTimeZoom] = React.useState<TimeZoom>("week")
  const [goToTodayPulse, setGoToTodayPulse] = React.useState<number | null>(null)
  const [collapsedProjectIds, setCollapsedProjectIds] = React.useState<Set<string>>(() => new Set())

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

  const todayIso = format(startOfDay(new Date()), "yyyy-MM-dd")

  React.useEffect(() => {
    setTasks(initialTasks)
  }, [initialTasks])

  const wbsByTaskId = React.useMemo(() => {
    const computed = computeWbsDisplayCodes(tasks)
    const m = new Map<string, string>()
    for (const t of tasks) {
      const manual = t.wbs_code?.trim()
      m.set(t.id, manual || computed.get(t.id) || "")
    }
    return m
  }, [tasks])

  const ganttTasks = React.useMemo(
    () => mapRowsToLibTasks(tasks, collapsedProjectIds, todayIso, wbsByTaskId),
    [tasks, collapsedProjectIds, todayIso, wbsByTaskId]
  )

  const sanitizedGanttTasks = React.useMemo(
    (): Task[] => sanitizeLibGanttTasksForChart(ganttTasks),
    [ganttTasks]
  )

  /** Default bar paint (no per-task styles) — matches minimalist indigo spec. */
  const ganttBarProps = {
    projectBackgroundColor: "#4f46e5",
    projectProgressColor: "#6366f1",
    barBackgroundColor: "#6366f1",
    barProgressColor: "#a5b4fc",
  }

  const refreshTasks = React.useCallback(async () => {
    const fresh = await fetchProjectTasks(projectId)
    setTasks(fresh)
  }, [projectId])

  const weightedProgress = React.useMemo(() => weightedLeafProgressPercent(tasks), [tasks])

  type LibTaskListTableProps = Omit<
    React.ComponentProps<typeof GanttTaskListWithQuickAdd>,
    "projectId" | "wbsByTaskId" | "onCreated" | "onOpenTaskPlans"
  >

  const TaskListTable = React.useCallback(
    (props: LibTaskListTableProps) => (
      <GanttTaskListWithQuickAdd
        {...props}
        projectId={projectId}
        wbsByTaskId={wbsByTaskId}
        onCreated={refreshTasks}
        onOpenTaskPlans={(taskId, taskName) => {
          setPlanVaultTask({ id: taskId, name: taskName })
          setPlanVaultOpen(true)
        }}
      />
    ),
    [projectId, wbsByTaskId, refreshTasks]
  )

  const TaskListHeader = React.useCallback(
    (props: React.ComponentProps<typeof GanttTaskListHeader>) => <GanttTaskListHeader {...props} />,
    []
  )

  const onDateChange = React.useCallback(
    async (next: Task, _children?: Task[]) => {
      try {
        const startIso = toIso(next.start)
        const endIso = toIso(next.end)
        if (startIso == null || endIso == null) {
          toast.error("תאריכי המשימה אינם תקינים.")
          return false
        }
        await updateTaskGridRow({
          taskId: next.id,
          projectId,
          name: next.name,
          startDate: startIso,
          endDate: endIso,
          progress: next.progress,
        })
        await refreshTasks()
        toast.success("התאריכים עודכנו.")
        return true
      } catch (error) {
        toast.error(formatError(error))
        return false
      }
    },
    [projectId, refreshTasks]
  )

  const onProgressChange = React.useCallback(
    async (next: Task, _children?: Task[]) => {
      try {
        const startIso = toIso(next.start)
        const endIso = toIso(next.end)
        if (startIso == null || endIso == null) {
          toast.error("תאריכי המשימה אינם תקינים.")
          return false
        }
        await updateTaskGridRow({
          taskId: next.id,
          projectId,
          name: next.name,
          startDate: startIso,
          endDate: endIso,
          progress: next.progress,
        })
        await refreshTasks()
        toast.success("ההתקדמות עודכנה.")
        return true
      } catch (error) {
        toast.error(formatError(error))
        return false
      }
    },
    [projectId, refreshTasks]
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

  return (
    <div className="flex min-h-0 flex-col gap-6 bg-card p-6 text-indigo-900 rtl">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-indigo-900">{"לו\"ז וביצוע פרויקט"}</h1>
          <p className="truncate text-xs text-slate-500">
            {projectCode ? (
              <>
                {projectName}{" "}
                <span className="font-currency-mono tabular-nums text-indigo-800">({projectCode})</span>
              </>
            ) : (
              projectName
            )}
          </p>
          {weightedProgress != null ? (
            <p className="text-sm font-medium text-indigo-700">
              התקדמות משוקללת (עלו&quot;ת):{" "}
              <span className="font-currency-mono tabular-nums">{weightedProgress}%</span>
            </p>
          ) : null}
          <p className="text-[11px] text-slate-500">
            משימות רגילות: סגול; נגזרות ספקי ביצוע: סגול־אינדיגו;{" "}
            <span className="font-medium text-red-600">אדום — אזהרת Diamond (פער מול מאסטר)</span>.
          </p>
        </div>
        <div className="flex min-w-[min(100%,14rem)] flex-col gap-2">
          {projectOptions.length > 0 ? (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                פרויקט
              </p>
              <Select
                value={projectId || ""}
                onValueChange={(v) => {
                  const id = v ?? ""
                  if (id) router.push(`/marker-ofek/execution/gantt/${id}`)
                }}
              >
                <SelectTrigger className="w-full border-slate-100 bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projectOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span>{p.name}</span>{" "}
                      <span className="font-currency-mono text-xs text-slate-500 tabular-nums">
                        {p.internal_project_code}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-slate-100"
                onClick={() => setWbsImportOpen(true)}
              >
                טען מבנה WBS
              </Button>
            </>
          ) : null}
          <Link
            href="/marker-ofek/execution/gantt"
            className="text-center text-xs font-medium text-indigo-600 underline md:text-start"
          >
            מרכז גאנט
          </Link>
        </div>
      </div>

      <GanttWbsImportDialog
        open={wbsImportOpen}
        onOpenChange={setWbsImportOpen}
        targetProjectId={projectId}
        projects={projectOptions}
        onImported={() => void refreshTasks()}
      />

      <TaskPlanVaultSheet
        open={planVaultOpen}
        onOpenChange={setPlanVaultOpen}
        projectId={projectId}
        taskId={planVaultTask?.id ?? null}
        taskName={planVaultTask?.name ?? null}
      />

      {tasks.length > 0 && sanitizedGanttTasks.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-card px-4 py-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">בקרת ציר זמן</p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setGoToTodayPulse(Date.now())}
                className="rounded-lg border border-slate-200 bg-background px-3 py-1.5 text-xs font-semibold text-indigo-900 shadow-sm transition-colors hover:bg-slate-100"
              >
                גלול להיום
              </button>
              <div className="flex rounded-lg border border-slate-100 bg-background/80 p-1 shadow-inner">
                {TIME_ZOOM_PRESETS.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => setTimeZoom(z.id)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-semibold transition-all",
                      timeZoom === z.id
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-500 hover:text-indigo-900"
                    )}
                  >
                    {z.label}
                  </button>
                ))}
              </div>
            </div>
            <Link
              href={`/marker-ofek/execution/gantt/${projectId}/subcontractor`}
              className="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 shadow-sm transition-colors hover:bg-indigo-100"
            >
              סנכרון חברות ביצוע
            </Link>
          </div>
        </div>
      ) : null}

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-slate-100 bg-card p-12 text-center text-slate-500 shadow-sm">
          אין משימות להצגה
        </div>
      ) : sanitizedGanttTasks.length === 0 ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-8 text-center text-sm text-amber-900 shadow-sm">
          לא ניתן להציג את הלו״ז — תאריכי התחלה/סיום לא תקינים. עדכנו תאריכים במשימות ונסו שוב.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-100 bg-card shadow-sm">
          <div className="pharmacy-gantt-surface gantt-grid-mesh relative rounded-xl border border-slate-100">
            <div className="gantt-container min-h-[560px] w-full overflow-auto">
              <Gantt
                key={`${themeReady ? resolvedTheme ?? "light" : "light"}-${timeZoom}-${columnWidth}-${viewMode}`}
                tasks={sanitizedGanttTasks}
                viewMode={viewMode}
                rtl
                viewDate={viewDateProp}
                preStepsCount={preStepsCount}
                locale="he"
                headerHeight={50}
                rowHeight={48}
                columnWidth={columnWidth}
                listCellWidth="500px"
                ganttHeight={560}
                fontSize="13px"
                barFill={80}
                barCornerRadius={6}
                TaskListHeader={TaskListHeader}
                TaskListTable={TaskListTable}
                {...ganttBarProps}
                onDateChange={onDateChange}
                onProgressChange={onProgressChange}
                onExpanderClick={onExpanderClick}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
