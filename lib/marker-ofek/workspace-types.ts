import type { ModuleVisibilityState } from "@/lib/marker-ofek/module-registry"

export type WorkspacePersona = "finance" | "field" | "executive"

export type WorkspaceOpenTab = {
  id: string
  href: string
  title: string
  pinned?: boolean
}

export type UserWorkspaceSettingsRow = {
  user_id: string
  pinned_widgets: unknown
  side_panel_open: boolean
  default_browser_homepage: string
  workspace_persona: WorkspacePersona
  open_tabs: unknown
  active_tabs?: unknown
  split_view: boolean
  secondary_tab_href: string | null
  split_primary_pinned_href?: string | null
  assistant_split_docked?: boolean
  browser_panel_enabled: boolean
  default_project_id: string | null
  updated_at?: string
}

export type WorkspaceBrowserBookmark = {
  label: string
  href: string
}

/**
 * פריסת שולחן „יהלום”
 * horizontal: [ניווט WBS, גאנט מרכזי, סיכוני AI] — סכום ~100
 */
export type DiamondWorkspaceLayoutState = {
  horizontal: [number, number, number]
  vertical: [number, number]
  consoleCollapsed: boolean
}

export const DEFAULT_DIAMOND_WORKSPACE_LAYOUT: DiamondWorkspaceLayoutState = {
  horizontal: [20, 52, 28],
  vertical: [76, 24],
  consoleCollapsed: false,
}

export type WorkspaceSettingsSnapshot = {
  pinnedWidgets: string[]
  sidePanelOpen: boolean
  defaultBrowserHomepage: string
  workspacePersona: WorkspacePersona
  openTabs: WorkspaceOpenTab[]
  splitView: boolean
  secondaryTabHref: string | null
  /** נתיב נעוץ ב-iframe במצב מפוצל — גלישה ראשית ממשיכה בלשונית הנוכחית */
  splitPrimaryPinnedHref: string | null
  /** עוזר AI מוצמד לצד אזור הגלישה כשהמסך מפוצל */
  assistantSplitDocked: boolean
  browserPanelEnabled: boolean
  defaultProjectId: string | null
  /** אימייל SSO — קישור ל־EmailBridge (Sidekick) */
  emailBridgeSso: string | null
  /** סימניות לדפדפן הפנימי */
  browserBookmarks: WorkspaceBrowserBookmark[]
  /** פריסת פאנלים — שמירה ב־user_workspace_settings.diamond_workspace_layout */
  diamondWorkspaceLayout: DiamondWorkspaceLayoutState
}

export type WorkspacePersonaPreset = {
  profileRole: "contractor" | "property_manager" | "admin"
  modules: Partial<ModuleVisibilityState>
  markerViewFinancials: boolean
  markerEditAccess: boolean
  pinnedWidgets: string[]
  defaultBrowserHomepage: string
  browserPanelEnabled: boolean
}

export const WORKSPACE_BROADCAST_CHANNEL = "diamond-workspace-sync" as const

export type WorkspaceBroadcastMessage =
  | { type: "workspace-invalidate"; reason: string }
  | { type: "workspace-settings-patch"; patch: Partial<WorkspaceSettingsSnapshot> }

export function parseOpenTabs(raw: unknown): WorkspaceOpenTab[] {
  if (!Array.isArray(raw)) return []
  const out: WorkspaceOpenTab[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const id = typeof o.id === "string" ? o.id : ""
    const href = typeof o.href === "string" ? o.href : ""
    const title = typeof o.title === "string" ? o.title : href || "לשונית"
    if (!id || !href) continue
    out.push({
      id,
      href,
      title,
      pinned: o.pinned === true,
    })
  }
  return out
}

/** active_tabs (מוצר) או נפילה ל-open_tabs — תאימות לפני מיגרציה */
export function mergeOpenTabsFromRow(row: Record<string, unknown>): WorkspaceOpenTab[] {
  const fromActive = parseOpenTabs(row.active_tabs)
  if (fromActive.length > 0) return fromActive
  return parseOpenTabs(row.open_tabs)
}

export function parsePinnedWidgets(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === "string" && x.length > 0)
}

export function parseBrowserBookmarks(raw: unknown): WorkspaceBrowserBookmark[] {
  if (!Array.isArray(raw)) return []
  const out: WorkspaceBrowserBookmark[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const label = typeof o.label === "string" ? o.label.trim() : ""
    const href = typeof o.href === "string" ? o.href.trim() : ""
    if (!label || !href) continue
    out.push({ label, href })
  }
  return out
}

export function isWorkspacePersona(v: string | null | undefined): v is WorkspacePersona {
  return v === "finance" || v === "field" || v === "executive"
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

export function parseDiamondWorkspaceLayout(
  raw: unknown
): DiamondWorkspaceLayoutState {
  const d = { ...DEFAULT_DIAMOND_WORKSPACE_LAYOUT }
  if (!raw || typeof raw !== "object") return d
  const o = raw as Record<string, unknown>
  const h = o.horizontal
  const v = o.vertical
  if (Array.isArray(h) && h.length >= 3) {
    const a = Number(h[0])
    const b = Number(h[1])
    const c = Number(h[2])
    if (
      Number.isFinite(a) &&
      Number.isFinite(b) &&
      Number.isFinite(c)
    ) {
      d.horizontal = [clampPct(a), clampPct(b), clampPct(c)]
    }
  } else if (Array.isArray(h) && h.length === 2) {
    const main = Number(h[0])
    const guard = Number(h[1])
    if (Number.isFinite(main) && Number.isFinite(guard)) {
      const wbs = 18
      const center = Math.max(38, main - wbs)
      const g = Math.max(16, guard)
      const sum = wbs + center + g
      d.horizontal = [
        clampPct((wbs / sum) * 100),
        clampPct((center / sum) * 100),
        clampPct((g / sum) * 100),
      ]
    }
  }
  if (Array.isArray(v) && v.length >= 2) {
    const a = Number(v[0])
    const b = Number(v[1])
    if (Number.isFinite(a) && Number.isFinite(b)) {
      d.vertical = [clampPct(a), clampPct(b)]
    }
  }
  if (typeof o.consoleCollapsed === "boolean") {
    d.consoleCollapsed = o.consoleCollapsed
  }
  return d
}
