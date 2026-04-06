import {
  DEFAULT_DIAMOND_WORKSPACE_LAYOUT,
  type WorkspaceBrowserBookmark,
  type WorkspaceOpenTab,
  type WorkspacePersona,
  type WorkspaceSettingsSnapshot,
  isWorkspacePersona,
  mergeOpenTabsFromRow,
  parseBrowserBookmarks,
  parseDiamondWorkspaceLayout,
  parseOpenTabs,
  parsePinnedWidgets,
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
  }
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
  }
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
}
