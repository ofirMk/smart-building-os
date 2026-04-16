"use client"

import * as React from "react"
import { addDays, format, parseISO, startOfDay } from "date-fns"
import { Gantt, ViewMode, type Task } from "gantt-task-react"
import "gantt-task-react/dist/index.css"
import { Loader2, RefreshCcw } from "lucide-react"
import { toast } from "sonner"

import { createTask as createTaskAction, fetchTasks, updateTask } from "@/app/actions/gantt-actions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatError } from "@/lib/utils"
import type { GanttTask } from "@/types/gantt"

type GanttBoardProps = {
  projectId: string
}

type EditFormState = {
  title: string
  start_date: string
  end_date: string
  progress: number
  is_milestone: boolean
  schedule_mode: "auto" | "manual"
  parent_id: string | null
}

type EditorMode = "create" | "edit"
type InlineField = "title" | "start_date" | "end_date" | "dependencies"

type EditableTaskListHeaderProps = {
  headerHeight: number
  rowWidth: string
}

type EditableTaskListProps = {
  tasks: Task[]
  rowHeight: number
  selectedTaskId: string
  setSelectedTask: (taskId: string) => void
}

type DependencyDraft = {
  fromTaskId: string
  fromSide: "start" | "end"
  x1: number
  y1: number
  x2: number
  y2: number
}

