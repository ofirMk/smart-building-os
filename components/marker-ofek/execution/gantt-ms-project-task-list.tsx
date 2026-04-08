"use client"

import * as React from "react"
import { format } from "date-fns"
import type { Task } from "gantt-task-react"
import { GripVertical, Paperclip, Plus } from "lucide-react"

import type { GanttTaskRow } from "@/lib/marker-ofek/gantt-actions"
import { reorderSiblingTasksByOrderedIds } from "@/lib/marker-ofek/gantt-actions"
import { splitWbsCodePrefix } from "@/lib/marker-ofek/wbs-code-numbering"
import { workingDaysBetweenLabel } from "@/lib/marker-ofek/gantt-progress-display"
import { formatError } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { createTask } from "@/lib/marker-ofek/gantt-actions"
import { addDays } from "date-fns"

export function GanttMsProjectTaskListHeader({
  headerHeight,
  rowWidth,
  fontFamily,
  fontSize,
}: {
  headerHeight: number
  rowWidth: string
  fontFamily: string
  fontSize: string
}) {
  return (
    <div
      dir="rtl"
      className="border-b border-slate-200 bg-slate-50/90 text-slate-800"
      style={{ fontFamily, fontSize, width: rowWidth, maxWidth: "100%" }}
    >
      <div
        className="flex items-stretch px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
        style={{ height: Math.max(0, headerHeight - 2) }}
      >
        <div className="w-5 shrink-0" aria-hidden />
        <div className="flex w-12 shrink-0 items-center justify-end px-0.5">מזהה</div>
        <div className="min-w-0 flex-[1.15] px-1 text-end">שם פעילות</div>
        <div className="flex w-10 shrink-0 items-center justify-center">משך</div>
        <div className="flex w-[68px] shrink-0 items-center justify-end px-0.5">התחלה</div>
        <div className="flex w-[68px] shrink-0 items-center justify-end px-0.5">סיום</div>
        <div className="flex w-[56px] shrink-0 items-center justify-end px-0.5">קדם</div>
        <div className="flex w-[108px] shrink-0 items-center justify-end px-0.5">משאבים</div>
        <div className="flex w-20 shrink-0 items-center justify-end px-0.5">תקציב</div>
        <div className="w-7 shrink-0 text-center text-[9px] font-semibold text-slate-400">כספת</div>
        <div className="w-7 shrink-0" aria-hidden />
      </div>
    </div>
  )
}

type TableProps = {
  rowHeight: number
  rowWidth: string
  fontFamily: string
  fontSize: string
  locale: string
  tasks: Task[]
  selectedTaskId: string
  setSelectedTask: (taskId: string) => void
  onExpanderClick: (task: Task) => void
  projectId: string
  wbsByTaskId: Map<string, string>
  onCreated: () => void | Promise<void>
  onOpenTaskPlans?: (taskId: string, taskName: string) => void
  rowsById: Map<string, GanttTaskRow>
  resourceLabelByTaskId: Map<string, string>
  budgetLabelByTaskId: Map<string, string>
  predecessorLabelByTaskId: Map<string, string>
  onRowDoubleClick: (taskId: string) => void
}

