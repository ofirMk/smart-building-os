import type { CommandCenterTile } from "@/lib/marker-ofek/command-center-types"
import type { CommandCenterWorkspaceLayout } from "@/lib/marker-ofek/workspace-types"

export function parseCommandCenterLayoutFromSettings(
  raw: unknown
): CommandCenterWorkspaceLayout | null {
  if (!raw || typeof raw !== "object") return null
  const root = raw as Record<string, unknown>
  const layout = root.layout
  if (!layout || typeof layout !== "object" || layout === null) return null
  const L = layout as Record<string, unknown>
  const cc = L.commandCenter
  if (!cc || typeof cc !== "object" || cc === null) return null
  const c = cc as Record<string, unknown>
  const order = Array.isArray(c.order)
    ? c.order.filter((x): x is string => typeof x === "string")
    : []
  const hidden = Array.isArray(c.hidden)
    ? c.hidden.filter((x): x is string => typeof x === "string")
    : []
  if (order.length === 0 && hidden.length === 0) return null
  return { order, hidden }
}

export function sanitizeCommandCenterLayoutForSnapshot(
  raw: CommandCenterWorkspaceLayout | null | undefined
): CommandCenterWorkspaceLayout | null {
  if (!raw || typeof raw !== "object") return null
  const order = Array.isArray(raw.order)
    ? raw.order.filter((x): x is string => typeof x === "string")
    : []
  const hidden = Array.isArray(raw.hidden)
    ? raw.hidden.filter((x): x is string => typeof x === "string")
    : []
  if (order.length === 0 && hidden.length === 0) return null
  return { order, hidden }
}

export function defaultHrefOrderFromTiles(tiles: CommandCenterTile[]): string[] {
  return tiles.map((t) => t.href)
}

/** מיזוג סדר + הסתרה מול רשימת המודולים מהשרת */
export function applyCommandCenterLayout(
  tiles: CommandCenterTile[],
  layout: CommandCenterWorkspaceLayout | null
): CommandCenterTile[] {
  if (!tiles.length) return []
  const byHref = new Map(tiles.map((t) => [t.href, t]))
  const hidden = new Set(layout?.hidden ?? [])
  const order =
    layout && layout.order.length > 0
      ? layout.order
      : defaultHrefOrderFromTiles(tiles)
  const seen = new Set<string>()
  const out: CommandCenterTile[] = []
  for (const href of order) {
    if (seen.has(href)) continue
    const t = byHref.get(href)
    if (t && !hidden.has(href)) {
      out.push(t)
      seen.add(href)
    }
  }
  for (const t of tiles) {
    if (!seen.has(t.href) && !hidden.has(t.href)) {
      out.push(t)
      seen.add(t.href)
    }
  }
  return out
}

export function normalizeCommandCenterOrder(
  order: string[],
  tiles: CommandCenterTile[]
): string[] {
  const master = new Set(tiles.map((t) => t.href))
  const seen = new Set<string>()
  const out: string[] = []
  for (const href of order) {
    if (master.has(href) && !seen.has(href)) {
      out.push(href)
      seen.add(href)
    }
  }
  for (const t of tiles) {
    if (!seen.has(t.href)) {
      out.push(t.href)
      seen.add(t.href)
    }
  }
  return out
}