function normalizeDate(iso: string | null | undefined, fallback: Date): Date {
  const value = String(iso ?? "").trim()
  if (!value) return fallback
  const parsed = parseISO(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function toIsoDate(value: Date | undefined | null): string | null {
  if (!value || Number.isNaN(value.getTime())) return null
  return format(value, "yyyy-MM-dd")
}

function mapDbTasksToChartTasks(rows: GanttTask[], collapsedProjectIds: Set<string>): Task[] {
  const fallback = startOfDay(new Date())
  const parentsWithChildren = new Set(rows.map((row) => row.parent_id).filter(Boolean))
  return rows.map((row, index) => {
    const start = normalizeDate(row.start_date, fallback)
    const rawEnd = normalizeDate(row.end_date, addDays(start, 1))
    const end = rawEnd <= start ? addDays(start, 1) : rawEnd
    const taskType: Task["type"] = row.is_milestone
      ? "milestone"
      : parentsWithChildren.has(row.id)
        ? "project"
        : "task"
    return {
      id: row.id,
      name: `${row.phase} · ${row.title}`,
      start,
      end,
      type: taskType,
      progress: Math.max(0, Math.min(100, Math.round(Number(row.progress) || 0))),
      project: row.parent_id ?? undefined,
      dependencies: row.dependencies.map((dependency) => dependency.taskId),
      displayOrder: index,
      hideChildren: parentsWithChildren.has(row.id) ? collapsedProjectIds.has(row.id) : undefined,
    } satisfies Task
  })
}

function dateDiffDays(startDate: string | null, endDate: string | null, isMilestone: boolean): number {
  if (isMilestone) return 0
  if (!startDate || !endDate) return 0
  const start = Date.parse(`${startDate}T00:00:00.000Z`)
  const end = Date.parse(`${endDate}T00:00:00.000Z`)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0
  return Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1
}

function mapPredecessorRowNumbersToTaskIds(
  raw: string,
  taskIdByRowNumber: Map<number, string>
): string[] {
  const rowNumbers = [...new Set(raw.split(",").map((item) => Number(item.trim())).filter(Number.isFinite))]
  return rowNumbers
    .map((rowNumber) => taskIdByRowNumber.get(Math.floor(rowNumber)))
    .filter((id): id is string => Boolean(id))
}

function EditableTaskListHeader({ headerHeight, rowWidth }: EditableTaskListHeaderProps) {
  return (
    <div
      dir="rtl"
      className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-700"
      style={{ height: headerHeight, width: rowWidth }}
    >
      <div className="grid h-full grid-cols-[56px_minmax(240px,1fr)_90px_120px_120px_160px_120px] items-center gap-2 px-2">
        <div className="text-right">#</div>
        <div className="text-right">שם פעילות</div>
        <div className="text-right">משך</div>
        <div className="text-right">התחלה</div>
        <div className="text-right">סיום</div>
        <div className="text-right">משימות קדם</div>
        <div className="text-right">משאבים</div>
      </div>
    </div>
  )
}

function EditableTaskList({
  tasks: chartRows,
  rowHeight,
  selectedTaskId,
  setSelectedTask,
  dbTaskMap,
  depthByTaskId,
  hasChildrenByTaskId,
  collapsedProjectIds,
  onToggleCollapse,
  rowNumberByTaskId,
  onInlineCommit,
}: EditableTaskListProps & {
  dbTaskMap: Map<string, GanttTask>
  depthByTaskId: Map<string, number>
  hasChildrenByTaskId: Map<string, boolean>
  collapsedProjectIds: Set<string>
  onToggleCollapse: (taskId: string) => void
  rowNumberByTaskId: Map<string, number>
  onInlineCommit: (taskId: string, field: InlineField, value: string) => Promise<void>
}) {
  const [activeCell, setActiveCell] = React.useState<{ taskId: string; field: InlineField } | null>(null)
  const [draftValue, setDraftValue] = React.useState("")

  const startEdit = React.useCallback(
    (taskId: string, field: InlineField, initialValue: string) => {
      setActiveCell({ taskId, field })
      setDraftValue(initialValue)
    },
    []
  )

  const stopEdit = React.useCallback(() => {
    setActiveCell(null)
    setDraftValue("")
  }, [])

  const commitEdit = React.useCallback(async () => {
    if (!activeCell) return
    await onInlineCommit(activeCell.taskId, activeCell.field, draftValue)
    stopEdit()
  }, [activeCell, draftValue, onInlineCommit, stopEdit])

  return (
    <div dir="rtl" className="text-xs text-slate-800">
      {chartRows.map((task, index) => {
        const dbTask = dbTaskMap.get(task.id)
        if (!dbTask) return null
        const depth = depthByTaskId.get(task.id) ?? 0
        const predecessors = dbTask.dependencies
          .map((dependency) => rowNumberByTaskId.get(dependency.taskId))
          .filter((n): n is number => Number.isInteger(n))
          .join(", ")
        const resources = (dbTask.resources ?? [])
          .map((resource) => resource.label || resource.role || resource.resourceId || resource.subcontractorId || "")
          .filter(Boolean)
          .join(", ")
        const duration = dateDiffDays(dbTask.start_date, dbTask.end_date, dbTask.is_milestone)
        const isSelected = selectedTaskId === task.id
        const hasChildren = Boolean(hasChildrenByTaskId.get(task.id))
        const isCollapsed = collapsedProjectIds.has(task.id)

        const isEditing = (field: InlineField) =>
          activeCell?.taskId === task.id && activeCell.field === field

        return (
          <div
            key={task.id}
            className={`grid grid-cols-[56px_minmax(240px,1fr)_90px_120px_120px_160px_120px] items-center gap-2 border-b border-slate-100 px-2 ${
              isSelected ? "bg-indigo-50" : "bg-white"
            }`}
            style={{ height: rowHeight }}
            onClick={() => setSelectedTask(task.id)}
          >
            <div className="text-right text-slate-500">{index + 1}</div>

            <div className="text-right" style={{ paddingInlineStart: `${depth * 14}px` }}>
              {hasChildren ? (
                <button
                  type="button"
                  className="ms-1 inline-flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleCollapse(task.id)
                  }}
                  title={isCollapsed ? "פתח תתי-פעילויות" : "סגור תתי-פעילויות"}
                >
                  {isCollapsed ? "►" : "▼"}
                </button>
              ) : (
                <span className="ms-1 inline-block h-5 w-5" />
              )}
              {isEditing("title") ? (
                <input
                  autoFocus
                  value={draftValue}
                  onChange={(event) => setDraftValue(event.target.value)}
                  onBlur={() => void commitEdit()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void commitEdit()
                    if (event.key === "Escape") stopEdit()
                  }}
                  className="h-7 w-full rounded border border-indigo-200 px-2 text-xs outline-none"
                />
              ) : (
                <button
                  type="button"
                  className="w-full text-right hover:text-indigo-700"
                  onDoubleClick={() => startEdit(task.id, "title", dbTask.title)}
                >
                  {dbTask.title}
                </button>
              )}
            </div>

            <div className="text-right text-slate-600">{duration} ימים</div>

            <div className="text-right">
              {isEditing("start_date") ? (
                <input
                  autoFocus
                  type="date"
                  value={draftValue}
                  onChange={(event) => setDraftValue(event.target.value)}
                  onBlur={() => void commitEdit()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void commitEdit()
                    if (event.key === "Escape") stopEdit()
                  }}
                  className="h-7 w-full rounded border border-indigo-200 px-2 text-xs outline-none"
                />
              ) : (
                <button
                  type="button"
                  className="w-full text-right hover:text-indigo-700"
                  onDoubleClick={() => startEdit(task.id, "start_date", dbTask.start_date ?? "")}
                >
                  {dbTask.start_date ?? "—"}
                </button>
              )}
            </div>

            <div className="text-right">
              {isEditing("end_date") ? (
                <input
                  autoFocus
                  type="date"
                  value={draftValue}
                  onChange={(event) => setDraftValue(event.target.value)}
                  onBlur={() => void commitEdit()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void commitEdit()
                    if (event.key === "Escape") stopEdit()
                  }}
                  className="h-7 w-full rounded border border-indigo-200 px-2 text-xs outline-none"
                />
              ) : (
                <button
                  type="button"
                  className="w-full text-right hover:text-indigo-700"
                  onDoubleClick={() => startEdit(task.id, "end_date", dbTask.end_date ?? "")}
                >
                  {dbTask.end_date ?? "—"}
                </button>
              )}
            </div>

            <div className="text-right">
              {isEditing("dependencies") ? (
                <input
                  autoFocus
                  value={draftValue}
                  onChange={(event) => setDraftValue(event.target.value)}
                  onBlur={() => void commitEdit()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void commitEdit()
                    if (event.key === "Escape") stopEdit()
                  }}
                  className="h-7 w-full rounded border border-indigo-200 px-2 text-xs outline-none"
                />
              ) : (
                <button
                  type="button"
                  className="w-full truncate text-right hover:text-indigo-700"
                  onDoubleClick={() => startEdit(task.id, "dependencies", predecessors)}
                >
                  {predecessors || "—"}
                </button>
              )}
            </div>

            <div className="truncate text-right text-slate-600">{resources || "—"}</div>
          </div>
        )
      })}
    </div>
  )
}

