"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns"
import { Gantt, ViewMode, type Task } from "gantt-task-react"
import "gantt-task-react/dist/index.css"
import { useRouter } from "next/navigation"
import {
  ChevronDown,
  FileDown,
  Flag,
  IndentDecrease,
  IndentIncrease,
  Loader2,
  Locate,
  RefreshCcw,
} from "lucide-react"
import { toast } from "sonner"

import {
  createGantt,
  createGanttSnapshot,
  createTask as createTaskAction,
  deleteTask as deleteTaskAction,
  fetchGanttsByProject,
  fetchGanttSnapshots,
  fetchTasks,
  setGanttBaseline,
  updateTask,
} from "@/app/actions/gantt-actions"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { formatError } from "@/lib/utils"
import type { GanttRecord, GanttSnapshotRow, GanttTask } from "@/types/gantt"
import * as XLSX from "xlsx"

type GanttBoardProps = {
  ganttId: string
  projectId: string
  /** Shown in ribbon header */
  ganttTitle?: string | null
}

type EditFormState = {
  title: string
  start_date: string
  end_date: string
  progress: number
  resources: string
  cost: number
  baseline_start: string
  baseline_end: string
  actual_start: string
  actual_end: string
  is_milestone: boolean
  schedule_mode: "auto" | "manual"
  parent_id: string | null
}

type EditorMode = "create" | "edit"
type InlineField =
  | "title"
  | "progress"
  | "duration"
  | "start_date"
  | "end_date"
  | "baseline_start"
  | "baseline_end"
  | "resources"
  | "cost"

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

