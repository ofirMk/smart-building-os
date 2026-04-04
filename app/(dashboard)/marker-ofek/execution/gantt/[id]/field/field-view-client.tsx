"use client"

import * as React from "react"
import { format } from "date-fns"
import { AlertTriangle, CheckCircle2, FileText } from "lucide-react"
import { toast } from "sonner"

import { markTaskDoneFromField, type GanttTaskRow } from "@/lib/marker-ofek/gantt-actions"
import {
  derivativeIsDiamondAlert,
  linearTimelinePercent,
  masterTaskForDerivative,
  type DerivativeScheduleRow,
} from "@/lib/marker-ofek/derivative-gantt"
import { TaskPlanVaultSheet } from "@/components/marker-ofek/execution/task-plan-vault-sheet"
import { formatError } from "@/lib/utils"

export default function FieldViewClient({
  projectId,
  initialTasks,
}: {
  projectId: string
  initialTasks: GanttTaskRow[]
}) {
  const [tasks, setTasks] = React.useState<GanttTaskRow[]>(initialTasks)
  const [busyTaskId, setBusyTaskId] = React.useState<string | null>(null)
  const [planVaultOpen, setPlanVaultOpen] = React.useState(false)
  const [planVaultTask, setPlanVaultTask] = React.useState<{ id: string; name: string } | null>(null)
  const todayIso = format(new Date(), "yyyy-MM-dd")
  const deriv = tasks as DerivativeScheduleRow[]

  async function markDone(taskId: string) {
    setBusyTaskId(taskId)
    const prev = tasks
    setTasks((rows) => rows.map((r) => (r.id === taskId ? { ...r, progress: 100 } : r)))
    try {
      await markTaskDoneFromField({ projectId, taskId })
      toast.success("המשימה סומנה כהושלמה ועודכנה בגאנט המרכזי.")
    } catch (error) {
      setTasks(prev)
      toast.error(formatError(error))
    } finally {
      setBusyTaskId(null)
    }
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
        אין משימות מתוכננות להיום.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <TaskPlanVaultSheet
        open={planVaultOpen}
        onOpenChange={setPlanVaultOpen}
        projectId={projectId}
        taskId={planVaultTask?.id ?? null}
        taskName={planVaultTask?.name ?? null}
      />
      {tasks.map((task) => {
        const done = Number(task.progress) >= 100
        const master = masterTaskForDerivative(deriv, task as DerivativeScheduleRow)
        const diamond =
          task.is_derivative &&
          derivativeIsDiamondAlert(task as DerivativeScheduleRow, master, todayIso)
        const expected = master
          ? linearTimelinePercent(master.start_date, master.end_date, todayIso)
          : null

        return (
          <div
            key={task.id}
            className={`flex flex-col gap-3 rounded-xl border p-4 ${
              diamond ? "border-red-300 bg-red-50/70" : "border-border/70 bg-card"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {diamond ? (
                    <AlertTriangle className="size-4 shrink-0 text-red-600" aria-hidden />
                  ) : null}
                  <p className="font-semibold">{task.name}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {task.start_date} - {task.end_date} | {Math.round(Number(task.progress) || 0)}%
                </p>
                {task.is_derivative && master ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    מאסטר: {master.name} ({Math.round(Number(master.progress) || 0)}%)
                    {expected != null ? ` · צפי ליניארי: ${expected}%` : ""}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  title="תוכניות ומסמכים"
                  onClick={() => {
                    setPlanVaultTask({ id: task.id, name: task.name })
                    setPlanVaultOpen(true)
                  }}
                  className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm hover:bg-slate-50"
                >
                  <FileText className="size-4" aria-hidden />
                  מסמכים
                </button>
                <button
                  type="button"
                  disabled={busyTaskId === task.id || done}
                  onClick={() => void markDone(task.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-border-muted bg-bg-main px-3 py-1.5 text-xs font-semibold text-text-primary disabled:opacity-50"
                >
                  <CheckCircle2 className="size-4" aria-hidden />
                  {done ? "בוצע" : "סמן כבוצע"}
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
