import {
  parseCommandCenterLayoutFromSettings,
  sanitizeCommandCenterLayoutForSnapshot,
} from "@/lib/marker-ofek/command-center-layout"
import {
  DEFAULT_DIAMOND_WORKSPACE_LAYOUT,
  type CommandCenterWorkspaceLayout,
  type WorkspaceBrowserBookmark,
  type WorkspaceOpenTab,
  type WorkspacePersona,
  type WorkspaceSettingsSnapshot,
  type WorkspaceUiSettings,
  isWorkspacePersona,
  mergeOpenTabsFromRow,
  parseActiveScenarioIdFromSettings,
  parseAiDismissedPatternsFromSettings,
  parseBrowserBookmarks,
  parseDiamondWorkspaceLayout,
  parseOpenTabs,
  parsePinnedWidgets,
  parseWorkspaceActivityLog,
  parseWorkspaceScenarios,
  parseWorkspaceUiSettings,
} from "@/lib/marker-ofek/workspace-types"

const DEFAULT_HOME = "https://www.gov.il/he/service/companies-registry"

export const DEFAULT_WORKSPACE_SNAPSHOT: WorkspaceSettingsSnapshot = {
  pinnedWidgets: [],
  sidePanelOpen: false,
  defaultBrowserHomepage: DEFAULT_HOME,
  workspacePersona: "executive",
  openTabs: [],
  splitView: false,
  secondaryTabHref: null,
  splitPrimaryPinnedHref: null,
  assistantSplitDocked: false,
  browserPanelEnabled: true,
  defaultProjectId: null,
  emailBridgeSso: null,
  browserBookmarks: [],
  diamondWorkspaceLayout: { ...DEFAULT_DIAMOND_WORKSPACE_LAYOUT },
  uiSettings: { scrollByPath: {} },
  commandCenterLayout: null,
  workspaceScenarios: [],
  workspaceActivityLog: [],
  activeScenarioId: null,
  aiDismissedPatterns: [],
}

/**
 * מוכן ל־upsert: ללא null ב־JSONB של לשוניות, ערכי מחרוזת בטוחים.
 * מונע שגיאות DB / hydration מ־undefined בשדות מערך.
 */
export function sanitizeWorkspaceSnapshotForUpsert(
  s: WorkspaceSettingsSnapshot
): WorkspaceSettingsSnapshot {
  const openTabs = parseOpenTabs(s.openTabs as unknown)
  const persona: WorkspacePersona = isWorkspacePersona(String(s.workspacePersona))
    ? s.workspacePersona
    : "executive"
  const home =
    typeof s.defaultBrowserHomepage === "string" && s.defaultBrowserHomepage.trim()
      ? s.defaultBrowserHomepage.trim()
      : DEFAULT_HOME
  return {
    pinnedWidgets: parsePinnedWidgets(s.pinnedWidgets as unknown),
    sidePanelOpen: s.sidePanelOpen === true,
    defaultBrowserHomepage: home,
    workspacePersona: persona,
    openTabs,
    splitView: s.splitView === true,
    secondaryTabHref:
      typeof s.secondaryTabHref === "string" && s.secondaryTabHref.trim()
        ? s.secondaryTabHref.trim()
        : null,
    splitPrimaryPinnedHref:
      typeof s.splitPrimaryPinnedHref === "string" && s.splitPrimaryPinnedHref.trim()
        ? s.splitPrimaryPinnedHref.trim()
        : null,
    assistantSplitDocked: s.assistantSplitDocked === true,
    browserPanelEnabled: s.browserPanelEnabled !== false,
    defaultProjectId:
      typeof s.defaultProjectId === "string" && s.defaultProjectId.trim()
        ? s.defaultProjectId.trim()
        : null,
    emailBridgeSso:
      typeof s.emailBridgeSso === "string" && s.emailBridgeSso.trim()
        ? s.emailBridgeSso.trim().toLowerCase()
        : null,
    browserBookmarks: parseBrowserBookmarks(s.browserBookmarks as unknown),
    diamondWorkspaceLayout: parseDiamondWorkspaceLayout(
      s.diamondWorkspaceLayout as unknown
    ),
    uiSettings: sanitizeUiSettings(s.uiSettings as unknown),
    commandCenterLayout: sanitizeCommandCenterLayoutForSnapshot(s.commandCenterLayout),
    workspaceScenarios: parseWorkspaceScenarios(s.workspaceScenarios).slice(0, 50),
    workspaceActivityLog: parseWorkspaceActivityLog(s.workspaceActivityLog).slice(-500),
    activeScenarioId:
      typeof s.activeScenarioId === "string" && s.activeScenarioId.trim()
        ? s.activeScenarioId.trim()
        : null,
    aiDismissedPatterns: Array.isArray(s.aiDismissedPatterns)
      ? s.aiDismissedPatterns.filter((x): x is string => typeof x === "string" && x.length > 0)
      : [],
  }
}

function sanitizeUiSettings(raw: unknown): WorkspaceUiSettings {
  const base = parseWorkspaceUiSettings(raw)
  if (!base.scrollByPath) base.scrollByPath = {}
  return base
}