export function GanttBoard({ projectId }: GanttBoardProps) {
  const ganttShellRef = React.useRef<HTMLDivElement | null>(null)
  const [tasks, setTasks] = React.useState<GanttTask[]>([])
  const [loading, setLoading] = React.useState(true)
  const [savingTaskId, setSavingTaskId] = React.useState<string | null>(null)
  const [hoveredTaskId, setHoveredTaskId] = React.useState<string | null>(null)
  const [dependencyDraft, setDependencyDraft] = React.useState<DependencyDraft | null>(null)
  const [collapsedProjectIds, setCollapsedProjectIds] = React.useState<Set<string>>(() => new Set())
  const [editingTaskId, setEditingTaskId] = React.useState<string | null>(null)
  const [editorMode, setEditorMode] = React.useState<EditorMode>("edit")
  const [isEditorOpen, setIsEditorOpen] = React.useState(false)
  const [isSavingEditor, setIsSavingEditor] = React.useState(false)
  const [editForm, setEditForm] = React.useState<EditFormState>({
    title: "",
    start_date: "",
    end_date: "",
    progress: 0,
    is_milestone: false,
    schedule_mode: "auto",
    parent_id: null,
  })

  const loadTasks = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchTasks(projectId)
      setTasks(data)
    } catch (error) {
      toast.error(formatError(error))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  const chartTasks = React.useMemo(
    () => mapDbTasksToChartTasks(tasks, collapsedProjectIds),
    [tasks, collapsedProjectIds]
  )
  const taskById = React.useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const hasChildrenByTaskId = React.useMemo(() => {
    const out = new Map<string, boolean>()
    for (const task of tasks) {
      if (!task.parent_id) continue
      out.set(task.parent_id, true)
    }
    return out
  }, [tasks])
  const rowNumberByTaskId = React.useMemo(() => {
    const map = new Map<string, number>()
    chartTasks.forEach((task, index) => map.set(task.id, index + 1))
    return map
  }, [chartTasks])
  const taskIdByRowNumber = React.useMemo(() => {
    const map = new Map<number, string>()
    chartTasks.forEach((task, index) => map.set(index + 1, task.id))
    return map
  }, [chartTasks])
  const depthByTaskId = React.useMemo(() => {
    const map = new Map(tasks.map((task) => [task.id, task]))
    const out = new Map<string, number>()
    const getDepth = (taskId: string): number => {
      if (out.has(taskId)) return out.get(taskId) ?? 0
      let depth = 0
      const seen = new Set<string>()
      let current = map.get(taskId)
      while (current?.parent_id && !seen.has(current.parent_id)) {
        seen.add(current.parent_id)
        depth += 1
        current = map.get(current.parent_id)
      }
      out.set(taskId, depth)
      return depth
    }
    for (const task of tasks) getDepth(task.id)
    return out
  }, [tasks])
  const parentOptions = React.useMemo(
    () => tasks.filter((task) => task.id !== editingTaskId),
    [tasks, editingTaskId]
  )

  const openEditorForTask = React.useCallback(
    (taskId: string) => {
      const row = taskById.get(taskId)
      if (!row) return
      setEditorMode("edit")
      setEditingTaskId(row.id)
      setEditForm({
        title: row.title,
        start_date: row.start_date ?? "",
        end_date: row.end_date ?? "",
        progress: row.progress,
        is_milestone: row.is_milestone,
        schedule_mode: row.schedule_mode,
        parent_id: row.parent_id,
      })
      setIsEditorOpen(true)
    },
    [taskById]
  )

  const openCreateTaskModal = React.useCallback(() => {
    const today = format(startOfDay(new Date()), "yyyy-MM-dd")
    setEditorMode("create")
    setEditingTaskId(null)
    setEditForm({
      title: "",
      start_date: today,
      end_date: today,
      progress: 0,
      is_milestone: false,
      schedule_mode: "auto",
      parent_id: null,
    })
    setIsEditorOpen(true)
  }, [])

  const onDateChange = React.useCallback(
    async (next: Task) => {
      const nextStart = toIsoDate(next.start)
      const nextEnd = toIsoDate(next.end)
      if (!nextStart || !nextEnd) return false

      const previous = tasks
      setSavingTaskId(next.id)
      setTasks((prev) =>
        prev.map((row) =>
          row.id === next.id
            ? { ...row, start_date: nextStart, end_date: nextEnd }
            : row
        )
      )

      try {
        await updateTask(next.id, {
          start_date: nextStart,
          end_date: nextEnd,
        })
        return true
      } catch (error) {
        setTasks(previous)
        toast.error(formatError(error))
        return false
      } finally {
        setSavingTaskId(null)
      }
    },
    [tasks]
  )

  const onProgressChange = React.useCallback(
    async (next: Task) => {
      const progress = Math.max(0, Math.min(100, Math.round(Number(next.progress) || 0)))
      const previous = tasks
      setSavingTaskId(next.id)
      setTasks((prev) =>
        prev.map((row) => (row.id === next.id ? { ...row, progress } : row))
      )

      try {
        await updateTask(next.id, { progress })
        return true
      } catch (error) {
        setTasks(previous)
        toast.error(formatError(error))
        return false
      } finally {
        setSavingTaskId(null)
      }
    },
    [tasks]
  )

  const onDoubleClickTask = React.useCallback(
    (task: Task) => {
      openEditorForTask(task.id)
    },
    [openEditorForTask]
  )

  const onToggleCollapse = React.useCallback((taskId: string) => {
    setCollapsedProjectIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }, [])

  const onExpanderClick = React.useCallback((task: Task) => {
    onToggleCollapse(task.id)
  }, [onToggleCollapse])

  React.useEffect(() => {
    const root = ganttShellRef.current
    if (!root) return
    const timelineCol = root.querySelector(".mo-gantt-timeline-col")
    if (!timelineCol) return

    const wrappers = Array.from(timelineCol.querySelectorAll("g[tabindex]"))
    wrappers.forEach((el, index) => {
      const taskId = chartTasks[index]?.id
      if (taskId) {
        ;(el as Element).setAttribute("data-task-id", taskId)
      }
    })

    const getTaskGroup = (target: EventTarget | null): Element | null =>
      target instanceof Element ? target.closest("g[data-task-id]") : null

    const toLocalPoint = (clientX: number, clientY: number) => {
      const rect = root.getBoundingClientRect()
      return { x: clientX - rect.left, y: clientY - rect.top }
    }

    const onMouseMove = (event: MouseEvent) => {
      const group = getTaskGroup(event.target)
      const hoverTaskId = group?.getAttribute("data-task-id") ?? null
      setHoveredTaskId(hoverTaskId)
      setDependencyDraft((prev) => {
        if (!prev) return prev
        const local = toLocalPoint(event.clientX, event.clientY)
        return { ...prev, x2: local.x, y2: local.y }
      })
    }

    const onMouseDown = (event: MouseEvent) => {
      const group = getTaskGroup(event.target)
      const taskId = group?.getAttribute("data-task-id")
      if (!taskId || !group) return
      const box = group.getBoundingClientRect()
      const edgeThresholdPx = 10
      const nearStart = Math.abs(event.clientX - box.left) <= edgeThresholdPx
      const nearEnd = Math.abs(event.clientX - box.right) <= edgeThresholdPx
      if (!nearStart && !nearEnd) return
      const local = toLocalPoint(event.clientX, event.clientY)
      setDependencyDraft({
        fromTaskId: taskId,
        fromSide: nearStart ? "start" : "end",
        x1: local.x,
        y1: local.y,
        x2: local.x,
        y2: local.y,
      })
      event.preventDefault()
    }

    const onMouseUp = (event: MouseEvent) => {
      setDependencyDraft((draft) => {
        if (!draft) return null
        const dropEl = document.elementFromPoint(event.clientX, event.clientY)
        const targetGroup = getTaskGroup(dropEl)
        const targetTaskId = targetGroup?.getAttribute("data-task-id") ?? null
        if (targetTaskId && targetTaskId !== draft.fromTaskId) {
          const targetRow = taskById.get(targetTaskId)
          if (targetRow) {
            const hasDependency = targetRow.dependencies.some(
              (dependency) => dependency.taskId === draft.fromTaskId
            )
            if (!hasDependency) {
              const nextDependencies = [
                ...targetRow.dependencies,
                { taskId: draft.fromTaskId, type: "FS" as const, lag: 0 },
              ]
              const previous = tasks
              setTasks((prev) =>
                prev.map((task) =>
                  task.id === targetTaskId ? { ...task, dependencies: nextDependencies } : task
                )
              )
              void updateTask(targetTaskId, { dependencies: nextDependencies })
                .then((saved) => {
                  setTasks((prev) => prev.map((task) => (task.id === saved.id ? saved : task)))
                })
                .catch((error) => {
                  setTasks(previous)
                  toast.error(formatError(error))
                })
            }
          }
        }
        return null
      })
    }

    timelineCol.addEventListener("mousemove", onMouseMove)
    timelineCol.addEventListener("mousedown", onMouseDown)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      timelineCol.removeEventListener("mousemove", onMouseMove)
      timelineCol.removeEventListener("mousedown", onMouseDown)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [chartTasks, taskById, tasks])

  React.useEffect(() => {
    const root = ganttShellRef.current
    if (!root) return
    const groups = root.querySelectorAll("g[data-task-id]")
    groups.forEach((group) => {
      const taskId = group.getAttribute("data-task-id")
      if (taskId && taskId === hoveredTaskId) {
        group.setAttribute("data-hovered", "true")
      } else {
        group.removeAttribute("data-hovered")
      }
    })
  }, [hoveredTaskId, chartTasks])

  const commitInlineEdit = React.useCallback(
    async (taskId: string, field: InlineField, rawValue: string) => {
      const previous = tasks
      const row = previous.find((task) => task.id === taskId)
      if (!row) return
      const value = rawValue.trim()
      let patch: Parameters<typeof updateTask>[1] | null = null

      if (field === "title") {
        if (!value) return
        patch = { title: value }
      }
      if (field === "start_date") {
        patch = { start_date: value || null }
      }
      if (field === "end_date") {
        patch = { end_date: value || null }
      }
      if (field === "dependencies") {
        const ids = mapPredecessorRowNumbersToTaskIds(value, taskIdByRowNumber)
        const byTaskId = new Map(row.dependencies.map((dependency) => [dependency.taskId, dependency]))
        patch = {
          dependencies: ids
            .filter((id) => id !== taskId)
            .map((id) => ({
              taskId: id,
              type: byTaskId.get(id)?.type ?? "FS",
              lag: byTaskId.get(id)?.lag ?? 0,
            })),
        }
      }
      if (!patch) return

      setTasks((prevRows) =>
        prevRows.map((task) => (task.id === taskId ? { ...task, ...patch } : task))
      )
      try {
        const saved = await updateTask(taskId, patch)
        setTasks((prevRows) => prevRows.map((task) => (task.id === taskId ? saved : task)))
      } catch (error) {
        setTasks(previous)
        toast.error(formatError(error))
      }
    },
    [taskIdByRowNumber, tasks]
  )

  const TaskListHeader = React.useCallback(
    (props: EditableTaskListHeaderProps) => <EditableTaskListHeader {...props} />,
    []
  )

  const TaskListTable = React.useCallback(
    (props: EditableTaskListProps) => (
      <EditableTaskList
        {...props}
        dbTaskMap={taskById}
        depthByTaskId={depthByTaskId}
        hasChildrenByTaskId={hasChildrenByTaskId}
        collapsedProjectIds={collapsedProjectIds}
        onToggleCollapse={onToggleCollapse}
        rowNumberByTaskId={rowNumberByTaskId}
        onInlineCommit={commitInlineEdit}
      />
    ),
    [
      commitInlineEdit,
      depthByTaskId,
      hasChildrenByTaskId,
      collapsedProjectIds,
      onToggleCollapse,
      rowNumberByTaskId,
      taskById,
    ]
  )

  const saveEditorChanges = React.useCallback(async () => {
    const previous = tasks
    const nextStart = editForm.start_date.trim() || null
    const nextEnd = editForm.end_date.trim() || null
    const optimistic = {
      title: editForm.title.trim(),
      start_date: nextStart,
      end_date: nextEnd,
      progress: Math.max(0, Math.min(100, Math.round(Number(editForm.progress) || 0)),
      ),
      is_milestone: editForm.is_milestone,
      schedule_mode: editForm.schedule_mode,
      parent_id: editForm.parent_id,
    }

    if (!optimistic.title) {
      toast.error("שם משימה חובה")
      return
    }

    setIsSavingEditor(true)
    try {
      if (editorMode === "create") {
        const tempId = `temp-${Date.now()}`
        const tempRow: GanttTask = {
          id: tempId,
          project_id: projectId,
          phase: "שלב כללי",
          status: "Not Started",
          dependencies: [],
          resources: [],
          constraint_type: null,
          constraint_date: null,
          created_at: new Date().toISOString(),
          ...optimistic,
        }
        setTasks((prev) => [...prev, tempRow])

        const created = await createTaskAction({
          project_id: projectId,
          parent_id: optimistic.parent_id,
          title: optimistic.title,
          phase: "שלב כללי",
          start_date: optimistic.start_date,
          end_date: optimistic.end_date,
          progress: optimistic.progress,
          is_milestone: optimistic.is_milestone,
          schedule_mode: optimistic.schedule_mode,
        })
        setTasks((prev) =>
          prev.map((row) => (row.id === tempId ? created : row))
        )
      } else {
        if (!editingTaskId) {
          throw new Error("taskId is required")
        }
        setTasks((prev) =>
          prev.map((row) =>
            row.id === editingTaskId
              ? {
                  ...row,
                  ...optimistic,
                }
              : row
          )
        )
        const saved = await updateTask(editingTaskId, optimistic)
        setTasks((prev) => prev.map((row) => (row.id === saved.id ? saved : row)))
      }
      setIsEditorOpen(false)
      toast.success(editorMode === "create" ? "המשימה נוצרה" : "המשימה עודכנה")
      await loadTasks()
    } catch (error) {
      setTasks(previous)
      toast.error(formatError(error))
    } finally {
      setIsSavingEditor(false)
    }
  }, [editingTaskId, editForm, editorMode, loadTasks, projectId, tasks])

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        טוען משימות גאנט...
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {savingTaskId ? "שומר עדכון משימה..." : `${tasks.length} משימות נטענו`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="bg-indigo-600 text-white hover:bg-indigo-500"
            onClick={openCreateTaskModal}
          >
            הוסף משימה חדשה
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void loadTasks()}>
            <RefreshCcw className="size-4" aria-hidden />
            רענון
          </Button>
        </div>
      </div>

      {chartTasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          אין משימות להצגה עבור הפרויקט הנבחר.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div
            ref={ganttShellRef}
            className="gantt-board-enterprise gantt-container relative min-h-[560px] w-full overflow-auto"
            dir="rtl"
          >
            {hoveredTaskId ? (
              <div className="pointer-events-none absolute start-3 top-3 z-20 rounded-md bg-indigo-600/90 px-2 py-1 text-[10px] font-semibold text-white shadow">
                משימה מסומנת: #{rowNumberByTaskId.get(hoveredTaskId) ?? "—"}
              </div>
            ) : null}
            {dependencyDraft ? (
              <svg className="pointer-events-none absolute inset-0 z-10">
                <line
                  x1={dependencyDraft.x1}
                  y1={dependencyDraft.y1}
                  x2={dependencyDraft.x2}
                  y2={dependencyDraft.y2}
                  stroke="#4f46e5"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
                <circle cx={dependencyDraft.x1} cy={dependencyDraft.y1} r={4} fill="#4f46e5" />
              </svg>
            ) : null}
            <Gantt
              tasks={chartTasks}
              viewMode={ViewMode.Week}
              rtl
              locale="he"
              listCellWidth="920px"
              columnWidth={72}
              rowHeight={44}
              ganttHeight={560}
              TaskListHeader={TaskListHeader}
              TaskListTable={TaskListTable}
              onDateChange={onDateChange}
              onProgressChange={onProgressChange}
              onExpanderClick={onExpanderClick}
              onDoubleClick={onDoubleClickTask}
            />
          </div>
        </div>
      )}

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="w-full max-w-xl">
          <DialogHeader>
            <DialogTitle>{editorMode === "create" ? "יצירת משימה חדשה" : "עריכת משימת גאנט"}</DialogTitle>
            <DialogDescription>
              עדכון שדות MS Project: ערסל, אבן דרך ותזמון אוטומטי/ידני.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="gantt-task-title">שם משימה</Label>
              <Input
                id="gantt-task-title"
                value={editForm.title}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, title: event.target.value }))
                }
                placeholder="לדוגמה: התקנת לוחות חשמל"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="gantt-task-start-date">תאריך התחלה</Label>
                <Input
                  id="gantt-task-start-date"
                  type="date"
                  value={editForm.start_date}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, start_date: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="gantt-task-end-date">תאריך סיום</Label>
                <Input
                  id="gantt-task-end-date"
                  type="date"
                  value={editForm.end_date}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, end_date: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="gantt-task-progress">% ביצוע</Label>
              <Input
                id="gantt-task-progress"
                type="number"
                min={0}
                max={100}
                value={editForm.progress}
                onChange={(event) =>
                  setEditForm((prev) => ({
                    ...prev,
                    progress: Number(event.target.value),
                  }))
                }
              />
            </div>

            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <Checkbox
                checked={editForm.is_milestone}
                onCheckedChange={(checked) =>
                  setEditForm((prev) => {
                    const nextMilestone = checked === true
                    return {
                      ...prev,
                      is_milestone: nextMilestone,
                      end_date:
                        nextMilestone && prev.start_date
                          ? prev.start_date
                          : prev.end_date,
                    }
                  })
                }
              />
              <Label className="cursor-pointer">אבן דרך</Label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>תזמון אוטומטי/ידני</Label>
                <Select
                  value={editForm.schedule_mode}
                  onValueChange={(value) =>
                    setEditForm((prev) => ({
                      ...prev,
                      schedule_mode: value === "manual" ? "manual" : "auto",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">auto</SelectItem>
                    <SelectItem value="manual">manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label>משימת אב</Label>
                <Select
                  value={editForm.parent_id ?? "__none__"}
                  onValueChange={(value) =>
                    setEditForm((prev) => ({
                      ...prev,
                      parent_id: value === "__none__" ? null : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="ללא הורה" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">ללא הורה</SelectItem>
                    {parentOptions.map((task) => (
                      <SelectItem key={task.id} value={task.id}>
                        {task.phase} · {task.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditorOpen(false)}
              disabled={isSavingEditor}
            >
              ביטול
            </Button>
            <Button type="button" onClick={() => void saveEditorChanges()} disabled={isSavingEditor}>
              {isSavingEditor ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  שומר...
                </>
              ) : (
                editorMode === "create" ? "יצירת משימה" : "שמירה"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        .gantt-board-enterprise .mo-gantt-root {
          display: flex !important;
          flex-direction: row-reverse !important;
        }
        .gantt-board-enterprise .mo-gantt-task-col {
          order: 1 !important;
        }
        .gantt-board-enterprise .mo-gantt-vscroll {
          order: 2 !important;
        }
        .gantt-board-enterprise .mo-gantt-timeline-col {
          order: 3 !important;
        }
        .gantt-board-enterprise .mo-gantt-timeline-col g[data-task-id] rect {
          transition: opacity 120ms ease, stroke-width 120ms ease;
        }
        .gantt-board-enterprise .mo-gantt-timeline-col g[data-task-id][data-hovered="true"] rect,
        .gantt-board-enterprise .mo-gantt-timeline-col g[data-task-id]:hover rect {
          opacity: 0.9;
          stroke: #1d4ed8;
          stroke-width: 2.2px;
        }
        @media print {
          .gantt-board-enterprise .mo-gantt-root {
            display: flex !important;
            flex-direction: row-reverse !important;
          }
          .gantt-board-enterprise .mo-gantt-task-col {
            order: 1 !important;
          }
          .gantt-board-enterprise .mo-gantt-timeline-col {
            order: 3 !important;
          }
        }
      `}</style>
    </div>
  )
}