type ContextMenuState = {
  x: number
  y: number
  taskId: string
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

function mapDbTasksToChartTasks(
  rows: GanttTask[],
  collapsedProjectIds: Set<string>,
  criticalTaskIds: Set<string>
): Task[] {
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
    const isCritical = criticalTaskIds.has(row.id)
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
      styles: {
        backgroundColor: isCritical ? "#ef4444" : "#818cf8",
        backgroundSelectedColor: isCritical ? "#dc2626" : "#6366f1",
        progressColor: isCritical ? "#991b1b" : "#312e81",
        progressSelectedColor: isCritical ? "#7f1d1d" : "#1e1b4b",
      },
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

function shiftIsoDate(iso: string | null, deltaDays: number): string | null {
  if (!iso) return null
  const parsed = parseISO(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return format(addDays(parsed, deltaDays), "yyyy-MM-dd")
}

function scheduleVarianceDays(task: GanttTask): number | null {
  const end = task.end_date?.trim()
  const baselineEnd = task.baseline_end?.trim()
  if (!end || !baselineEnd) return null
  const dEnd = parseISO(`${end}T12:00:00`)
  const dBase = parseISO(`${baselineEnd}T12:00:00`)
  if (Number.isNaN(dEnd.getTime()) || Number.isNaN(dBase.getTime())) return null
  return differenceInCalendarDays(dEnd, dBase)
}

function formatGridDate(value: string | null | undefined): string {
  const dateValue = String(value ?? "").trim()
  if (!dateValue) return "—"
  const parsed = parseISO(dateValue)
  if (Number.isNaN(parsed.getTime())) return dateValue
  return format(parsed, "dd/MM/yyyy")
}

function safeDisplayName(value: string | null | undefined, fallback: string): string {
  const text = String(value ?? "").trim()
  if (!text) return fallback
  const isUuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    text
  )
  return isUuidLike ? fallback : text
}

function calculateFloatByTaskId(rows: GanttTask[]): Map<string, number> {
  const fallback = startOfDay(new Date())
  const dayMs = 24 * 60 * 60 * 1000
  const windows = new Map<string, { startMs: number; endMs: number }>()
  rows.forEach((task) => {
    const start = normalizeDate(task.start_date, fallback)
    const rawEnd = normalizeDate(task.end_date, addDays(start, 1))
    const end = rawEnd <= start ? addDays(start, 1) : rawEnd
    windows.set(task.id, { startMs: start.getTime(), endMs: end.getTime() })
  })

  const successorsByTaskId = new Map<string, string[]>()
  rows.forEach((task) => successorsByTaskId.set(task.id, []))
  rows.forEach((task) => {
    task.dependencies.forEach((dependency) => {
      if (successorsByTaskId.has(dependency.taskId)) {
        successorsByTaskId.get(dependency.taskId)?.push(task.id)
      }
    })
  })

  const projectEndMs = Math.max(...Array.from(windows.values()).map((entry) => entry.endMs), 0)
  const out = new Map<string, number>()
  rows.forEach((task) => {
    const current = windows.get(task.id)
    if (!current) return
    const successors = successorsByTaskId.get(task.id) ?? []
    let minSlackMs = projectEndMs - current.endMs
    successors.forEach((successorId) => {
      const successor = windows.get(successorId)
      if (!successor) return
      minSlackMs = Math.min(minSlackMs, successor.startMs - current.endMs)
    })
    out.set(task.id, Math.max(0, Math.floor(minSlackMs / dayMs)))
  })
  return out
}

/** Finish variance in days: current end vs baseline end. */
function formatScheduleVariance(task: GanttTask): { text: string; className: string } {
  const days = scheduleVarianceDays(task)
  if (days == null) {
    return { text: "—", className: "text-slate-400" }
  }
  if (days === 0) {
    return { text: "0 ימים", className: "text-slate-500" }
  }
  const sign = days > 0 ? "+" : ""
  return {
    text: `${sign}${days} ימים`,
    className: days > 0 ? "font-semibold text-red-600" : "text-emerald-600",
  }
}

const GANTT_TASK_LIST_GRID_CLASS =
  "grid-cols-[56px_minmax(220px,1fr)_90px_100px_120px_120px_120px_minmax(160px,1fr)_130px]"

function MsProjectRibbonGroup({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-[52px] flex-col justify-between border-s border-slate-200/90 px-3 py-1.5 first:border-s-0">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</span>
      <div className="flex flex-wrap items-center gap-1 pt-0.5">{children}</div>
    </div>
  )
}

function EditableTaskListHeader({ headerHeight, rowWidth }: EditableTaskListHeaderProps) {
  return (
    <div
      dir="rtl"
      className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-700"
      style={{ height: headerHeight, width: rowWidth }}
    >
      <div className={`grid h-full ${GANTT_TASK_LIST_GRID_CLASS} items-center gap-2 px-2`}>
        <div className="text-right">בחירה/#</div>
        <div className="text-right">שם פעילות</div>
        <div className="text-right">% ביצוע</div>
        <div className="text-right">משך</div>
        <div className="text-right">התחלה</div>
        <div className="text-right">סיום</div>
        <div className="text-right">סטייה (Variance)</div>
        <div className="text-right">משאבים</div>
        <div className="text-right">עלות</div>
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
  selectedTaskIds,
  onSelectedTaskIdsChange,
  onFocusedTaskChange,
  onContextEdit,
  onContextAddAbove,
  onContextAddBelow,
  onContextToggleMilestone,
  onContextDelete,
  onContextAddNote,
  onContextIndent,
  onContextOutdent,
  onInlineCommit,
  criticalTaskIds,
}: EditableTaskListProps & {
  dbTaskMap: Map<string, GanttTask>
  depthByTaskId: Map<string, number>
  hasChildrenByTaskId: Map<string, boolean>
  collapsedProjectIds: Set<string>
  onToggleCollapse: (taskId: string) => void
  selectedTaskIds: string[]
  onSelectedTaskIdsChange: (taskIds: string[]) => void
  onFocusedTaskChange: (taskId: string) => void
  onContextEdit: (taskId: string) => void
  onContextAddAbove: (taskId: string) => Promise<void>
  onContextAddBelow: (taskId: string) => Promise<void>
  onContextToggleMilestone: (taskId: string) => Promise<void>
  onContextDelete: (taskId: string) => Promise<void>
  onContextAddNote: (taskId: string) => void
  onContextIndent: () => Promise<void>
  onContextOutdent: () => Promise<void>
  onInlineCommit: (taskId: string, field: InlineField, value: string) => Promise<void>
  criticalTaskIds: Set<string>
}) {
  const [editingRowId, setEditingRowId] = React.useState<string | null>(null)
  const [editingColId, setEditingColId] = React.useState<InlineField | null>(null)
  const [editingValue, setEditingValue] = React.useState("")
  const [focusedRowId, setFocusedRowId] = React.useState<string | null>(null)
  const [focusedColId, setFocusedColId] = React.useState<InlineField | null>(null)
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState | null>(null)
  const [portalReady, setPortalReady] = React.useState(false)
  const contextMenuRef = React.useRef<HTMLDivElement | null>(null)
  const cellButtonRefs = React.useRef<Record<string, HTMLButtonElement | null>>({})
  const [lastClickedRowIndex, setLastClickedRowIndex] = React.useState<number | null>(null)
  const editableColumns = React.useMemo<InlineField[]>(
    () => [
      "title",
      "progress",
      "duration",
      "start_date",
      "end_date",
      "resources",
      "cost",
    ],
    []
  )

  const cellKey = React.useCallback((taskId: string, field: InlineField) => `${taskId}:${field}`, [])

  const focusCellButton = React.useCallback(
    (taskId: string, field: InlineField) => {
      setFocusedRowId(taskId)
      setFocusedColId(field)
      requestAnimationFrame(() => {
        const key = cellKey(taskId, field)
        cellButtonRefs.current[key]?.focus()
      })
    },
    [cellKey]
  )

  const startEdit = React.useCallback(
    (taskId: string, field: InlineField, initialValue: string) => {
      onFocusedTaskChange(taskId)
      setFocusedRowId(taskId)
      setFocusedColId(field)
      setEditingRowId(taskId)
      setEditingColId(field)
      setEditingValue(initialValue)
    },
    [onFocusedTaskChange]
  )

  const stopEdit = React.useCallback(() => {
    setEditingRowId(null)
    setEditingColId(null)
    setEditingValue("")
  }, [])

  const commitEdit = React.useCallback(async () => {
    if (!editingRowId || !editingColId) return
    await onInlineCommit(editingRowId, editingColId, editingValue)
    stopEdit()
  }, [editingColId, editingRowId, editingValue, onInlineCommit, stopEdit])

  React.useEffect(() => {
    setPortalReady(true)
  }, [])

  React.useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target
      if (
        contextMenuRef.current &&
        target instanceof Node &&
        contextMenuRef.current.contains(target)
      ) {
        return
      }
      close()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    window.addEventListener("mousedown", onMouseDown)
    window.addEventListener("contextmenu", close)
    window.addEventListener("scroll", close, true)
    window.addEventListener("resize", close)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("mousedown", onMouseDown)
      window.removeEventListener("contextmenu", close)
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("resize", close)
      window.removeEventListener("keydown", onKey)
    }
  }, [contextMenu])

  const moveFocusedCell = React.useCallback(
    (
      rowIndex: number,
      field: InlineField,
      options: { rowDelta?: number; colDelta?: number; wrapRows?: boolean }
    ) => {
      const { rowDelta = 0, colDelta = 0, wrapRows = false } = options
      const currentColIndex = editableColumns.indexOf(field)
      if (currentColIndex === -1) return

      let nextRowIndex = rowIndex + rowDelta
      let nextColIndex = currentColIndex + colDelta

      if (wrapRows && nextColIndex >= editableColumns.length) {
        nextColIndex = 0
        nextRowIndex += 1
      } else if (wrapRows && nextColIndex < 0) {
        nextColIndex = editableColumns.length - 1
        nextRowIndex -= 1
      }

      if (nextRowIndex < 0 || nextRowIndex >= chartRows.length) return
      if (nextColIndex < 0 || nextColIndex >= editableColumns.length) return

      const nextTask = chartRows[nextRowIndex]
      if (!nextTask) return
      const nextField = editableColumns[nextColIndex]
      if (!nextField) return
      focusCellButton(nextTask.id, nextField)
    },
    [chartRows, editableColumns, focusCellButton]
  )

  const handleCellKeyDown = React.useCallback(
    (
      event: React.KeyboardEvent<HTMLButtonElement>,
      taskId: string,
      rowIndex: number,
      field: InlineField,
      initialValue: string
    ) => {
      if (event.key === "Enter" || event.key === "F2") {
        event.preventDefault()
        startEdit(taskId, field, initialValue)
        return
      }

      if (event.key === "Tab") {
        event.preventDefault()
        moveFocusedCell(rowIndex, field, {
          colDelta: event.shiftKey ? -1 : 1,
          wrapRows: true,
        })
        return
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault()
        moveFocusedCell(rowIndex, field, { colDelta: 1 })
        return
      }

      if (event.key === "ArrowRight") {
        event.preventDefault()
        moveFocusedCell(rowIndex, field, { colDelta: -1 })
        return
      }

      if (event.key === "ArrowUp") {
        event.preventDefault()
        moveFocusedCell(rowIndex, field, { rowDelta: -1 })
        return
      }

      if (event.key === "ArrowDown") {
        event.preventDefault()
        moveFocusedCell(rowIndex, field, { rowDelta: 1 })
      }
    },
    [moveFocusedCell, startEdit]
  )

  const handleCellClick = React.useCallback(
    (taskId: string, field: InlineField, initialValue: string) => {
      onFocusedTaskChange(taskId)
      if (focusedRowId === taskId && focusedColId === field) {
        startEdit(taskId, field, initialValue)
        return
      }
      setFocusedRowId(taskId)
      setFocusedColId(field)
    },
    [focusedColId, focusedRowId, onFocusedTaskChange, startEdit]
  )

  const handleEditorKeyDown = React.useCallback(
    (
      event: React.KeyboardEvent<HTMLInputElement>,
      rowIndex: number,
      field: InlineField
    ) => {
      const commitAndMove = async (
        options: { rowDelta?: number; colDelta?: number; wrapRows?: boolean } | null
      ) => {
        await commitEdit()
        if (options) moveFocusedCell(rowIndex, field, options)
      }
      if (event.key === "Escape") {
        event.preventDefault()
        stopEdit()
        return
      }
      if (event.key === "Enter") {
        event.preventDefault()
        void commitAndMove(null)
        return
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        void commitAndMove({ colDelta: 1 })
        return
      }
      if (event.key === "ArrowRight") {
        event.preventDefault()
        void commitAndMove({ colDelta: -1 })
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        void commitAndMove({ rowDelta: -1 })
        return
      }
      if (event.key === "ArrowDown") {
        event.preventDefault()
        void commitAndMove({ rowDelta: 1 })
      }
    },
    [commitEdit, moveFocusedCell, stopEdit]
  )

  return (
    <div dir="rtl" className="text-xs text-slate-800">
      {chartRows.map((task, index) => {
        const dbTask = dbTaskMap.get(task.id)
        if (!dbTask) return null
        const depth = depthByTaskId.get(task.id) ?? 0
        const resources = (dbTask.resources ?? [])
          .map((resource) => resource.label || resource.role || resource.resourceId || resource.subcontractorId || "")
          .filter(Boolean)
          .join(", ")
        const duration = dateDiffDays(dbTask.start_date, dbTask.end_date, dbTask.is_milestone)
        const variance = formatScheduleVariance(dbTask)
        const isSelected = selectedTaskId === task.id
        const isMultiSelected = selectedTaskIds.includes(task.id)
        const isCritical = criticalTaskIds.has(task.id)
        const hasChildren = Boolean(hasChildrenByTaskId.get(task.id))
        const isCollapsed = collapsedProjectIds.has(task.id)

        const isEditing = (field: InlineField) => editingRowId === task.id && editingColId === field
        const isActiveCell = (field: InlineField) =>
          isEditing(field) || (focusedRowId === task.id && focusedColId === field)

        return (
          <div
            key={task.id}
            className={`relative z-[2] pointer-events-auto grid ${GANTT_TASK_LIST_GRID_CLASS} items-center gap-2 border-b border-slate-100 px-2 ${
              isSelected || isMultiSelected ? "bg-indigo-50" : "bg-white"
            }`}
            style={{ height: rowHeight }}
            onClick={(event) => {
              event.stopPropagation()
              setSelectedTask(task.id)
              onFocusedTaskChange(task.id)
              if (event.shiftKey && lastClickedRowIndex != null) {
                const start = Math.min(lastClickedRowIndex, index)
                const end = Math.max(lastClickedRowIndex, index)
                const rangeIds = chartRows.slice(start, end + 1).map((row) => row.id)
                onSelectedTaskIdsChange(rangeIds)
              } else {
                onSelectedTaskIdsChange([task.id])
                setLastClickedRowIndex(index)
              }
            }}
            onContextMenuCapture={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setSelectedTask(task.id)
              onFocusedTaskChange(task.id)
              onSelectedTaskIdsChange(
                selectedTaskIds.includes(task.id) ? selectedTaskIds : [task.id]
              )
              setContextMenu({
                x: event.clientX,
                y: event.clientY,
                taskId: task.id,
              })
            }}
          >
            <div className="flex items-center justify-end gap-1 text-right text-slate-500">
              <input
                type="checkbox"
                checked={isMultiSelected}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                  event.stopPropagation()
                  onFocusedTaskChange(task.id)
                  if (event.target.checked) {
                    onSelectedTaskIdsChange([...new Set([...selectedTaskIds, task.id])])
                  } else {
                    onSelectedTaskIdsChange(selectedTaskIds.filter((id) => id !== task.id))
                  }
                  setLastClickedRowIndex(index)
                }}
                className="size-3.5 rounded border-slate-300"
              />
              <span>{index + 1}</span>
            </div>

            <div
              className={`rounded-sm border text-right outline-none transition-colors hover:border-indigo-200 hover:bg-indigo-50/60 ${
                isActiveCell("title")
                  ? "border-2 border-indigo-600 bg-indigo-50/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.8)]"
                  : "border-transparent"
              }`}
              style={{ paddingInlineStart: `${depth * 14}px` }}
            >
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
                  value={editingValue}
                  onChange={(event) => setEditingValue(event.target.value)}
                  onBlur={() => void commitEdit()}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => handleEditorKeyDown(event, index, "title")}
                  className="h-7 w-full rounded border border-indigo-200 px-2 text-xs outline-none"
                />
              ) : (
                <button
                  type="button"
                  className={`w-full rounded-sm px-1 text-right hover:bg-indigo-50 ${
                    isCritical ? "text-red-700 hover:text-red-800" : "hover:text-indigo-700"
                  }`}
                  ref={(el) => {
                    cellButtonRefs.current[cellKey(task.id, "title")] = el
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleCellClick(task.id, "title", dbTask.title)
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    startEdit(task.id, "title", dbTask.title)
                  }}
                  onKeyDown={(event) =>
                    handleCellKeyDown(event, task.id, index, "title", dbTask.title)
                  }
                >
                  {dbTask.title}
                </button>
              )}
            </div>

            <div
              className={`rounded-sm border text-right transition-colors hover:border-indigo-200 hover:bg-indigo-50/60 ${
                isActiveCell("progress")
                  ? "border-2 border-indigo-600 bg-indigo-50/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.8)]"
                  : "border-transparent"
              }`}
            >
              {isEditing("progress") ? (
                <input
                  autoFocus
                  type="number"
                  min={0}
                  max={100}
                  value={editingValue}
                  onChange={(event) => setEditingValue(event.target.value)}
                  onBlur={() => void commitEdit()}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => handleEditorKeyDown(event, index, "progress")}
                  className="h-7 w-full rounded border border-indigo-200 px-2 text-xs outline-none"
                />
              ) : (
                <button
                  type="button"
                  className="w-full rounded-sm px-1 text-right hover:bg-indigo-50 hover:text-indigo-700"
                  ref={(el) => {
                    cellButtonRefs.current[cellKey(task.id, "progress")] = el
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleCellClick(task.id, "progress", String(dbTask.progress))
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    startEdit(task.id, "progress", String(dbTask.progress))
                  }}
                  onKeyDown={(event) =>
                    handleCellKeyDown(event, task.id, index, "progress", String(dbTask.progress))
                  }
                >
                  {dbTask.progress}%
                </button>
              )}
            </div>

            <div
              className={`rounded-sm border text-right transition-colors hover:border-indigo-200 hover:bg-indigo-50/60 ${
                isActiveCell("duration")
                  ? "border-2 border-indigo-600 bg-indigo-50/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.8)]"
                  : "border-transparent"
              }`}
            >
              {isEditing("duration") ? (
                <input
                  autoFocus
                  type="number"
                  min={0}
                  value={editingValue}
                  onChange={(event) => setEditingValue(event.target.value)}
                  onBlur={() => void commitEdit()}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => handleEditorKeyDown(event, index, "duration")}
                  className="h-7 w-full rounded border border-indigo-200 px-2 text-xs outline-none"
                />
              ) : (
                <button
                  type="button"
                  className="w-full rounded-sm px-1 text-right hover:bg-indigo-50 hover:text-indigo-700"
                  ref={(el) => {
                    cellButtonRefs.current[cellKey(task.id, "duration")] = el
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleCellClick(task.id, "duration", String(duration))
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    startEdit(task.id, "duration", String(duration))
                  }}
                  onKeyDown={(event) =>
                    handleCellKeyDown(event, task.id, index, "duration", String(duration))
                  }
                >
                  {duration} ימים
                </button>
              )}
            </div>

            <div
              className={`rounded-sm border text-right transition-colors hover:border-indigo-200 hover:bg-indigo-50/60 ${
                isActiveCell("start_date")
                  ? "border-2 border-indigo-600 bg-indigo-50/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.8)]"
                  : "border-transparent"
              }`}
            >
              {isEditing("start_date") ? (
                <input
                  autoFocus
                  type="date"
                  value={editingValue}
                  onChange={(event) => setEditingValue(event.target.value)}
                  onBlur={() => void commitEdit()}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => handleEditorKeyDown(event, index, "start_date")}
                  className="h-7 w-full rounded border border-indigo-200 px-2 text-xs outline-none"
                />
              ) : (
                <button
                  type="button"
                  className="w-full rounded-sm px-1 text-right hover:bg-indigo-50 hover:text-indigo-700"
                  ref={(el) => {
                    cellButtonRefs.current[cellKey(task.id, "start_date")] = el
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleCellClick(task.id, "start_date", dbTask.start_date ?? "")
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    startEdit(task.id, "start_date", dbTask.start_date ?? "")
                  }}
                  onKeyDown={(event) =>
                    handleCellKeyDown(event, task.id, index, "start_date", dbTask.start_date ?? "")
                  }
                >
                  {formatGridDate(dbTask.start_date)}
                </button>
              )}
            </div>

            <div
              className={`rounded-sm border text-right transition-colors hover:border-indigo-200 hover:bg-indigo-50/60 ${
                isActiveCell("end_date")
                  ? "border-2 border-indigo-600 bg-indigo-50/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.8)]"
                  : "border-transparent"
              }`}
            >
              {isEditing("end_date") ? (
                <input
                  autoFocus
                  type="date"
                  value={editingValue}
                  onChange={(event) => setEditingValue(event.target.value)}
                  onBlur={() => void commitEdit()}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => handleEditorKeyDown(event, index, "end_date")}
                  className="h-7 w-full rounded border border-indigo-200 px-2 text-xs outline-none"
                />
              ) : (
                <button
                  type="button"
                  className="w-full rounded-sm px-1 text-right hover:bg-indigo-50 hover:text-indigo-700"
                  ref={(el) => {
                    cellButtonRefs.current[cellKey(task.id, "end_date")] = el
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleCellClick(task.id, "end_date", dbTask.end_date ?? "")
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    startEdit(task.id, "end_date", dbTask.end_date ?? "")
                  }}
                  onKeyDown={(event) =>
                    handleCellKeyDown(event, task.id, index, "end_date", dbTask.end_date ?? "")
                  }
                >
                  {formatGridDate(dbTask.end_date)}
                </button>
              )}
            </div>

            <div
              className={`text-right text-[11px] tabular-nums ${variance.className}`}
              title="סטייה בימים: סיום נוכחי מול סיום בסיס"
            >
              {variance.text}
            </div>

            <div
              className={`rounded-sm border text-right transition-colors hover:border-indigo-200 hover:bg-indigo-50/60 ${
                isActiveCell("resources")
                  ? "border-2 border-indigo-600 bg-indigo-50/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.8)]"
                  : "border-transparent"
              }`}
            >
              {isEditing("resources") ? (
                <input
                  autoFocus
                  value={editingValue}
                  onChange={(event) => setEditingValue(event.target.value)}
                  onBlur={() => void commitEdit()}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => handleEditorKeyDown(event, index, "resources")}
                  className="h-7 w-full rounded border border-indigo-200 px-2 text-xs outline-none"
                />
              ) : (
                <button
                  type="button"
                  className="w-full truncate rounded-sm px-1 text-right hover:bg-indigo-50 hover:text-indigo-700"
                  ref={(el) => {
                    cellButtonRefs.current[cellKey(task.id, "resources")] = el
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleCellClick(task.id, "resources", resources)
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    startEdit(task.id, "resources", resources)
                  }}
                  onKeyDown={(event) =>
                    handleCellKeyDown(event, task.id, index, "resources", resources)
                  }
                >
                  {resources || "—"}
                </button>
              )}
            </div>

            <div
              className={`rounded-sm border text-right transition-colors hover:border-indigo-200 hover:bg-indigo-50/60 ${
                isActiveCell("cost")
                  ? "border-2 border-indigo-600 bg-indigo-50/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.8)]"
                  : "border-transparent"
              }`}
            >
              {isEditing("cost") ? (
                <input
                  autoFocus
                  type="number"
                  min={0}
                  step="0.01"
                  value={editingValue}
                  onChange={(event) => setEditingValue(event.target.value)}
                  onBlur={() => void commitEdit()}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => handleEditorKeyDown(event, index, "cost")}
                  className="h-7 w-full rounded border border-indigo-200 px-2 text-xs outline-none"
                />
              ) : (
                <button
                  type="button"
                  className="w-full rounded-sm px-1 text-right hover:bg-indigo-50 hover:text-indigo-700"
                  ref={(el) => {
                    cellButtonRefs.current[cellKey(task.id, "cost")] = el
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleCellClick(task.id, "cost", String(dbTask.cost ?? 0))
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    startEdit(task.id, "cost", String(dbTask.cost ?? 0))
                  }}
                  onKeyDown={(event) =>
                    handleCellKeyDown(event, task.id, index, "cost", String(dbTask.cost ?? 0))
                  }
                >
                  {Number(dbTask.cost ?? 0).toLocaleString("he-IL", {
                    style: "currency",
                    currency: "ILS",
                    maximumFractionDigits: 2,
                  })}
                </button>
              )}
            </div>

          </div>
        )
      })}

      {contextMenu && portalReady
        ? createPortal(
            <div
              ref={contextMenuRef}
              className="fixed z-[2000] min-w-[210px] rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={(event) => event.stopPropagation()}
              onContextMenuCapture={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
            >
              <button
                type="button"
                className="block w-full rounded-md px-3 py-2 text-right text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  onContextEdit(contextMenu.taskId)
                  setContextMenu(null)
                }}
              >
                ערוך פרטים
              </button>
              <button
                type="button"
                className="block w-full rounded-md px-3 py-2 text-right text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  void onContextAddBelow(contextMenu.taskId)
                  setContextMenu(null)
                }}
              >
                הוסף משימה מתחת
              </button>
              <button
                type="button"
                className="block w-full rounded-md px-3 py-2 text-right text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  void onContextAddAbove(contextMenu.taskId)
                  setContextMenu(null)
                }}
              >
                הוסף משימה מעל
              </button>
              <button
                type="button"
                className="block w-full rounded-md px-3 py-2 text-right text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  onContextAddNote(contextMenu.taskId)
                  setContextMenu(null)
                }}
              >
                הוסף הערה
              </button>
              <button
                type="button"
                className="block w-full rounded-md px-3 py-2 text-right text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  void onContextIndent()
                  setContextMenu(null)
                }}
              >
                ערסול
              </button>
              <button
                type="button"
                className="block w-full rounded-md px-3 py-2 text-right text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  void onContextOutdent()
                  setContextMenu(null)
                }}
              >
                הוצא מערסול
              </button>
              <button
                type="button"
                className="block w-full rounded-md px-3 py-2 text-right text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  void onContextToggleMilestone(contextMenu.taskId)
                  setContextMenu(null)
                }}
              >
                הפוך לאבן דרך
              </button>
              <div className="my-1 h-px bg-slate-200" />
              <button
                type="button"
                className="block w-full rounded-md px-3 py-2 text-right text-sm text-red-600 hover:bg-red-50"
                onClick={() => {
                  void onContextDelete(contextMenu.taskId)
                  setContextMenu(null)
                }}
              >
                מחק משימה
              </button>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}

