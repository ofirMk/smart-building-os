import type { GanttTaskRow } from "@/lib/marker-ofek/gantt-actions"
import {
  weightedLeafProgressPercent,
  weightedProgressForTaskRows,
} from "@/lib/marker-ofek/gantt-progress-display"

export type ContractLineBaseRow = {
  id: string
  section_number: string
  lineValue: number
}

export type ProjectBoqRowLite = {
  id: string
  item_code: string
}

export type TaskBoqLinkLite = {
  task_id: string
  boq_item_id: string
}

/**
 * Maps contract_line_items → suggested % from Gantt:
 * project_boq.item_code matches contract_line_items.section_number (trimmed),
 * then weighted leaf progress among tasks linked to that BOQ row via task_boq_links.
 */
export function buildGanttSuggestedPercentByContractLineId(input: {
  contractLines: ContractLineBaseRow[]
  projectBoq: ProjectBoqRowLite[]
  taskBoqLinks: TaskBoqLinkLite[]
  tasks: GanttTaskRow[]
}): Map<string, number> {
  const { contractLines, projectBoq, taskBoqLinks, tasks } = input
  const out = new Map<string, number>()

  const norm = (s: string) => s.trim().toLowerCase()
  const boqByNormCode = new Map<string, string>()
  for (const b of projectBoq) {
    const k = norm(b.item_code)
    if (k && !boqByNormCode.has(k)) boqByNormCode.set(k, b.id)
  }

  const hasChildren = new Set<string>()
  for (const t of tasks) {
    if (t.parent_id) hasChildren.add(t.parent_id)
  }

  const taskById = new Map(tasks.map((t) => [t.id, t]))
  const linksByBoq = new Map<string, string[]>()
  for (const l of taskBoqLinks) {
    const bid = l.boq_item_id
    const list = linksByBoq.get(bid) ?? []
    list.push(l.task_id)
    linksByBoq.set(bid, list)
  }

  for (const line of contractLines) {
    const boqId = boqByNormCode.get(norm(line.section_number))
    if (!boqId) continue
    const linkedIds = linksByBoq.get(boqId) ?? []
    if (linkedIds.length === 0) continue

    const subset: GanttTaskRow[] = []
    for (const tid of linkedIds) {
      const row = taskById.get(tid)
      if (!row) continue
      if (hasChildren.has(tid)) continue
      subset.push(row)
    }
    const useRows =
      subset.length > 0
        ? subset
        : linkedIds.map((id) => taskById.get(id)).filter(Boolean) as GanttTaskRow[]

    const pct = weightedProgressForTaskRows(useRows)
    if (pct != null) out.set(line.id, pct)
  }

  return out
}

export function contractWideGanttProgress(tasks: GanttTaskRow[]): number | null {
  return weightedLeafProgressPercent(tasks)
}
