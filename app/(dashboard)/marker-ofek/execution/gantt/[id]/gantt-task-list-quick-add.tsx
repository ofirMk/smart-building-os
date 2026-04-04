"use client"

import * as React from "react"
import { addDays, format } from "date-fns"
import { GripVertical, Paperclip, Plus } from "lucide-react"
import type { Task } from "gantt-task-react"

import {
  createTask,
  reorderSiblingTasksByOrderedIds,
} from "@/lib/marker-ofek/gantt-actions"
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

export function GanttTaskListHeader({
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
      className="border-b border-slate-100 bg-white text-indigo-900"
      style={{ fontFamily, fontSize, width: rowWidth, maxWidth: "100%" }}
    >
      <div
        className="flex items-center px-1 text-[11px] font-semibold text-slate-500"
        style={{ height: Math.max(0, headerHeight - 2) }}
      >
        <div className="w-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-[1.4] pe-6 text-end">משימה</div>
        <div className="w-14 shrink-0 text-start">משך</div>
        <div className="w-[72px] shrink-0 text-end">התחלה</div>
        <div className="w-[72px] shrink-0 text-end">סיום</div>
        <div className="w-8 shrink-0 text-center text-[10px] font-semibold text-slate-400">
          כספת
        </div>
        <div className="w-8 shrink-0" aria-hidden />
      </div>
    </div>
  )
}

type Props = {
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
}

export function GanttTaskListWithQuickAdd({
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
}: Props) {
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
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
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

          const split = splitWbsCodePrefix(t.name)
          const wbsFallback = wbsByTaskId.get(t.id) ?? ""
          const startIso = t.start instanceof Date && !Number.isNaN(t.start.getTime()) ? format(t.start, "yyyy-MM-dd") : null
          const endIso = t.end instanceof Date && !Number.isNaN(t.end.getTime()) ? format(t.end, "yyyy-MM-dd") : null

          return (
            <div
              key={`${t.id}row`}
              className={`group relative flex items-stretch border-b border-slate-100 bg-white ${
                dragOverId === t.id ? "bg-indigo-50/90 ring-1 ring-inset ring-indigo-200" : ""
              } ${draggingId === t.id ? "opacity-60" : ""}`}
              style={{ height: rowHeight }}
              onMouseEnter={() => setSelectedTask(t.id)}
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
                title="גרירה לסידור מחדש (אחים באותה רמה)"
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
                <GripVertical className="size-4 shrink-0" aria-hidden />
              </div>
              <div
                className="flex min-w-0 flex-[1.4] cursor-default items-center justify-end gap-1.5 px-1 text-end"
                title={`${t.id} — ${t.name}`}
              >
                <button
                  type="button"
                  className="flex h-8 w-5 shrink-0 items-center justify-center text-slate-500 hover:text-indigo-900"
                  onClick={() => onExpanderClick(t)}
                  aria-label={expanderSymbol ? "הרחבה או כיווץ" : ""}
                >
                  {expanderSymbol || <span className="inline-block w-3" />}
                </button>
                {split ? (
                  <>
                    <span className="shrink-0 font-currency-mono text-[11px] tabular-nums text-indigo-900">
                      {split.code}
                    </span>
                    <span
                      className={`min-w-0 truncate text-indigo-900 ${selectedTaskId === t.id ? "font-semibold" : ""}`}
                    >
                      {split.rest}
                    </span>
                  </>
                ) : wbsFallback ? (
                  <>
                    <span className="shrink-0 font-currency-mono text-[11px] tabular-nums text-indigo-900">
                      {wbsFallback}
                    </span>
                    <span
                      className={`min-w-0 truncate text-indigo-900 ${selectedTaskId === t.id ? "font-semibold" : ""}`}
                    >
                      {t.name}
                    </span>
                  </>
                ) : (
                  <span
                    className={`min-w-0 truncate text-indigo-900 ${selectedTaskId === t.id ? "font-semibold" : ""}`}
                  >
                    {t.name}
                  </span>
                )}
              </div>
              <div className="flex w-14 shrink-0 items-center justify-start border-slate-100 px-1 text-start font-currency-mono text-[11px] text-slate-500 tabular-nums">
                {workingDaysBetweenLabel(startIso, endIso)}
              </div>
              <div className="flex w-[72px] shrink-0 items-center justify-end border-slate-100 px-0.5 text-end font-currency-mono text-[11px] text-slate-600 tabular-nums">
                {t.start instanceof Date && !Number.isNaN(t.start.getTime()) ? toLocaleDateString(t.start) : "—"}
              </div>
              <div className="flex w-[72px] shrink-0 items-center justify-end px-0.5 text-end font-currency-mono text-[11px] text-slate-600 tabular-nums">
                {t.end instanceof Date && !Number.isNaN(t.end.getTime()) ? toLocaleDateString(t.end) : "—"}
              </div>
              <div className="flex w-8 shrink-0 items-center justify-center">
                <button
                  type="button"
                  title="תוכניות ומסמכים מהכספת"
                  className="flex size-7 items-center justify-center rounded-md border border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-indigo-700"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenTaskPlans?.(t.id, t.name)
                  }}
                  disabled={!onOpenTaskPlans}
                >
                  <Paperclip className="size-4" aria-hidden />
                </button>
              </div>
              <div className="flex w-8 shrink-0 items-center justify-center">
                <button
                  type="button"
                  title="הוספת תת-משימה"
                  className="flex size-7 items-center justify-center rounded-full border border-transparent text-indigo-600 opacity-0 transition-opacity hover:border-indigo-200 hover:bg-indigo-50 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    openQuickAdd(t)
                  }}
                >
                  <Plus className="size-4" aria-hidden />
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
              <Label htmlFor="gantt-quick-name">שם משימה</Label>
              <Input
                id="gantt-quick-name"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="font-sans"
                placeholder="לדוגמה: חיווט קומה 3"
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
