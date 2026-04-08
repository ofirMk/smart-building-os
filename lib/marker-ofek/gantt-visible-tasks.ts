/**
 * Mirrors gantt-task-react visibility + ordering so DOM row indices match `Task[]` order.
 * (MIT gantt-task-react — same logic as removeHiddenTasks + sortTasks.)
 */
import type { Task } from "gantt-task-react"

function getChildren(taskList: Task[], task: Task): Task[] {
  let found: Task[] = []
  if (task.type !== "project") {
    found = taskList.filter((t) => t.dependencies && t.dependencies.indexOf(task.id) !== -1)
  } else {
    found = taskList.filter((t) => t.project && t.project === task.id)
  }
  const nested: Task[] = []
  for (const t of found) {
    nested.push(...getChildren(taskList, t))
  }
  return [...found, ...nested]
}

export function removeHiddenGanttTasks(tasks: Task[]): Task[] {
  const groupedTasks = tasks.filter((t) => t.hideChildren && t.type === "project")
  let out = tasks
  for (const groupedTask of groupedTasks) {
    const children = getChildren(tasks, groupedTask)
    out = out.filter((t) => children.indexOf(t) === -1)
  }
  return out
}

export function sortGanttTasksByDisplayOrder(tasks: Task[]): Task[] {
  return [...tasks].sort((taskA, taskB) => {
    const orderA = taskA.displayOrder ?? Number.MAX_SAFE_INTEGER
    const orderB = taskB.displayOrder ?? Number.MAX_SAFE_INTEGER
    if (orderA > orderB) return 1
    if (orderA < orderB) return -1
    return 0
  })
}

export function getVisibleGanttTasksForChart(tasks: Task[], hasExpanderClick: boolean): Task[] {
  const filtered = hasExpanderClick ? removeHiddenGanttTasks(tasks) : [...tasks]
  return sortGanttTasksByDisplayOrder(filtered)
}
