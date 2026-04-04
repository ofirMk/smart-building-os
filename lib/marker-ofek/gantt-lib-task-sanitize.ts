import { addDays } from "date-fns"
import type { Task } from "gantt-task-react"

const INVALID_DATE_FALLBACK = new Date(0)

function coerceValidTaskDate(value: unknown, fallback: Date): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value
  }
  if (value != null && (typeof value === "string" || typeof value === "number")) {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d
  }
  return fallback
}

/**
 * Final gate before `<Gantt />`: drop bad ids; normalize dates; strip tasks that still lack valid Date instances.
 */
export function sanitizeLibGanttTasksForChart(ganttTasks: Task[]): Task[] {
  return ganttTasks
    .filter((t) => String(t.id ?? "").trim() !== "")
    .map((task) => {
      const start = coerceValidTaskDate(task.start, INVALID_DATE_FALLBACK)
      let end = coerceValidTaskDate(task.end, addDays(start, 1))
      if (end <= start) end = addDays(start, 1)

      const progress = Math.max(0, Math.min(100, Math.round(Number(task.progress ?? 0))))
      const type = task.type ?? "task"

      return { ...task, start, end, progress, type }
    })
    .filter(
      (t) =>
        t.start instanceof Date &&
        !Number.isNaN(t.start.getTime()) &&
        t.end instanceof Date &&
        !Number.isNaN(t.end.getTime())
    )
}
