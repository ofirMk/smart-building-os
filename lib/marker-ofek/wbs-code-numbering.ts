/**
 * Numbers-only WBS (professional standard):
 * - Level 1: 1, 2, 3… (sibling index in the roots array)
 * - Level 2: 1.1, 1.2… under node 1
 * - Level 3+: 1.1.1, 1.1.2… (each segment is 1-based sibling order)
 *
 * Reordering siblings in the editor tree updates codes automatically: always
 * recompute via `computeWbsCodeMapForTree` from the current `children[]` order.
 */
export type WbsTreeNodeLike = {
  id: string
  children: WbsTreeNodeLike[]
}

/** Strict numeric segments only (e.g. 1.2.10). */
const WBS_CODE_PREFIX_RE = /^(\d+(?:\.\d+)+)\s+/

export function computeWbsCodeMapForTree(nodes: WbsTreeNodeLike[]): Map<string, string> {
  const map = new Map<string, string>()

  function walk(list: WbsTreeNodeLike[], parentCode: string | null) {
    list.forEach((node, i) => {
      const code = parentCode ? `${parentCode}.${i + 1}` : String(i + 1)
      map.set(node.id, code)
      if (node.children.length > 0) {
        walk(node.children, code)
      }
    })
  }

  walk(nodes, null)
  return map
}

/** "1.1.2" + "התקנת לוחות" → `1.1.2 התקנת לוחות` (single space). */
export function formatWbsPrefixedDisplayName(wbsCode: string | null | undefined, name: string): string {
  const code = String(wbsCode ?? "").trim()
  const label = String(name ?? "").trim()
  if (!code) return label
  if (!label) return code
  return `${code} ${label}`
}

/** Split a string that starts with a numeric WBS prefix (for UI: mono code + body). */
export function splitWbsCodePrefix(displayName: string): { code: string; rest: string } | null {
  const raw = String(displayName ?? "")
  const m = raw.match(WBS_CODE_PREFIX_RE)
  if (!m) return null
  return { code: m[1], rest: raw.slice(m[0].length).trim() }
}
