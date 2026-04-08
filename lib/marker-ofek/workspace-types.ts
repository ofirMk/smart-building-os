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

/** מצב UI כללי — נשמר ב־`user_workspace_settings.settings` תחת `diamondUi` */
export type WorkspaceUiSettings = {
  /** סרגל צד דסקטופ — מסונכרן עם לחצן „שמור שולחן עבודה” */
  sidebarExpanded?: boolean
  /** גלילה לפי נתיב (מפתח = pathname מנורמל) */
  scrollByPath?: Record<string, number>
}

/** פריסת מודולים במרכז הפיקוד — `settings.layout.commandCenter` */
export type CommandCenterWorkspaceLayout = {
  order: string[]
  hidden: string[]
}

/** צילום פריסה לשמירה בתרחיש — `workspace_scenarios[].layout_json` */
export type WorkspaceLayoutJson = {
  commandCenterLayout: CommandCenterWorkspaceLayout | null
  diamondWorkspaceLayout: DiamondWorkspaceLayoutState
  pinnedWidgets: string[]
  workspacePersona: WorkspacePersona
}

/** תרחיש שולחן עבודה — עמודת `workspace_scenarios` */
export type WorkspaceScenario = {
  id: string
  name: string
  layout_json: WorkspaceLayoutJson
  icon: string
  is_ai_generated: boolean
}

/** רשומת מעבר מודול — `workspace_activity_log` */
export type ModuleActivityEntry = {
  ts: number
  fromPath: string
  toPath: string
}

/** תוצאת ניתוח יעילות (AI) */
export type WorkspaceEfficiencyAnalysis = {
  confidence: number
  patternId: string
  summary: string
  frictionPoints: string[]
  proposedLayout?: WorkspaceLayoutJson
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
  /** מצב תצוגה נוסף (סרגל, גלילה) — עמודת `settings` */
  uiSettings: WorkspaceUiSettings
  /** סדר והסתרת כרטיסי מודול — `settings.layout.commandCenter` */
  commandCenterLayout: CommandCenterWorkspaceLayout | null
  /** תרחישים — `user_workspace_settings.workspace_scenarios` */
  workspaceScenarios: WorkspaceScenario[]
  /** יומן מעברים — `user_workspace_settings.workspace_activity_log` */
  workspaceActivityLog: ModuleActivityEntry[]
  /** תרחיש פעיל — `settings.activeScenarioId` */
  activeScenarioId: string | null
  /** דפוסי AI שהמשתמש ביקש לא להציג שוב — `settings.ai.dismissedPatterns` */
  aiDismissedPatterns: string[]
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

export function parseWorkspaceUiSettings(raw: unknown): WorkspaceUiSettings {
  const out: WorkspaceUiSettings = { scrollByPath: {} }
  if (!raw || typeof raw !== "object") return out
  const root = raw as Record<string, unknown>
  const diamond =
    root.diamondUi !== undefined && typeof root.diamondUi === "object"
      ? (root.diamondUi as Record<string, unknown>)
      : root
  if (typeof diamond.sidebarExpanded === "boolean") {
    out.sidebarExpanded = diamond.sidebarExpanded
  }
  const scroll = diamond.scrollByPath
  if (scroll && typeof scroll === "object") {
    const m: Record<string, number> = {}
    for (const [k, v] of Object.entries(scroll)) {
      const n = typeof v === "number" ? v : Number(v)
      if (Number.isFinite(n) && n >= 0) m[k] = n
    }
    out.scrollByPath = m
  }
  return out
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

export function parseWorkspaceScenarios(raw: unknown): WorkspaceScenario[] {
  if (!Array.isArray(raw)) return []
  const out: WorkspaceScenario[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : ""
    const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : ""
    const icon = typeof o.icon === "string" && o.icon.trim() ? o.icon.trim() : "layout-grid"
    const isAi = o.is_ai_generated === true
    const lj = o.layout_json
    if (!id || !name || !lj || typeof lj !== "object") continue
    const layout_json = parseWorkspaceLayoutJson(lj)
    out.push({ id, name, layout_json, icon, is_ai_generated: isAi })
  }
  return out
}

function parseWorkspaceLayoutJson(raw: unknown): WorkspaceLayoutJson {
  const base: WorkspaceLayoutJson = {
    commandCenterLayout: null,
    diamondWorkspaceLayout: { ...DEFAULT_DIAMOND_WORKSPACE_LAYOUT },
    pinnedWidgets: [],
    workspacePersona: "executive",
  }
  if (!raw || typeof raw !== "object") return base
  const o = raw as Record<string, unknown>
  const cc = o.commandCenterLayout
  if (cc && typeof cc === "object") {
    const c = cc as Record<string, unknown>
    const order = Array.isArray(c.order)
      ? c.order.filter((x): x is string => typeof x === "string")
      : []
    const hidden = Array.isArray(c.hidden)
      ? c.hidden.filter((x): x is string => typeof x === "string")
      : []
    if (order.length > 0 || hidden.length > 0) {
      base.commandCenterLayout = { order, hidden }
    }
  }
  base.diamondWorkspaceLayout = parseDiamondWorkspaceLayout(o.diamondWorkspaceLayout)
  base.pinnedWidgets = parsePinnedWidgets(o.pinnedWidgets)
  if (isWorkspacePersona(String(o.workspacePersona))) {
    base.workspacePersona = o.workspacePersona as WorkspacePersona
  }
  return base
}

export function parseWorkspaceActivityLog(raw: unknown): ModuleActivityEntry[] {
  if (!Array.isArray(raw)) return []
  const out: ModuleActivityEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const ts = typeof o.ts === "number" && Number.isFinite(o.ts) ? o.ts : Number(o.ts)
    const fromPath = typeof o.fromPath === "string" ? o.fromPath : ""
    const toPath = typeof o.toPath === "string" ? o.toPath : ""
    if (!Number.isFinite(ts) || !fromPath || !toPath) continue
    out.push({ ts, fromPath, toPath })
  }
  return out.slice(-500)
}

export function parseActiveScenarioIdFromSettings(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null
  const id = (raw as Record<string, unknown>).activeScenarioId
  return typeof id === "string" && id.trim() ? id.trim() : null
}

export function parseAiDismissedPatternsFromSettings(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return []
  const ai = (raw as Record<string, unknown>).ai
  if (!ai || typeof ai !== "object") return []
  const p = (ai as Record<string, unknown>).dismissedPatterns
  if (!Array.isArray(p)) return []
  return p.filter((x): x is string => typeof x === "string" && x.length > 0)
}