export function GanttMsProjectTaskListTable({
  rowHeight,
  rowWidth,
  fontFamily,
  fontSize,
  locale,
  tasks,
  selectedTaskId,
  setSelectedTask,
  onExpanderClick,
  projectId,
  wbsByTaskId,
  onCreated,
  onOpenTaskPlans,
  rowsById,
  resourceLabelByTaskId,
  budgetLabelByTaskId,
  predecessorLabelByTaskId,
  onRowDoubleClick,
}: TableProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [parentTask, setParentTask] = React.useState<Task | null>(null)
  const [nameDraft, setNameDraft] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [draggingId, setDraggingId] = React.useState<string | null>(null)
  const [dragOverId, setDragOverId] = React.useState<string | null>(null)
  const [reorderBusy, setReorderBusy] = React.useState(false)

  function taskParentKey(t: Task): string | null {
    return t.project ?? null
  }

  function siblingIdsInOrder(list: Task[], parentKey: string | null): string[] {
    return list.filter((x) => taskParentKey(x) === parentKey).map((x) => x.id)
  }

  async function applySiblingReorder(draggedId: string, targetId: string) {
    if (draggedId === targetId || reorderBusy) return
    const dragTask = tasks.find((x) => x.id === draggedId)
    const tgtTask = tasks.find((x) => x.id === targetId)
    if (!dragTask || !tgtTask) return
    const pk1 = taskParentKey(dragTask)
    const pk2 = taskParentKey(tgtTask)
    if (pk1 !== pk2) {
      toast.error("ניתן לגרור רק בין אחים באותה רמה")
      return
    }
    const ids = siblingIdsInOrder(tasks, pk1)
    const from = ids.indexOf(draggedId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    const next = [...ids]
    const [x] = next.splice(from, 1)
    let ins = to
    if (from < to) ins = to - 1
    next.splice(ins, 0, x)
    setReorderBusy(true)
    try {
      await reorderSiblingTasksByOrderedIds({
        projectId,
        parentId: pk1,
        orderedIds: next,
      })
      await onCreated()
      toast.success("סדר המשימות עודכן")
    } catch (err) {
      toast.error(formatError(err))
    } finally {
      setReorderBusy(false)
    }
  }

  const toLocaleDateString = React.useMemo(() => {
    return (d: Date) =>
      d.toLocaleDateString(locale || "he-IL", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      })
  }, [locale])

  function openQuickAdd(t: Task) {
    setParentTask(t)
    setNameDraft("")
    setDialogOpen(true)
  }

  async function submitQuickAdd(e: React.FormEvent) {
    e.preventDefault()
    const name = nameDraft.trim()
    const parent = parentTask
    if (!name || !parent) return
    setPending(true)
    try {
      const start = format(parent.start, "yyyy-MM-dd")
      const end = format(addDays(parent.start, 7), "yyyy-MM-dd")
      await createTask({
        projectId,
        parentId: parent.id,
        name,
        startDate: start,
        endDate: end,
        progress: 0,
      })
      toast.success("המשימה נוספה.")
      setDialogOpen(false)
      setParentTask(null)
      await onCreated()
    } catch (err) {
      toast.error(formatError(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <div
        dir="rtl"
        className="gantt-task-list-pharmacy bg-white"
        style={{ fontFamily, fontSize, width: rowWidth, maxWidth: "100%" }}
      >
        {tasks.map((t) => {
          let expanderSymbol = ""
          if (t.hideChildren === false) expanderSymbol = "▼"
          else if (t.hideChildren === true) expanderSymbol = "▶"

          const row = rowsById.get(t.id)
          const rowName = row?.name?.trim() || t.name
          const split = splitWbsCodePrefix(rowName)
          const wbsFallback = wbsByTaskId.get(t.id) ?? ""
          const startIso =
            t.start instanceof Date && !Number.isNaN(t.start.getTime()) ? format(t.start, "yyyy-MM-dd") : null
          const endIso =
            t.end instanceof Date && !Number.isNaN(t.end.getTime()) ? format(t.end, "yyyy-MM-dd") : null
          const idLabel = (row?.wbs_code?.trim() || t.id.slice(0, 8)).slice(0, 12)
          const resText = resourceLabelByTaskId.get(t.id) ?? "—"
          const budgetText = budgetLabelByTaskId.get(t.id) ?? "—"
          const predText = predecessorLabelByTaskId.get(t.id) ?? "—"

          return (
            <div
              key={`${t.id}row`}
              role="row"
              className={`group relative flex items-stretch border-b border-slate-100 bg-white ${
                dragOverId === t.id ? "bg-indigo-50/90 ring-1 ring-inset ring-indigo-200" : ""
              } ${draggingId === t.id ? "opacity-60" : ""}`}
              style={{ height: rowHeight }}
              onMouseEnter={() => setSelectedTask(t.id)}
              onDoubleClick={() => onRowDoubleClick(t.id)}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = "move"
                if (draggingId && draggingId !== t.id) setDragOverId(t.id)
              }}
              onDragLeave={() => setDragOverId((cur) => (cur === t.id ? null : cur))}
              onDrop={(e) => {
                e.preventDefault()
                const from = e.dataTransfer.getData("text/gantt-task-id")
                setDragOverId(null)
                setDraggingId(null)
                if (from) void applySiblingReorder(from, t.id)
              }}
            >
              <div
                className="flex w-5 shrink-0 cursor-grab items-center justify-center text-slate-400 active:cursor-grabbing"
                draggable
                title="גרירה לסידור מחדש"
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/gantt-task-id", t.id)
                  e.dataTransfer.effectAllowed = "move"
                  setDraggingId(t.id)
                }}
                onDragEnd={() => {
                  setDraggingId(null)
                  setDragOverId(null)
                }}
              >
                <GripVertical className="size-3.5 shrink-0" aria-hidden />
              </div>

              <div
                className="flex w-12 shrink-0 items-center justify-end px-0.5 font-currency-mono text-[10px] tabular-nums text-slate-500"
                title={t.id}
              >
                {idLabel}
              </div>

              <div
                className="flex min-w-0 flex-[1.15] cursor-default items-center justify-end gap-1 px-0.5 text-end"
                title={`${t.id} — ${rowName}`}
              >
                <button
                  type="button"
                  className="flex h-7 w-4 shrink-0 items-center justify-center text-slate-500 hover:text-indigo-900"
                  onClick={() => onExpanderClick(t)}
                  aria-label={expanderSymbol ? "הרחבה או כיווץ" : ""}
                >
                  {expanderSymbol || <span className="inline-block w-2" />}
                </button>
                {split ? (
                  <>
                    <span className="shrink-0 font-currency-mono text-[10px] tabular-nums text-indigo-900">
                      {split.code}
                    </span>
                    <span
                      className={`min-w-0 truncate text-[11px] text-indigo-900 ${
                        selectedTaskId === t.id ? "font-semibold" : ""
                      }`}
                    >
                      {split.rest}
                    </span>
                  </>
                ) : wbsFallback ? (
                  <>
                    <span className="shrink-0 font-currency-mono text-[10px] tabular-nums text-indigo-900">
                      {wbsFallback}
                    </span>
                    <span
                      className={`min-w-0 truncate text-[11px] text-indigo-900 ${
                        selectedTaskId === t.id ? "font-semibold" : ""
                      }`}
                    >
                      {rowName}
                    </span>
                  </>
                ) : (
                  <span
                    className={`min-w-0 truncate text-[11px] text-indigo-900 ${
                      selectedTaskId === t.id ? "font-semibold" : ""
                    }`}
                  >
                    {rowName}
                  </span>
                )}
              </div>

              <div className="flex w-10 shrink-0 items-center justify-center border-slate-100 px-0 font-currency-mono text-[10px] tabular-nums text-slate-600">
                {workingDaysBetweenLabel(startIso, endIso)}
              </div>
              <div className="flex w-[68px] shrink-0 items-center justify-end border-slate-100 px-0.5 text-end font-currency-mono text-[10px] tabular-nums text-slate-700">
                {t.start instanceof Date && !Number.isNaN(t.start.getTime()) ? toLocaleDateString(t.start) : "—"}
              </div>
              <div className="flex w-[68px] shrink-0 items-center justify-end px-0.5 text-end font-currency-mono text-[10px] tabular-nums text-slate-700">
                {t.end instanceof Date && !Number.isNaN(t.end.getTime()) ? toLocaleDateString(t.end) : "—"}
              </div>
              <div
                className="flex w-[56px] shrink-0 items-center justify-end px-0.5 text-end font-currency-mono text-[10px] tabular-nums text-slate-700"
                title={predText}
              >
                <span className="truncate">{predText}</span>
              </div>
              <div
                className="flex w-[108px] shrink-0 items-center justify-end px-0.5 text-end text-[10px] text-slate-700"
                title={resText}
              >
                <span className="truncate">{resText}</span>
              </div>
              <div className="flex w-20 shrink-0 items-center justify-end px-0.5 text-end font-currency-mono text-[10px] tabular-nums text-slate-800">
                {budgetText}
              </div>

              <div className="flex w-7 shrink-0 items-center justify-center">
                <button
                  type="button"
                  title="תוכניות ומסמכים מהכספת"
                  className="flex size-6 items-center justify-center rounded border border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-indigo-700"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenTaskPlans?.(t.id, rowName)
                  }}
                  disabled={!onOpenTaskPlans}
                >
                  <Paperclip className="size-3.5" aria-hidden />
                </button>
              </div>
              <div className="flex w-7 shrink-0 items-center justify-center">
                <button
                  type="button"
                  title="הוספת תת-משימה"
                  className="flex size-6 items-center justify-center rounded-full border border-transparent text-indigo-600 opacity-0 transition-opacity hover:border-indigo-200 hover:bg-indigo-50 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    openQuickAdd(t)
                  }}
                >
                  <Plus className="size-3.5" aria-hidden />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <form onSubmit={submitQuickAdd}>
            <DialogHeader>
              <DialogTitle>תת-משימה חדשה</DialogTitle>
              <p className="text-sm text-slate-500">
                תתווסף תחת &quot;{parentTask?.name ?? ""}&quot; עם טווח תאריכים ראשוני של שבוע.
              </p>
            </DialogHeader>
            <div className="grid gap-2 py-2">
              <Label htmlFor="gantt-ms-quick-name">שם משימה</Label>
              <Input
                id="gantt-ms-quick-name"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="font-sans"
                placeholder="לדוגמה: יציקת רצפה"
                autoFocus
              />
            </div>
            <DialogFooter className="gap-2 sm:justify-start">
              <Button type="submit" disabled={pending || !nameDraft.trim()} className="bg-indigo-600 hover:bg-indigo-500">
                {pending ? "שומר…" : "יצירה"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                ביטול
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