export function rowToSnapshot(row: Record<string, unknown> | null): WorkspaceSettingsSnapshot {
  if (!row) return { ...DEFAULT_WORKSPACE_SNAPSHOT }
  const personaRaw = row.workspace_persona
  const persona: WorkspacePersona = isWorkspacePersona(String(personaRaw))
    ? (personaRaw as WorkspacePersona)
    : "executive"
  return {
    pinnedWidgets: parsePinnedWidgets(row.pinned_widgets),
    sidePanelOpen: row.side_panel_open === true,
    defaultBrowserHomepage:
      typeof row.default_browser_homepage === "string" && row.default_browser_homepage.trim()
        ? row.default_browser_homepage.trim()
        : DEFAULT_HOME,
    workspacePersona: persona,
    openTabs: mergeOpenTabsFromRow(row),
    splitView: row.split_view === true,
    secondaryTabHref:
      typeof row.secondary_tab_href === "string" && row.secondary_tab_href.trim()
        ? row.secondary_tab_href.trim()
        : null,
    splitPrimaryPinnedHref:
      typeof row.split_primary_pinned_href === "string" &&
      row.split_primary_pinned_href.trim()
        ? row.split_primary_pinned_href.trim()
        : null,
    assistantSplitDocked: row.assistant_split_docked === true,
    browserPanelEnabled: row.browser_panel_enabled !== false,
    defaultProjectId:
      typeof row.default_project_id === "string" && row.default_project_id.trim()
        ? row.default_project_id.trim()
        : null,
    emailBridgeSso:
      typeof row.email_bridge_sso === "string" && row.email_bridge_sso.trim()
        ? row.email_bridge_sso.trim().toLowerCase()
        : null,
    browserBookmarks: parseBrowserBookmarks(row.browser_bookmarks),
    diamondWorkspaceLayout: parseDiamondWorkspaceLayout(
      row.diamond_workspace_layout
    ),
    uiSettings: parseWorkspaceUiSettings(row.settings),
    commandCenterLayout: parseCommandCenterLayoutFromSettings(row.settings),
    workspaceScenarios: parseWorkspaceScenarios(row.workspace_scenarios),
    workspaceActivityLog: parseWorkspaceActivityLog(row.workspace_activity_log),
    activeScenarioId: parseActiveScenarioIdFromSettings(row.settings),
    aiDismissedPatterns: parseAiDismissedPatternsFromSettings(row.settings),
  }
}

/** מיזוג JSON לעמודת `settings` — שומר מפתחות קיימים מחוץ ל־diamondUi */
export function mergeSettingsColumnForUpsert(
  existingRaw: unknown,
  ui: WorkspaceUiSettings,
  options?: {
    commandCenterLayout?: CommandCenterWorkspaceLayout
    activeScenarioId?: string | null
    aiDismissedPatterns?: string[]
  }
): Record<string, unknown> {
  const base =
    existingRaw && typeof existingRaw === "object" && !Array.isArray(existingRaw)
      ? { ...(existingRaw as Record<string, unknown>) }
      : {}
  base.diamondUi = {
    sidebarExpanded: ui.sidebarExpanded,
    scrollByPath: { ...(ui.scrollByPath ?? {}) },
  }
  if (options?.commandCenterLayout) {
    const prevLayout =
      base.layout && typeof base.layout === "object" && !Array.isArray(base.layout)
        ? { ...(base.layout as Record<string, unknown>) }
        : {}
    prevLayout.commandCenter = {
      order: [...options.commandCenterLayout.order],
      hidden: [...options.commandCenterLayout.hidden],
    }
    base.layout = prevLayout
  }
  if (options && "activeScenarioId" in options) {
    base.activeScenarioId = options.activeScenarioId
  }
  if (options?.aiDismissedPatterns !== undefined) {
    const prevAi =
      base.ai && typeof base.ai === "object" && !Array.isArray(base.ai)
        ? { ...(base.ai as Record<string, unknown>) }
        : {}
    prevAi.dismissedPatterns = [...options.aiDismissedPatterns]
    base.ai = prevAi
  }
  return base
}

export type SaveWorkspacePayload = {
  pinnedWidgets?: string[]
  sidePanelOpen?: boolean
  defaultBrowserHomepage?: string | null
  workspacePersona?: WorkspacePersona
  openTabs?: WorkspaceOpenTab[]
  splitView?: boolean
  secondaryTabHref?: string | null
  splitPrimaryPinnedHref?: string | null
  assistantSplitDocked?: boolean
  browserPanelEnabled?: boolean
  defaultProjectId?: string | null
  emailBridgeSso?: string | null
  browserBookmarks?: WorkspaceBrowserBookmark[]
  diamondWorkspaceLayout?: WorkspaceSettingsSnapshot["diamondWorkspaceLayout"]
  /** מיזוג מצב UI (סרגל / גלילה) — נשמר בעמודת `settings` */
  uiSettings?: Partial<WorkspaceUiSettings>
  /** גלילה לנתיב בודד — ממוזג ל־scrollByPath הקיים */
  persistScrollForPath?: { path: string; y: number }
  /** מצב סרגל — נשמר ב־diamondUi.sidebarExpanded */
  sidebarExpanded?: boolean
  /** פריסת מודולי מרכז הפיקוד — `settings.layout.commandCenter` */
  commandCenterLayout?: CommandCenterWorkspaceLayout | null
  workspaceScenarios?: WorkspaceSettingsSnapshot["workspaceScenarios"]
  workspaceActivityLog?: WorkspaceSettingsSnapshot["workspaceActivityLog"]
  activeScenarioId?: string | null
  aiDismissedPatterns?: string[]
}
