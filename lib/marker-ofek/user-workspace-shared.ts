import {
  type WorkspaceBrowserBookmark,
  type WorkspaceOpenTab,
  type WorkspacePersona,
  type WorkspaceSettingsSnapshot,
  isWorkspacePersona,
  mergeOpenTabsFromRow,
  parseBrowserBookmarks,
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
}
