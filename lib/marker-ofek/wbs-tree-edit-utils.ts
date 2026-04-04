import type { WbsEditorTreeNode } from "@/lib/marker-ofek/wbs-structure-actions"

export function getNodeAtPath(
  nodes: WbsEditorTreeNode[],
  path: number[]
): WbsEditorTreeNode | null {
  if (path.length === 0) return null
  let cur: WbsEditorTreeNode | undefined = nodes[path[0]]
  if (!cur) return null
  for (let i = 1; i < path.length; i++) {
    cur = cur.children[path[i]]
    if (!cur) return null
  }
  return cur
}

export function updateChildrenAtPath(
  nodes: WbsEditorTreeNode[],
  parentPath: number[],
  fn: (children: WbsEditorTreeNode[]) => WbsEditorTreeNode[]
): WbsEditorTreeNode[] {
  if (parentPath.length === 0) return fn(nodes)
  const [head, ...rest] = parentPath
  return nodes.map((n, i) =>
    i === head ? { ...n, children: updateChildrenAtPath(n.children, rest, fn) } : n
  )
}

/** Insert a new sibling immediately after the node at `path` (same parent, next index). */
export function insertSiblingAfterPath(
  nodes: WbsEditorTreeNode[],
  path: number[],
  newNode: WbsEditorTreeNode
): WbsEditorTreeNode[] {
  if (path.length === 0) return nodes
  const idx = path[path.length - 1]
  const parentPath = path.slice(0, -1)
  return updateChildrenAtPath(nodes, parentPath, (children) => {
    const next = [...children]
    next.splice(idx + 1, 0, newNode)
    return next
  })
}

/** Reorder among siblings under `parentPath` (empty = roots). Indices clamped safely. */
export function reorderSiblingInParent(
  nodes: WbsEditorTreeNode[],
  parentPath: number[],
  fromIndex: number,
  toIndex: number
): WbsEditorTreeNode[] {
  return updateChildrenAtPath(nodes, parentPath, (children) => {
    const c = [...children]
    if (fromIndex < 0 || fromIndex >= c.length || toIndex < 0 || toIndex >= c.length) {
      return children
    }
    const [x] = c.splice(fromIndex, 1)
    c.splice(toIndex, 0, x)
    return c
  })
}
