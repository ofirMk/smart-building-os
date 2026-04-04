import type { GanttTaskRow } from "@/lib/marker-ofek/gantt-actions"

/**
 * Hierarchical WBS labels (1, 1.1, 1.2, 2…) from parent_id + wbs_order.
 * Ignores DB `wbs_code` when building — callers may prefer column when present.
 */
export function computeWbsDisplayCodes(rows: GanttTaskRow[]): Map<string, string> {
  const byParent = new Map<string | null, GanttTaskRow[]>()
  for (const r of rows) {
    const k = r.parent_id ?? null
    const list = byParent.get(k) ?? []
    list.push(r)
    byParent.set(k, list)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => (a.wbs_order ?? 0) - (b.wbs_order ?? 0) || a.name.localeCompare(b.name, "he"))
  }
  const out = new Map<string, string>()
  function walk(parent: string | null, segments: number[]) {
    const kids = byParent.get(parent) ?? []
    kids.forEach((k, i) => {
      const next = [...segments, i + 1]
      out.set(k.id, next.join("."))
      walk(k.id, next)
    })
  }
  walk(null, [])
  return out
}
