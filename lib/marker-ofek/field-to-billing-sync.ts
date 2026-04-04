import type { GanttTaskRow } from "@/lib/marker-ofek/gantt-actions"
import { weightedProgressForTaskRows } from "@/lib/marker-ofek/gantt-progress-display"
import type {
  ContractLineBaseRow,
  ProjectBoqRowLite,
  TaskBoqLinkLite,
} from "@/lib/marker-ofek/billing-gantt-suggestions"

/** Shared BoQ / Gantt lookups for field→billing (one build per suggest pass). */
export type FieldToBillingGraph = {
  norm: (s: string) => string
  boqByNormCode: Map<string, string>
  hasChildren: Set<string>
  taskById: Map<string, GanttTaskRow>
  linksByBoq: Map<string, string[]>
}

export function buildFieldToBillingGraph(input: {
  projectBoq: ProjectBoqRowLite[]
  taskBoqLinks: TaskBoqLinkLite[]
  tasks: GanttTaskRow[]
}): FieldToBillingGraph {
  const { projectBoq, taskBoqLinks, tasks } = input
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

  return { norm, boqByNormCode, hasChildren, taskById, linksByBoq }
}

/** Tasks on this contract line that appear in approved field logs (same rules as % suggestion). */
export function fieldContributingTaskRows(
  graph: FieldToBillingGraph,
  line: ContractLineBaseRow,
  fieldTaskIds: Set<string>
): GanttTaskRow[] {
  const boqId = graph.boqByNormCode.get(graph.norm(line.section_number))
  if (!boqId) return []
  const linkedIds = (graph.linksByBoq.get(boqId) ?? []).filter((id) =>
    fieldTaskIds.has(id)
  )
  if (linkedIds.length === 0) return []

  const subset: GanttTaskRow[] = []
  for (const tid of linkedIds) {
    const row = graph.taskById.get(tid)
    if (!row) continue
    if (graph.hasChildren.has(tid)) continue
    subset.push(row)
  }
  return subset.length > 0
    ? subset
    : (linkedIds
        .map((id) => graph.taskById.get(id))
        .filter(Boolean) as GanttTaskRow[])
}

/**
 * Like Gantt BoQ suggestions, but only tasks that appeared in approved field logs
 * (or a single log) are considered — links field execution to billing lines.
 */
export function buildFieldSuggestedPercentByContractLineId(input: {
  contractLines: ContractLineBaseRow[]
  projectBoq: ProjectBoqRowLite[]
  taskBoqLinks: TaskBoqLinkLite[]
  tasks: GanttTaskRow[]
  fieldTaskIds: Set<string>
}): Map<string, number> {
  const { contractLines, projectBoq, taskBoqLinks, tasks, fieldTaskIds } = input
  const out = new Map<string, number>()
  const graph = buildFieldToBillingGraph({ projectBoq, taskBoqLinks, tasks })

  for (const line of contractLines) {
    const useRows = fieldContributingTaskRows(graph, line, fieldTaskIds)
    if (useRows.length === 0) continue
    const pct = weightedProgressForTaskRows(useRows)
    if (pct != null) out.set(line.id, pct)
  }

  return out
}
