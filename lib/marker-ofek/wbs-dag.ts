/**
 * Dependency graph helpers: cycle detection for FS links (predecessor → successor).
 * Edge direction: predecessor p → task t when t.dependency_ids includes p.
 */

export type DepGraphTask = {
  id: string
  dependency_ids: string[]
}

/** Maps each task id → task ids that depend on it (successors). */
export function buildSuccessorMap<T extends DepGraphTask>(tasks: T[]): Map<string, string[]> {
  const succ = new Map<string, string[]>()
  for (const t of tasks) {
    for (const p of t.dependency_ids ?? []) {
      if (!p || p === t.id) continue
      const list = succ.get(p) ?? []
      list.push(t.id)
      succ.set(p, list)
    }
  }
  return succ
}

/**
 * After setting `taskId`'s predecessors to `newPredIds`, would the graph contain a directed cycle?
 * Rule: adding P → T creates a cycle iff there is already a path T ⇝ P (T can reach P via successor edges).
 */
export function wouldCreateDependencyCycle<T extends DepGraphTask>(
  taskId: string,
  newPredIds: string[],
  tasks: T[]
): boolean {
  const predsByTask = new Map<string, string[]>()
  for (const t of tasks) {
    const deps =
      t.id === taskId
        ? [...new Set(newPredIds.map((id) => String(id).trim()).filter(Boolean))]
        : [...(t.dependency_ids ?? [])]
    predsByTask.set(t.id, deps)
  }

  const succ = new Map<string, string[]>()
  for (const t of tasks) {
    const deps = predsByTask.get(t.id) ?? []
    for (const p of deps) {
      if (!p || p === t.id) continue
      const list = succ.get(p) ?? []
      list.push(t.id)
      succ.set(p, list)
    }
  }

  const uniqPreds = [...new Set(newPredIds.map((id) => String(id).trim()).filter(Boolean))]
  for (const p of uniqPreds) {
    if (p === taskId) return true
    if (reachable(taskId, p, succ)) return true
  }
  return false
}

function reachable(from: string, to: string, successors: Map<string, string[]>): boolean {
  const stack = [from]
  const seen = new Set<string>()
  while (stack.length) {
    const u = stack.pop()!
    if (u === to) return true
    if (seen.has(u)) continue
    seen.add(u)
    for (const v of successors.get(u) ?? []) stack.push(v)
  }
  return false
}