export function GanttBoard({ ganttId, projectId, ganttTitle }: GanttBoardProps) {
  const router = useRouter()
  const ganttShellRef = React.useRef<HTMLDivElement | null>(null)
  const [listWidth, setListWidth] = React.useState(600)
  const [isResizingSplitter, setIsResizingSplitter] = React.useState(false)
  const resizeStartRef = React.useRef<{ startX: number; startWidth: number } | null>(null)
  const [tasks, setTasks] = React.useState<GanttTask[]>([])
  const [loading, setLoading] = React.useState(true)
  const [savingTaskId, setSavingTaskId] = React.useState<string | null>(null)
  const [focusedTaskId, setFocusedTaskId] = React.useState<string | null>(null)
  const [selectedTaskIds, setSelectedTaskIds] = React.useState<string[]>([])
  const [hoveredTaskId, setHoveredTaskId] = React.useState<string | null>(null)
  const [dependencyDraft, setDependencyDraft] = React.useState<DependencyDraft | null>(null)
  const [collapsedProjectIds, setCollapsedProjectIds] = React.useState<Set<string>>(() => new Set())
  const [editingTaskId, setEditingTaskId] = React.useState<string | null>(null)
  const [editorMode, setEditorMode] = React.useState<EditorMode>("edit")
  const [isEditorOpen, setIsEditorOpen] = React.useState(false)
  const [isSavingEditor, setIsSavingEditor] = React.useState(false)
  const [projectGantts, setProjectGantts] = React.useState<GanttRecord[]>([])
  const [isCreatingGantt, setIsCreatingGantt] = React.useState(false)
  const [ganttSnapshots, setGanttSnapshots] = React.useState<GanttSnapshotRow[]>([])
  const [selectedSnapshotId, setSelectedSnapshotId] = React.useState<string>("latest")
  const [snapshotNameInput, setSnapshotNameInput] = React.useState("")
  const [snapshotType, setSnapshotType] = React.useState<GanttSnapshotRow["snapshot_type"]>("UPDATE")
  const [savingSnapshot, setSavingSnapshot] = React.useState(false)
  const [criticalPathEnabled, setCriticalPathEnabled] = React.useState(false)
  const [exportingType, setExportingType] = React.useState<"pdf" | "xlsx" | "csv" | null>(null)
  const [isCreateGanttDialogOpen, setIsCreateGanttDialogOpen] = React.useState(false)
  const [newGanttName, setNewGanttName] = React.useState("")
  const [newGanttProjectId, setNewGanttProjectId] = React.useState(projectId)
  const [notesEditorTaskId, setNotesEditorTaskId] = React.useState<string | null>(null)
  const [notesDraft, setNotesDraft] = React.useState("")
  const [editForm, setEditForm] = React.useState<EditFormState>({
    title: "",
    start_date: "",
    end_date: "",
    progress: 0,
    resources: "",
    cost: 0,
    baseline_start: "",
    baseline_end: "",
    actual_start: "",
    actual_end: "",
    is_milestone: false,
    schedule_mode: "auto",
    parent_id: null,
  })

  React.useEffect(() => {
    if (!isResizingSplitter) return
    const minWidth = 360
    const maxWidth = 1400
    const onPointerMove = (event: PointerEvent) => {
      const start = resizeStartRef.current
      if (!start) return
      const deltaX = event.clientX - start.startX
      const nextWidth = Math.max(minWidth, Math.min(maxWidth, start.startWidth - deltaX))
      setListWidth(nextWidth)
    }
    const onPointerUp = () => {
      setIsResizingSplitter(false)
      resizeStartRef.current = null
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
    }
  }, [isResizingSplitter])

  React.useEffect(() => {
    setNewGanttProjectId(projectId)
  }, [projectId])

  const loadTasks = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchTasks(ganttId)
      setTasks(data)
    } catch (error) {
      toast.error(formatError(error))
    } finally {
      setLoading(false)
    }
  }, [ganttId])

  const loadSnapshots = React.useCallback(async () => {
    try {
      const data = await fetchGanttSnapshots(ganttId)
      setGanttSnapshots(data)
    } catch (error) {
      toast.error(formatError(error))
    }
  }, [ganttId])

  const loadProjectGantts = React.useCallback(async () => {
    try {
      const data = await fetchGanttsByProject(projectId)
      setProjectGantts(data)
    } catch (error) {
      toast.error(formatError(error))
    }
  }, [projectId])

  React.useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  React.useEffect(() => {
    void loadSnapshots()
  }, [loadSnapshots])

  React.useEffect(() => {
    void loadProjectGantts()
  }, [loadProjectGantts])

  React.useEffect(() => {
    setSelectedSnapshotId("latest")
  }, [ganttId])

  React.useEffect(() => {
    const valid = new Set(tasks.map((task) => task.id))
    setSelectedTaskIds((prev) => prev.filter((id) => valid.has(id)))
    setFocusedTaskId((prev) => (prev && valid.has(prev) ? prev : null))
  }, [tasks])

  const floatByTaskId = React.useMemo(() => calculateFloatByTaskId(tasks), [tasks])
  const criticalTaskIds = React.useMemo(() => {
    if (!criticalPathEnabled) return new Set<string>()
    const out = new Set<string>()
    floatByTaskId.forEach((float, taskId) => {
      if (float === 0) out.add(taskId)
    })
    return out
  }, [criticalPathEnabled, floatByTaskId])
  const chartTasks = React.useMemo(
    () => mapDbTasksToChartTasks(tasks, collapsedProjectIds, criticalTaskIds),
    [tasks, collapsedProjectIds, criticalTaskIds]
  )
  const chartTaskById = React.useMemo(() => new Map(chartTasks.map((task) => [task.id, task])), [chartTasks])
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
  const currentGanttName = React.useMemo(() => {
    const selectedName = projectGantts.find((gantt) => gantt.id === ganttId)?.name
    return safeDisplayName(selectedName ?? ganttTitle, "תרשים גאנט")
  }, [ganttId, ganttTitle, projectGantts])
  const selectedProjectOption = React.useMemo(
    () => ({ id: projectId, name: "הפרויקט הנוכחי" }),
    [projectId]
  )
  const currentProjectName = React.useMemo(
    () => safeDisplayName(selectedProjectOption.name, "הפרויקט הנוכחי"),
    [selectedProjectOption.name]
  )
  const selectedSnapshot = React.useMemo(
    () => ganttSnapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? null,
    [ganttSnapshots, selectedSnapshotId]
  )
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
        resources: (row.resources ?? [])
          .map((resource) => resource.label || resource.role || resource.resourceId || resource.subcontractorId || "")
          .filter(Boolean)
          .join(", "),
        cost: row.cost ?? 0,
        baseline_start: row.baseline_start ?? "",
        baseline_end: row.baseline_end ?? "",
        actual_start: row.actual_start ?? "",
        actual_end: row.actual_end ?? "",
        is_milestone: row.is_milestone,
        schedule_mode: row.schedule_mode,
        parent_id: row.parent_id,
      })
      setIsEditorOpen(true)
    },
    [taskById]
  )

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

    const onMouseMove = (event: Event) => {
      const e = event as MouseEvent
      const group = getTaskGroup(e.target)
      const hoverTaskId = group?.getAttribute("data-task-id") ?? null
      setHoveredTaskId(hoverTaskId)
      setDependencyDraft((prev) => {
        if (!prev) return prev
        const local = toLocalPoint(e.clientX, e.clientY)
        return { ...prev, x2: local.x, y2: local.y }
      })
    }

    const onMouseDown = (event: Event) => {
      const e = event as MouseEvent
      const group = getTaskGroup(e.target)
      const taskId = group?.getAttribute("data-task-id")
      if (!taskId || !group) return
      const box = group.getBoundingClientRect()
      const edgeThresholdPx = 10
      const nearStart = Math.abs(e.clientX - box.left) <= edgeThresholdPx
      const nearEnd = Math.abs(e.clientX - box.right) <= edgeThresholdPx
      if (!nearStart && !nearEnd) return
      const local = toLocalPoint(e.clientX, e.clientY)
      setDependencyDraft({
        fromTaskId: taskId,
        fromSide: nearStart ? "start" : "end",
        x1: local.x,
        y1: local.y,
        x2: local.x,
        y2: local.y,
      })
      e.preventDefault()
    }

    const onMouseUp = (event: Event) => {
      const e = event as MouseEvent
      setDependencyDraft((draft) => {
        if (!draft) return null
        const dropEl = document.elementFromPoint(e.clientX, e.clientY)
        const targetGroup = getTaskGroup(dropEl)
        const targetTaskId = targetGroup?.getAttribute("data-task-id") ?? null
        if (targetTaskId && targetTaskId !== draft.fromTaskId) {
          const targetRow = taskById.get(targetTaskId)
          const sourceRow = taskById.get(draft.fromTaskId)
          if (targetRow) {
            const hasDependency = targetRow.dependencies.some(
              (dependency) => dependency.taskId === draft.fromTaskId
            )
            if (!hasDependency) {
              const sourceEnd = sourceRow?.end_date ?? sourceRow?.start_date
              const nextStart = sourceEnd ? shiftIsoDate(sourceEnd, 1) : targetRow.start_date
              const currentDuration = Math.max(
                1,
                dateDiffDays(targetRow.start_date, targetRow.end_date, targetRow.is_milestone)
              )
              let nextEnd = targetRow.end_date
              if (nextStart) {
                const startDate = parseISO(nextStart)
                if (!Number.isNaN(startDate.getTime())) {
                  if (targetRow.is_milestone) {
                    nextEnd = nextStart
                  } else {
                    nextEnd = format(addDays(startDate, currentDuration - 1), "yyyy-MM-dd")
                  }
                }
              }
              const nextDependencies = [
                ...targetRow.dependencies,
                { taskId: draft.fromTaskId, type: "FS" as const, lag: 0 },
              ]
              const previous = tasks
              const patch = {
                dependencies: nextDependencies,
                start_date: nextStart ?? targetRow.start_date,
                end_date: nextEnd,
              }
              setTasks((prev) =>
                prev.map((task) =>
                  task.id === targetTaskId ? { ...task, ...patch } : task
                )
              )
              void updateTask(targetTaskId, patch)
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

  React.useEffect(() => {
    const root = ganttShellRef.current
    if (!root) return
    const timelineCol = root.querySelector(".mo-gantt-timeline-col")
    if (!timelineCol) return

    const dayMs = 24 * 60 * 60 * 1000
    timelineCol.querySelectorAll('rect[data-baseline-ghost="true"]').forEach((node) => node.remove())

    const groups = timelineCol.querySelectorAll("g[data-task-id]")
    groups.forEach((group) => {
      const taskId = group.getAttribute("data-task-id")
      if (!taskId) return
      const dbTask = taskById.get(taskId)
      const chartTask = chartTaskById.get(taskId)
      if (!dbTask || !chartTask || !dbTask.baseline_start || !dbTask.baseline_end) return

      const baselineStartMs = Date.parse(`${dbTask.baseline_start}T00:00:00.000Z`)
      const baselineEndMs = Date.parse(`${dbTask.baseline_end}T00:00:00.000Z`)
      if (Number.isNaN(baselineStartMs) || Number.isNaN(baselineEndMs)) return

      const chartStartMs = chartTask.start.getTime()
      const chartEndMs = chartTask.end.getTime()
      const chartDurationMs = Math.max(dayMs, chartEndMs - chartStartMs)

      const rect = group.querySelector("rect")
      if (!rect) return
      const mainX = Number(rect.getAttribute("x") ?? 0)
      const mainY = Number(rect.getAttribute("y") ?? 0)
      const mainWidth = Number(rect.getAttribute("width") ?? 0)
      const mainHeight = Number(rect.getAttribute("height") ?? 0)
      if (!mainWidth || !mainHeight) return

      const pxPerMs = mainWidth / chartDurationMs
      const baselineX = mainX + (baselineStartMs - chartStartMs) * pxPerMs
      const baselineDurationMs = Math.max(dayMs, baselineEndMs - baselineStartMs + dayMs)
      const baselineWidth = Math.max(4, baselineDurationMs * pxPerMs)
      const baselineHeight = Math.max(3, Math.min(6, mainHeight * 0.35))
      const baselineY = mainY + mainHeight + 1

      const ghostRect = document.createElementNS("http://www.w3.org/2000/svg", "rect")
      ghostRect.setAttribute("x", String(baselineX))
      ghostRect.setAttribute("y", String(baselineY))
      ghostRect.setAttribute("width", String(baselineWidth))
      ghostRect.setAttribute("height", String(baselineHeight))
      ghostRect.setAttribute("rx", "2")
      ghostRect.setAttribute("ry", "2")
      ghostRect.setAttribute("fill", "#94a3b8")
      ghostRect.setAttribute("fill-opacity", "0.45")
      ghostRect.setAttribute("stroke", "#475569")
      ghostRect.setAttribute("stroke-opacity", "0.5")
      ghostRect.setAttribute("stroke-dasharray", "4 3")
      ghostRect.setAttribute("pointer-events", "none")
      ghostRect.setAttribute("data-baseline-ghost", "true")
      group.appendChild(ghostRect)
    })
  }, [chartTaskById, taskById, chartTasks])

  const saveGanttSnapshot = React.useCallback(async () => {
    const name = snapshotNameInput.trim()
    if (!name) {
      toast.error("נא להזין שם לגרסה")
      return
    }
    setSavingSnapshot(true)
    try {
      await createGanttSnapshot(ganttId, name, snapshotType)
      toast.success("צילום המצב נשמר")
      setSnapshotNameInput("")
      await loadSnapshots()
    } catch (error) {
      toast.error(formatError(error))
    } finally {
      setSavingSnapshot(false)
    }
  }, [ganttId, loadSnapshots, snapshotNameInput, snapshotType])

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
      if (field === "progress") {
        patch = {
          progress: Math.max(0, Math.min(100, Math.round(Number(value) || 0))),
        }
      }
      if (field === "duration") {
        const normalizedDuration = Math.max(0, Math.round(Number(value) || 0))
        const effectiveDuration = normalizedDuration === 0 ? 1 : normalizedDuration
        const startDate =
          row.start_date ??
          row.end_date ??
          format(startOfDay(new Date()), "yyyy-MM-dd")
        patch = {
          start_date: startDate,
          end_date: shiftIsoDate(startDate, Math.max(0, effectiveDuration - 1)),
        }
      }
      if (field === "baseline_start") {
        patch = { baseline_start: value || null }
      }
      if (field === "baseline_end") {
        patch = { baseline_end: value || null }
      }
      if (field === "resources") {
        patch = {
          resources: value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
            .map((label) => ({ label })),
        }
      }
      if (field === "cost") {
        patch = {
          cost: Math.max(0, Number(Number(value || 0).toFixed(2))),
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
    [tasks]
  )

  const createRelativeTask = React.useCallback(
    async (anchorTaskId: string, direction: "above" | "below") => {
      const anchorIndex = tasks.findIndex((task) => task.id === anchorTaskId)
      const anchor = taskById.get(anchorTaskId)
      const isEmpty = tasks.length === 0
      const delta = direction === "above" ? -1 : 1
      const today = format(startOfDay(new Date()), "yyyy-MM-dd")
      const nextStart = isEmpty
        ? today
        : shiftIsoDate(anchor?.start_date ?? null, delta) ?? anchor?.start_date ?? today
      const nextEnd = isEmpty
        ? today
        : shiftIsoDate(anchor?.end_date ?? null, delta) ?? anchor?.end_date ?? nextStart
      const insertAt =
        anchorIndex === -1 ? Math.max(0, tasks.length) : direction === "below" ? anchorIndex + 1 : anchorIndex
      const tempId = `temp-${Date.now()}`
      const tempRow: GanttTask = {
        id: tempId,
        project_id: projectId,
        gantt_id: ganttId,
        parent_id: anchor?.parent_id ?? null,
        title: "משימה חדשה",
        phase: anchor?.phase || "שלב כללי",
        start_date: nextStart,
        end_date: nextEnd,
        progress: 0,
        status: "Not Started",
        is_milestone: false,
        schedule_mode: anchor?.schedule_mode ?? "auto",
        dependencies: [],
        resources: [],
        cost: 0,
        baseline_start: null,
        baseline_end: null,
        actual_start: null,
        actual_end: null,
        constraint_type: null,
        constraint_date: null,
        notes: null,
        created_at: new Date().toISOString(),
      }
      setSavingTaskId(anchorTaskId)
      setTasks((prev) => {
        const next = [...prev]
        next.splice(insertAt, 0, tempRow)
        return next
      })
      try {
        const created = await createTaskAction({
          project_id: projectId,
          gantt_id: ganttId,
          parent_id: anchor?.parent_id ?? null,
          title: "משימה חדשה",
          phase: anchor?.phase || "שלב כללי",
          start_date: nextStart,
          end_date: nextEnd,
          progress: 0,
          status: "Not Started",
          schedule_mode: anchor?.schedule_mode ?? "auto",
          resources: [],
          cost: 0,
        })
        setTasks((prev) => prev.map((task) => (task.id === tempId ? created : task)))
        toast.success(direction === "above" ? "נוספה משימה מעל" : "נוספה משימה מתחת")
        await loadTasks()
      } catch (error) {
        setTasks((prev) => prev.filter((task) => task.id !== tempId))
        toast.error(formatError(error))
      } finally {
        setSavingTaskId(null)
      }
    },
    [ganttId, loadTasks, projectId, taskById, tasks]
  )

  const toggleMilestoneByTaskId = React.useCallback(
    async (taskId: string) => {
      const row = taskById.get(taskId)
      if (!row) return
      const nextIsMilestone = !row.is_milestone
      const patch = {
        is_milestone: nextIsMilestone,
        end_date: nextIsMilestone ? row.start_date ?? row.end_date : row.end_date,
      }
      const previous = tasks
      setSavingTaskId(taskId)
      setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, ...patch } : task)))
      try {
        const saved = await updateTask(taskId, patch)
        setTasks((prev) => prev.map((task) => (task.id === taskId ? saved : task)))
        toast.success(nextIsMilestone ? "המשימה הוגדרה כאבן דרך" : "אבן הדרך בוטלה")
      } catch (error) {
        setTasks(previous)
        toast.error(formatError(error))
      } finally {
        setSavingTaskId(null)
      }
    },
    [taskById, tasks]
  )

  const deleteTaskById = React.useCallback(
    async (taskId: string) => {
      const previous = tasks
      setSavingTaskId(taskId)
      setTasks((prev) => prev.filter((task) => task.id !== taskId))
      try {
        await deleteTaskAction(taskId)
        toast.success("המשימה נמחקה")
        await loadTasks()
      } catch (error) {
        setTasks(previous)
        toast.error(formatError(error))
      } finally {
        setSavingTaskId(null)
      }
    },
    [loadTasks, tasks]
  )

  const indentSelectedTasks = React.useCallback(async () => {
    if (selectedTaskIds.length === 0) {
      toast.error("יש לבחור לפחות משימה אחת לערסול")
      return
    }
    const selectedSet = new Set(selectedTaskIds)
    const orderedIds = chartTasks.map((task) => task.id)
    const firstSelectedIndex = orderedIds.findIndex((id) => selectedSet.has(id))
    if (firstSelectedIndex <= 0) {
      toast.error("לא ניתן לערסל את השורה הראשונה")
      return
    }
    const newParentId = orderedIds[firstSelectedIndex - 1]
    if (!newParentId) return
    if (selectedSet.has(newParentId)) {
      toast.error("משימת האב לא יכולה להיות חלק מהבחירה")
      return
    }

    const previous = tasks
    setTasks((prev) =>
      prev.map((task) =>
        selectedSet.has(task.id) ? { ...task, parent_id: newParentId } : task
      )
    )
    setSavingTaskId(newParentId)
    try {
      await Promise.all(
        selectedTaskIds.map((taskId) => updateTask(taskId, { parent_id: newParentId }))
      )
      toast.success("ערסול בוצע בהצלחה")
      await loadTasks()
    } catch (error) {
      setTasks(previous)
      toast.error(formatError(error))
    } finally {
      setSavingTaskId(null)
    }
  }, [chartTasks, loadTasks, selectedTaskIds, tasks])

  const outdentSelectedTasks = React.useCallback(async () => {
    if (selectedTaskIds.length === 0) {
      toast.error("יש לבחור משימה להוצאה מערסול")
      return
    }
    const updates = selectedTaskIds
      .map((id) => {
        const row = taskById.get(id)
        if (!row?.parent_id) return null
        const parent = taskById.get(row.parent_id)
        const newParent = parent?.parent_id ?? null
        return { id, newParent }
      })
      .filter((u): u is { id: string; newParent: string | null } => u !== null)

    if (updates.length === 0) {
      toast.error("לא ניתן להוציא משימות ברמה העליונה")
      return
    }

    const previous = tasks
    setTasks((prev) =>
      prev.map((task) => {
        const u = updates.find((x) => x.id === task.id)
        if (!u) return task
        return { ...task, parent_id: u.newParent }
      })
    )
    setSavingTaskId("outdent")
    try {
      await Promise.all(updates.map((u) => updateTask(u.id, { parent_id: u.newParent })))
      toast.success("הוצאו מערסול")
      await loadTasks()
    } catch (error) {
      setTasks(previous)
      toast.error(formatError(error))
    } finally {
      setSavingTaskId(null)
    }
  }, [loadTasks, selectedTaskIds, taskById, tasks])

  const addMilestoneBelowFocused = React.useCallback(async () => {
    const anchorId = focusedTaskId || selectedTaskIds[0] || chartTasks[0]?.id || null
    if (!anchorId) {
      toast.error("בחר פעילות")
      return
    }
    const anchor = taskById.get(anchorId)
    if (!anchor) return
    const day =
      anchor.start_date ??
      anchor.end_date ??
      format(startOfDay(new Date()), "yyyy-MM-dd")
    const insertAt = Math.max(
      0,
      tasks.findIndex((task) => task.id === anchorId) + 1
    )
    const tempId = `temp-${Date.now()}`
    const tempRow: GanttTask = {
      id: tempId,
      project_id: projectId,
      gantt_id: ganttId,
      parent_id: anchor.parent_id,
      title: "אבן דרך",
      phase: anchor.phase || "שלב כללי",
      start_date: day,
      end_date: day,
      progress: 0,
      status: "Not Started",
      is_milestone: true,
      schedule_mode: anchor.schedule_mode,
      dependencies: [],
      resources: [],
      cost: 0,
      baseline_start: null,
      baseline_end: null,
      actual_start: null,
      actual_end: null,
      constraint_type: null,
      constraint_date: null,
      notes: null,
      created_at: new Date().toISOString(),
    }
    setSavingTaskId(anchorId)
    setTasks((prev) => {
      const next = [...prev]
      next.splice(insertAt, 0, tempRow)
      return next
    })
    try {
      const created = await createTaskAction({
        project_id: projectId,
        gantt_id: ganttId,
        parent_id: anchor.parent_id,
        title: "אבן דרך",
        phase: anchor.phase || "שלב כללי",
        start_date: day,
        end_date: day,
        progress: 0,
        status: "Not Started",
        is_milestone: true,
        schedule_mode: anchor.schedule_mode,
        resources: [],
        cost: 0,
      })
      setTasks((prev) => prev.map((task) => (task.id === tempId ? created : task)))
      toast.success("נוספה אבן דרך")
      await loadTasks()
    } catch (error) {
      setTasks((prev) => prev.filter((task) => task.id !== tempId))
      toast.error(formatError(error))
    } finally {
      setSavingTaskId(null)
    }
  }, [chartTasks, focusedTaskId, ganttId, loadTasks, projectId, selectedTaskIds, taskById, tasks])

  const handleAddTask = React.useCallback(async () => {
    if (tasks.length === 0) {
      await createRelativeTask("first-task", "below")
      return
    }
    const anchorId = focusedTaskId || selectedTaskIds[0] || chartTasks[0]?.id || null
    if (!anchorId) {
      await createRelativeTask("fallback-task", "below")
      return
    }
    await createRelativeTask(anchorId, "below")
  }, [chartTasks, createRelativeTask, focusedTaskId, selectedTaskIds, tasks.length])

  const scrollTimelineToFocusedTask = React.useCallback(() => {
    if (!focusedTaskId) {
      toast.error("בחר פעילות")
      return
    }
    requestAnimationFrame(() => {
      const shell = ganttShellRef.current
      const group = shell?.querySelector(`g[data-task-id="${focusedTaskId}"]`)
      group?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" })
    })
  }, [focusedTaskId])

  const applyProgressPercent = React.useCallback(
    async (pct: number) => {
      const progress = Math.max(0, Math.min(100, Math.round(pct)))
      const ids =
        selectedTaskIds.length > 0
          ? selectedTaskIds
          : focusedTaskId
            ? [focusedTaskId]
            : []
      if (ids.length === 0) {
        toast.error("בחר משימה")
        return
      }
      const previous = tasks
      setTasks((prev) =>
        prev.map((task) => (ids.includes(task.id) ? { ...task, progress } : task))
      )
      setSavingTaskId("progress")
      try {
        await Promise.all(ids.map((taskId) => updateTask(taskId, { progress })))
        await loadTasks()
      } catch (error) {
        setTasks(previous)
        toast.error(formatError(error))
      } finally {
        setSavingTaskId(null)
      }
    },
    [focusedTaskId, loadTasks, selectedTaskIds, tasks]
  )

  const saveCurrentPlanAsBaseline = React.useCallback(async () => {
    try {
      setSavingTaskId("baseline")
      const result = await setGanttBaseline(ganttId)
      toast.success(`תוכנית בסיס נשמרה עבור ${result.updated} משימות`)
      await loadTasks()
    } catch (error) {
      toast.error(formatError(error))
    } finally {
      setSavingTaskId(null)
    }
  }, [ganttId, loadTasks])

  const openNotesEditorForTask = React.useCallback(
    (taskId: string) => {
      const task = taskById.get(taskId)
      if (!task) return
      setFocusedTaskId(taskId)
      setNotesEditorTaskId(taskId)
      setNotesDraft(task.notes ?? "")
    },
    [taskById]
  )

  const commitTaskNotes = React.useCallback(async () => {
    if (!notesEditorTaskId) return
    const nextNotes = notesDraft.trim() ? notesDraft.trim() : null
    const previous = tasks
    setTasks((prev) => prev.map((task) => (task.id === notesEditorTaskId ? { ...task, notes: nextNotes } : task)))
    setSavingTaskId(notesEditorTaskId)
    try {
      const saved = await updateTask(notesEditorTaskId, { notes: nextNotes })
      setTasks((prev) => prev.map((task) => (task.id === notesEditorTaskId ? saved : task)))
      setNotesEditorTaskId(null)
      setNotesDraft("")
      toast.success("הערה נשמרה")
    } catch (error) {
      setTasks(previous)
      toast.error(formatError(error))
    } finally {
      setSavingTaskId(null)
    }
  }, [notesDraft, notesEditorTaskId, tasks])

  const buildExportRows = React.useCallback(() => {
    return chartTasks
      .map((chartTask, index) => {
        const row = taskById.get(chartTask.id)
        if (!row) return null
        const varianceDays = scheduleVarianceDays(row)
        return {
          Row: index + 1,
          Task: row.title,
          Phase: row.phase,
          Milestone: row.is_milestone ? "Yes" : "No",
          Progress: row.progress,
          Start: row.start_date ?? "",
          End: row.end_date ?? "",
          BaselineStart: row.baseline_start ?? "",
          BaselineEnd: row.baseline_end ?? "",
          VarianceDays: varianceDays ?? "",
          FloatDays: floatByTaskId.get(row.id) ?? 0,
          Critical: criticalTaskIds.has(row.id) ? "Yes" : "No",
          Resources: (row.resources ?? [])
            .map((resource) => resource.label || resource.role || resource.resourceId || resource.subcontractorId || "")
            .filter(Boolean)
            .join(", "),
          Cost: Number(row.cost ?? 0),
          Notes: row.notes ?? "",
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
  }, [chartTasks, criticalTaskIds, floatByTaskId, taskById])

  const exportAsSpreadsheet = React.useCallback(
    async (type: "xlsx" | "csv") => {
      const rows = buildExportRows()
      if (rows.length === 0) {
        toast.error("אין נתונים לייצוא")
        return
      }
      const filePrefix = (ganttTitle?.trim() || "gantt-export").replace(/[^\w\u0590-\u05FF-]+/g, "_")
      const loadingToastId = toast.loading(type === "xlsx" ? "מייצא לאקסל..." : "מייצא CSV...")
      setExportingType(type)
      try {
        const sheet = XLSX.utils.json_to_sheet(rows)
        if (type === "xlsx") {
          const workbook = XLSX.utils.book_new()
          XLSX.utils.book_append_sheet(workbook, sheet, "Tasks")
          XLSX.writeFile(workbook, `${filePrefix}.xlsx`)
        } else {
          const csv = XLSX.utils.sheet_to_csv(sheet)
          const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" })
          const url = URL.createObjectURL(blob)
          const link = document.createElement("a")
          link.href = url
          link.download = `${filePrefix}.csv`
          document.body.appendChild(link)
          link.click()
          link.remove()
          URL.revokeObjectURL(url)
        }
        toast.dismiss(loadingToastId)
        toast.success(type === "xlsx" ? "קובץ אקסל נוצר" : "קובץ CSV נוצר")
      } catch (error) {
        toast.dismiss(loadingToastId)
        toast.error(formatError(error))
      } finally {
        setExportingType(null)
      }
    },
    [buildExportRows, ganttTitle]
  )

  const exportAsPdf = React.useCallback(async () => {
    const shell = ganttShellRef.current
    if (!shell) {
      toast.error("לא נמצא רכיב לייצוא")
      return
    }
    const target =
      (shell.querySelector(".mo-gantt-root") as HTMLElement | null) ??
      (shell.querySelector(".gantt-task-react-root") as HTMLElement | null) ??
      shell
    const filePrefix = (ganttTitle?.trim() || "gantt-export").replace(/[^\w\u0590-\u05FF-]+/g, "_")
    const loadingToastId = toast.loading("מייצא PDF... ייתכן שייקח מספר שניות")
    setExportingType("pdf")
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ])
      const area = target.scrollWidth * target.scrollHeight
      const captureScale = area > 12_000_000 ? 1.35 : 2
      const canvas = await html2canvas(target, {
        scale: captureScale,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        windowWidth: target.scrollWidth,
        windowHeight: target.scrollHeight,
      })
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const marginMm = 8
      const printableWidthMm = pageWidth - marginMm * 2
      const printableHeightMm = pageHeight - marginMm * 2
      const pxPerMm = canvas.width / printableWidthMm
      const pageSliceHeightPx = Math.max(1, Math.floor(printableHeightMm * pxPerMm))

      // Split tall timelines into PDF pages instead of shrinking to one page.
      let renderedHeightPx = 0
      let pageIndex = 0
      while (renderedHeightPx < canvas.height) {
        const sliceHeightPx = Math.min(pageSliceHeightPx, canvas.height - renderedHeightPx)
        const pageCanvas = document.createElement("canvas")
        pageCanvas.width = canvas.width
        pageCanvas.height = sliceHeightPx
        const pageCtx = pageCanvas.getContext("2d")
        if (!pageCtx) throw new Error("Unable to build PDF page context")
        pageCtx.fillStyle = "#ffffff"
        pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
        pageCtx.drawImage(
          canvas,
          0,
          renderedHeightPx,
          canvas.width,
          sliceHeightPx,
          0,
          0,
          pageCanvas.width,
          pageCanvas.height
        )

        if (pageIndex > 0) {
          pdf.addPage()
        }
        const sliceHeightMm = sliceHeightPx / pxPerMm
        pdf.addImage(
          pageCanvas.toDataURL("image/png"),
          "PNG",
          marginMm,
          marginMm,
          printableWidthMm,
          sliceHeightMm
        )
        renderedHeightPx += sliceHeightPx
        pageIndex += 1
      }

      pdf.save(`${filePrefix}.pdf`)
      toast.dismiss(loadingToastId)
      toast.success("קובץ PDF נוצר")
    } catch (error) {
      toast.dismiss(loadingToastId)
      toast.error(formatError(error))
    } finally {
      setExportingType(null)
    }
  }, [ganttTitle])

  const onActiveGanttSelect = React.useCallback(
    (nextGanttId: string) => {
      if (!nextGanttId || nextGanttId === ganttId) return
      router.push(`/marker-ofek/projects/gantt/${nextGanttId}`)
    },
    [ganttId, router]
  )

  const createNewGanttForProject = React.useCallback(async () => {
    const name = newGanttName.trim()
    if (!name) {
      toast.error("נא להזין שם גאנט")
      return
    }
    setIsCreatingGantt(true)
    try {
      const created = await createGantt({
        project_id: newGanttProjectId || projectId,
        name,
      })
      toast.success("הגאנט נוצר")
      setIsCreateGanttDialogOpen(false)
      setNewGanttName("")
      await loadProjectGantts()
      router.push(`/marker-ofek/projects/gantt/${created.id}`)
    } catch (error) {
      toast.error(formatError(error))
    } finally {
      setIsCreatingGantt(false)
    }
  }, [loadProjectGantts, newGanttName, newGanttProjectId, projectId, router])

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
        selectedTaskIds={selectedTaskIds}
        onSelectedTaskIdsChange={setSelectedTaskIds}
        onFocusedTaskChange={setFocusedTaskId}
        onContextEdit={openEditorForTask}
        onContextAddAbove={(taskId) => createRelativeTask(taskId, "above")}
        onContextAddBelow={(taskId) => createRelativeTask(taskId, "below")}
        onContextToggleMilestone={toggleMilestoneByTaskId}
        onContextDelete={deleteTaskById}
        onContextAddNote={openNotesEditorForTask}
        onContextIndent={indentSelectedTasks}
        onContextOutdent={outdentSelectedTasks}
        onInlineCommit={commitInlineEdit}
        criticalTaskIds={criticalTaskIds}
      />
    ),
    [
      commitInlineEdit,
      depthByTaskId,
      hasChildrenByTaskId,
      collapsedProjectIds,
      onToggleCollapse,
      selectedTaskIds,
      openEditorForTask,
      createRelativeTask,
      toggleMilestoneByTaskId,
      deleteTaskById,
      openNotesEditorForTask,
      indentSelectedTasks,
      outdentSelectedTasks,
      criticalTaskIds,
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
      progress: Math.max(0, Math.min(100, Math.round(Number(editForm.progress) || 0))),
      resources: editForm.resources
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((label) => ({ label })),
      cost: Math.max(0, Number(Number(editForm.cost || 0).toFixed(2))),
      baseline_start: editForm.baseline_start.trim() || null,
      baseline_end: editForm.baseline_end.trim() || null,
      actual_start: editForm.actual_start.trim() || null,
      actual_end: editForm.actual_end.trim() || null,
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
          gantt_id: ganttId,
          phase: "שלב כללי",
          status: "Not Started",
          dependencies: [],
          constraint_type: null,
          constraint_date: null,
          created_at: new Date().toISOString(),
          ...optimistic,
          notes: null,
        }
        setTasks((prev) => [...prev, tempRow])

        const created = await createTaskAction({
          project_id: projectId,
          gantt_id: ganttId,
          parent_id: optimistic.parent_id,
          title: optimistic.title,
          phase: "שלב כללי",
          start_date: optimistic.start_date,
          end_date: optimistic.end_date,
          progress: optimistic.progress,
          resources: optimistic.resources,
          cost: optimistic.cost,
          baseline_start: optimistic.baseline_start,
          baseline_end: optimistic.baseline_end,
          actual_start: optimistic.actual_start,
          actual_end: optimistic.actual_end,
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
  }, [editingTaskId, editForm, editorMode, ganttId, loadTasks, projectId, tasks])

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        טוען משימות גאנט...
      </div>
    )
  }

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{ganttTitle?.trim() || "תרשים גאנט"}</p>
          <p className="text-[11px] text-slate-500">
            {savingTaskId ? "שומר עדכון…" : `${tasks.length} משימות נטענו`}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-300/90 bg-gradient-to-b from-slate-100/90 to-white shadow-sm ring-1 ring-slate-200/60">
        <div
          dir="rtl"
          className="flex w-full flex-wrap items-stretch justify-start border-b border-slate-200/80 bg-slate-50/95"
        >
          <MsProjectRibbonGroup title="ניהול גאנט">
            <Select value={ganttId} onValueChange={onActiveGanttSelect}>
              <SelectTrigger className="h-8 w-[220px] border-slate-200 bg-white text-xs">
                <span className="truncate text-right" title={currentGanttName}>
                  {currentGanttName || "בחר גאנט..."}
                </span>
              </SelectTrigger>
              <SelectContent>
                {projectGantts.length === 0 ? (
                  <SelectItem value={ganttId}>
                    {safeDisplayName(ganttTitle, "תרשים גאנט")}
                  </SelectItem>
                ) : (
                  projectGantts.map((gantt) => (
                    <SelectItem key={gantt.id} value={gantt.id}>
                      {safeDisplayName(gantt.name, "גאנט ללא שם")}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-slate-200 bg-white text-xs shadow-sm"
              disabled={isCreatingGantt}
              onClick={() => {
                setNewGanttProjectId(projectId)
                setNewGanttName("")
                setIsCreateGanttDialogOpen(true)
              }}
            >
              {isCreatingGantt ? "יוצר..." : "גאנט חדש"}
            </Button>
          </MsProjectRibbonGroup>
          <MsProjectRibbonGroup title="עריכה">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 border-slate-200 bg-white text-xs shadow-sm"
              onClick={() => scrollTimelineToFocusedTask()}
            >
              <Locate className="size-3.5 shrink-0" aria-hidden />
              גלול אל הפעילות
            </Button>
          </MsProjectRibbonGroup>
          <MsProjectRibbonGroup title="הוספה">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 border-slate-200 bg-white text-xs shadow-sm"
              onClick={() => void handleAddTask()}
            >
              משימה חדשה
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 border-slate-200 bg-white text-xs shadow-sm"
              onClick={() => void addMilestoneBelowFocused()}
            >
              <Flag className="size-3.5 shrink-0" aria-hidden />
              אבן דרך
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 border-slate-200 bg-white text-xs shadow-sm"
              onClick={() => void indentSelectedTasks()}
            >
              <IndentIncrease className="size-3.5 shrink-0" aria-hidden />
              ערסול
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 border-slate-200 bg-white text-xs shadow-sm"
              onClick={() => void outdentSelectedTasks()}
            >
              <IndentDecrease className="size-3.5 shrink-0" aria-hidden />
              הזחה החוצה
            </Button>
          </MsProjectRibbonGroup>
          <MsProjectRibbonGroup title="לוח זמנים — % ביצוע">
            <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5 shadow-sm">
              {[0, 25, 50, 75, 100].map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 min-w-9 px-1.5 text-[11px] font-semibold tabular-nums text-slate-800 hover:bg-indigo-50 hover:text-indigo-900"
                  onClick={() => void applyProgressPercent(p)}
                >
                  {p}%
                </Button>
              ))}
            </div>
          </MsProjectRibbonGroup>
          <MsProjectRibbonGroup title="תצוגת מעקב">
            <Button
              type="button"
              variant={criticalPathEnabled ? "default" : "outline"}
              size="sm"
              className={`h-8 gap-1 text-xs shadow-sm ${
                criticalPathEnabled
                  ? "bg-red-600 text-white hover:bg-red-500"
                  : "border-slate-200 bg-white"
              }`}
              onClick={() => setCriticalPathEnabled((prev) => !prev)}
            >
              <Flag className="size-3.5 shrink-0" aria-hidden />
              נתיב קריטי
            </Button>
          </MsProjectRibbonGroup>
          <MsProjectRibbonGroup title="ייצוא">
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 shadow-sm outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500/30">
                {exportingType ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <FileDown className="size-3.5 shrink-0" aria-hidden />
                )}
                ייצוא
                <ChevronDown className="size-3 opacity-70" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  className="cursor-pointer"
                  disabled={Boolean(exportingType)}
                  onClick={() => void exportAsPdf()}
                >
                  ייצוא ל-PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer"
                  disabled={Boolean(exportingType)}
                  onClick={() => void exportAsSpreadsheet("xlsx")}
                >
                  ייצוא לאקסל
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer"
                  disabled={Boolean(exportingType)}
                  onClick={() => void exportAsSpreadsheet("csv")}
                >
                  ייצוא ל-CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </MsProjectRibbonGroup>
          <MsProjectRibbonGroup title="צילומי מצב">
            <Select value={selectedSnapshotId} onValueChange={setSelectedSnapshotId}>
              <SelectTrigger className="h-8 w-[220px] border-slate-200 bg-white text-xs">
                <SelectValue placeholder="בחר היסטוריה" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">תצוגה נוכחית</SelectItem>
                {ganttSnapshots.map((snapshot) => (
                  <SelectItem key={snapshot.id} value={snapshot.id}>
                    {snapshot.snapshot_name} ·{" "}
                    {snapshot.created_at ? format(parseISO(snapshot.created_at), "dd/MM HH:mm") : "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-slate-200 bg-white text-xs shadow-sm"
              onClick={() => void saveCurrentPlanAsBaseline()}
            >
              שמור תוכנית בסיס
            </Button>
          </MsProjectRibbonGroup>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 bg-white/80 px-2 py-1.5 text-[11px] text-slate-600">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-slate-600"
            onClick={() => void loadTasks()}
          >
            <RefreshCcw className="size-3.5" aria-hidden />
            רענון
          </Button>
          {selectedSnapshot ? (
            <span className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1">
              צפייה בגרסה: {selectedSnapshot.snapshot_name}
            </span>
          ) : (
            <span className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1">
              צפייה בתוכנית נוכחית
            </span>
          )}
        </div>
      </div>

      {chartTasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          <p className="mb-4">אין משימות להצגה עבור הפרויקט הנבחר.</p>
          <Button type="button" onClick={() => void handleAddTask()}>
            הוסף את המשימה הראשונה שלך
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50/90 px-3 py-2.5">
            <div className="grid gap-1">
              <Label htmlFor="gantt-snapshot-type" className="text-[11px] text-slate-600">
                סוג גרסה
              </Label>
              <Select
                value={snapshotType}
                onValueChange={(value) =>
                  setSnapshotType(value as GanttSnapshotRow["snapshot_type"])
                }
              >
                <SelectTrigger id="gantt-snapshot-type" className="h-8 w-[168px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UPDATE">עדכון</SelectItem>
                  <SelectItem value="RECOVERY">התאוששות</SelectItem>
                  <SelectItem value="CHANGE_ORDER">שינוי הזמנה</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-[200px] max-w-md flex-1 gap-1">
              <Label htmlFor="gantt-snapshot-name" className="text-[11px] text-slate-600">
                שם גרסה
              </Label>
              <Input
                id="gantt-snapshot-name"
                value={snapshotNameInput}
                onChange={(event) => setSnapshotNameInput(event.target.value)}
                placeholder="לדוגמה: עדכון אוקטובר"
                className="h-8 text-xs"
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="bg-indigo-600 text-white hover:bg-indigo-500"
              disabled={savingSnapshot || !snapshotNameInput.trim()}
              onClick={() => void saveGanttSnapshot()}
            >
              {savingSnapshot ? (
                <>
                  <Loader2 className="ms-1 size-4 animate-spin" aria-hidden />
                  שומר…
                </>
              ) : (
                "שמור צילום מצב"
              )}
            </Button>
            <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600">
              {ganttSnapshots.length} גרסאות שמורות
            </div>
          </div>

          <div
            ref={ganttShellRef}
            className="gantt-board-enterprise gantt-container relative min-h-[560px] w-full overflow-auto"
            dir="rtl"
            style={{ "--mo-task-list-width": `${listWidth}px` } as React.CSSProperties}
          >
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize task list and timeline"
              className={`absolute bottom-0 top-0 z-30 w-2 cursor-col-resize rounded-sm bg-slate-200/70 transition-colors hover:bg-blue-400 ${
                isResizingSplitter ? "bg-blue-500" : ""
              }`}
              style={{ right: `${Math.max(0, listWidth - 4)}px` }}
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                ;(event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId)
                resizeStartRef.current = {
                  startX: event.clientX,
                  startWidth: listWidth,
                }
                document.body.style.cursor = "col-resize"
                document.body.style.userSelect = "none"
                setIsResizingSplitter(true)
              }}
            />
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
            <div className="gantt-task-react-root" dir="rtl">
              <Gantt
                tasks={chartTasks}
                viewMode={ViewMode.Week}
                rtl
                locale="he-IL"
                listCellWidth={`${Math.round(listWidth)}px`}
                columnWidth={72}
                rowHeight={44}
                ganttHeight={560}
                TaskListHeader={TaskListHeader}
                TaskListTable={TaskListTable}
                onDateChange={onDateChange}
                onProgressChange={onProgressChange}
                onExpanderClick={onExpanderClick}
              />
            </div>
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="gantt-task-resources">משאבים</Label>
                <Input
                  id="gantt-task-resources"
                  value={editForm.resources}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, resources: event.target.value }))
                  }
                  placeholder="לדוגמה: קבלן א', מנהל עבודה"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="gantt-task-cost">עלות</Label>
                <Input
                  id="gantt-task-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  value={editForm.cost}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      cost: Number(event.target.value),
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="gantt-task-baseline-start">התחלה מתוכננת (Baseline)</Label>
                <Input
                  id="gantt-task-baseline-start"
                  type="date"
                  value={editForm.baseline_start}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, baseline_start: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="gantt-task-baseline-end">סיום מתוכנן (Baseline)</Label>
                <Input
                  id="gantt-task-baseline-end"
                  type="date"
                  value={editForm.baseline_end}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, baseline_end: event.target.value }))
                  }
                />
              </div>
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
                    <SelectItem value="auto">אוטומטי</SelectItem>
                    <SelectItem value="manual">ידני</SelectItem>
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

      <Dialog
        open={Boolean(notesEditorTaskId)}
        onOpenChange={(open) => {
          if (!open) {
            setNotesEditorTaskId(null)
            setNotesDraft("")
          }
        }}
      >
        <DialogContent className="w-full max-w-lg">
          <DialogHeader>
            <DialogTitle>הוספת הערה</DialogTitle>
            <DialogDescription>הוסף או עדכן הערה עבור המשימה שנבחרה.</DialogDescription>
          </DialogHeader>
          <Textarea
            rows={6}
            value={notesDraft}
            onChange={(event) => setNotesDraft(event.target.value)}
            placeholder="הקלד הערה למשימה..."
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setNotesEditorTaskId(null)
                setNotesDraft("")
              }}
            >
              ביטול
            </Button>
            <Button type="button" onClick={() => void commitTaskNotes()}>
              שמור הערה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateGanttDialogOpen} onOpenChange={setIsCreateGanttDialogOpen}>
        <DialogContent className="w-full max-w-lg">
          <DialogHeader>
            <DialogTitle>יצירת גאנט חדש</DialogTitle>
            <DialogDescription>הזן שם גאנט ושייך אותו לפרויקט לפני שמירה.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="new-gantt-name">שם הגאנט</Label>
              <Input
                id="new-gantt-name"
                value={newGanttName}
                onChange={(event) => setNewGanttName(event.target.value)}
                placeholder="לדוגמה: לו״ז ביצוע מעודכן"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>פרויקט</Label>
              <Select value={newGanttProjectId} onValueChange={setNewGanttProjectId} disabled>
                <SelectTrigger>
                  <span className="truncate text-right" title={currentProjectName}>
                    {currentProjectName}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={selectedProjectOption.id}>{currentProjectName}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsCreateGanttDialogOpen(false)}>
              ביטול
            </Button>
            <Button type="button" disabled={isCreatingGantt} onClick={() => void createNewGanttForProject()}>
              {isCreatingGantt ? "שומר..." : "שמור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        .gantt-board-enterprise .gantt-task-react-root .mo-gantt-root,
        .gantt-board-enterprise .gantt-task-react-root [class*="_3eULf"],
        .gantt-board-enterprise .gantt-task-react-root ._3eULf {
          display: grid !important;
          grid-template-columns: var(--mo-task-list-width, 980px) 8px minmax(0, 1fr) !important;
          grid-template-rows: auto auto !important;
          gap: 0 !important;
          column-gap: 0 !important;
          row-gap: 0 !important;
          direction: rtl !important;
          align-items: start !important;
          width: 100% !important;
        }
        .gantt-board-enterprise .gantt-task-react-root .mo-gantt-task-col {
          grid-column: 1 !important;
          grid-row: 1 !important;
          margin: 0 !important;
          width: var(--mo-task-list-width, 980px) !important;
          border-inline-end: 1px solid #e2e8f0 !important;
        }
        .gantt-board-enterprise .gantt-task-react-root .mo-gantt-vscroll {
          grid-column: 1 !important;
          grid-row: 1 !important;
          justify-self: start !important;
        }
        .gantt-board-enterprise .gantt-task-react-root .mo-gantt-timeline-col {
          grid-column: 3 !important;
          grid-row: 1 !important;
          min-width: 0 !important;
        }
        .gantt-board-enterprise .gantt-task-react-root .mo-gantt-hscroll {
          grid-column: 1 / span 3 !important;
          grid-row: 2 !important;
          width: 100% !important;
          margin: 0 !important;
        }
        .gantt-board-enterprise [class*="_2B2zv"] {
          direction: rtl !important;
        }
        .gantt-board-enterprise ._2k9Ys {
          direction: rtl !important;
        }
        .gantt-board-enterprise .mo-gantt-timeline-col g[data-task-id] rect:not([data-baseline-ghost="true"]) {
          transition: opacity 120ms ease, stroke-width 120ms ease;
        }
        .gantt-board-enterprise .mo-gantt-timeline-col g[data-task-id][data-hovered="true"] rect:not([data-baseline-ghost="true"]),
        .gantt-board-enterprise .mo-gantt-timeline-col g[data-task-id]:hover rect:not([data-baseline-ghost="true"]) {
          opacity: 0.9;
          stroke: #1d4ed8;
          stroke-width: 2.2px;
        }
        @media print {
          .gantt-board-enterprise .gantt-task-react-root .mo-gantt-root,
          .gantt-board-enterprise .gantt-task-react-root [class*="_3eULf"],
          .gantt-board-enterprise .gantt-task-react-root ._3eULf {
            display: grid !important;
            grid-template-columns: var(--mo-task-list-width, 980px) 8px minmax(0, 1fr) !important;
            gap: 0 !important;
          }
        }
      `}</style>
    </div>
  )
}
