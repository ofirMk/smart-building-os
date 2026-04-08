import type {
  WorkspaceLayoutJson,
  WorkspaceSettingsSnapshot,
} from "@/lib/marker-ofek/workspace-types"

export function buildLayoutJsonFromSnapshot(
  s: WorkspaceSettingsSnapshot
): WorkspaceLayoutJson {
  return {
    commandCenterLayout: s.commandCenterLayout,
    diamondWorkspaceLayout: {
      horizontal: [...s.diamondWorkspaceLayout.horizontal],
      vertical: [...s.diamondWorkspaceLayout.vertical],
      consoleCollapsed: s.diamondWorkspaceLayout.consoleCollapsed,
    },
    pinnedWidgets: [...s.pinnedWidgets],
    workspacePersona: s.workspacePersona,
  }
}
