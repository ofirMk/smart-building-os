"use client"

import * as React from "react"
import { CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

import { markTaskDoneFromField, type GanttTaskRow } from "@/lib/actions/gantt-actions"
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
      {tasks.map((task) => {
        const done = Number(task.progress) >= 100
        return (
          <div
            key={task.id}
            className="flex items-center justify-between rounded-xl border border-border/70 bg-card p-4"
          >
            <div>
              <p className="font-semibold">{task.name}</p>
              <p className="text-xs text-muted-foreground">
                {task.start_date} - {task.end_date} | {Math.round(Number(task.progress) || 0)}%
              </p>
            </div>
            <button
              type="button"
              disabled={busyTaskId === task.id || done}
              onClick={() => void markDone(task.id)}
              className="inline-flex items-center gap-1 rounded-md border border-border-muted bg-bg-main px-3 py-1.5 text-xs font-semibold text-text-primary disabled:opacity-50"
            >
              <CheckCircle2 className="size-4" />
              {done ? "בוצע" : "סמן כבוצע"}
            </button>
          </div>
        )
      })}
    </div>
  )
}
