"use server"

import {
  DEFAULT_WORKSPACE_SNAPSHOT,
  mergeSettingsColumnForUpsert,
  rowToSnapshot,
  sanitizeWorkspaceSnapshotForUpsert,
  type SaveWorkspacePayload,
} from "@/lib/marker-ofek/user-workspace-shared"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type {
  CommandCenterWorkspaceLayout,
  WorkspaceSettingsSnapshot,
  WorkspaceUiSettings,
} from "@/lib/marker-ofek/workspace-types"
import { formatError } from "@/lib/utils"

function normWorkspacePath(p: string): string {
  return p.replace(/\/$/, "") || "/"
}

function logWorkspaceSaveError(phase: string, err: unknown, extra?: Record<string, unknown>) {
  const msg = err instanceof Error ? err.message : String(err)
  console.error("[workspace-save]", phase, msg, extra ?? {})
}

function isTransientWorkspaceWriteError(message: string): boolean {
  return /deadlock|serialization|could not serialize|timeout|40001|40P01|57014|compaction|conflict|retry/i.test(
    message
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function getWorkspaceSettingsBootstrap(): Promise<WorkspaceSettingsSnapshot> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ...DEFAULT_WORKSPACE_SNAPSHOT }

    const { data, error } = await supabase
      .from("user_workspace_settings")
      .select(
        "pinned_widgets, side_panel_open, default_browser_homepage, workspace_persona, open_tabs, active_tabs, split_view, secondary_tab_href, split_primary_pinned_href, assistant_split_docked, browser_panel_enabled, default_project_id, email_bridge_sso, browser_bookmarks, diamond_workspace_layout, settings, workspace_scenarios, workspace_activity_log"
      )
      .eq("user_id", user.id)
      .maybeSingle()

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[workspace-bootstrap]", error.message)
      }
      return { ...DEFAULT_WORKSPACE_SNAPSHOT }
    }

    return rowToSnapshot(data as Record<string, unknown>)
  } catch {
    return { ...DEFAULT_WORKSPACE_SNAPSHOT }
  }
}

export async function saveMyWorkspaceSettings(
  patch: SaveWorkspacePayload
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const current = await getWorkspaceSettingsBootstrap()

    let mergedUi: WorkspaceUiSettings = {
      ...current.uiSettings,
      ...patch.uiSettings,
      scrollByPath: {
        ...current.uiSettings.scrollByPath,
        ...patch.uiSettings?.scrollByPath,
      },
    }
    if (patch.sidebarExpanded !== undefined) {
      mergedUi = { ...mergedUi, sidebarExpanded: patch.sidebarExpanded }
    }
    if (patch.persistScrollForPath) {
      const key = normWorkspacePath(patch.persistScrollForPath.path)
      mergedUi = {
        ...mergedUi,
        scrollByPath: {
          ...mergedUi.scrollByPath,
          [key]: patch.persistScrollForPath.y,
        },
      }
    }

    const merged: WorkspaceSettingsSnapshot = {
      pinnedWidgets: patch.pinnedWidgets ?? current.pinnedWidgets,
      sidePanelOpen: patch.sidePanelOpen ?? current.sidePanelOpen,
      defaultBrowserHomepage:
        patch.defaultBrowserHomepage != null && patch.defaultBrowserHomepage !== ""
          ? patch.defaultBrowserHomepage
          : current.defaultBrowserHomepage,
      workspacePersona: patch.workspacePersona ?? current.workspacePersona,
      openTabs: patch.openTabs ?? current.openTabs,
      splitView: patch.splitView ?? current.splitView,
      secondaryTabHref:
        patch.secondaryTabHref !== undefined ? patch.secondaryTabHref : current.secondaryTabHref,
      splitPrimaryPinnedHref:
        patch.splitPrimaryPinnedHref !== undefined
          ? patch.splitPrimaryPinnedHref
          : current.splitPrimaryPinnedHref,
      assistantSplitDocked:
        patch.assistantSplitDocked !== undefined
          ? patch.assistantSplitDocked
          : current.assistantSplitDocked,
      browserPanelEnabled: patch.browserPanelEnabled ?? current.browserPanelEnabled,
      defaultProjectId:
        patch.defaultProjectId !== undefined ? patch.defaultProjectId : current.defaultProjectId,
      emailBridgeSso:
        patch.emailBridgeSso !== undefined ? patch.emailBridgeSso : current.emailBridgeSso,
      browserBookmarks: patch.browserBookmarks ?? current.browserBookmarks,
      diamondWorkspaceLayout:
        patch.diamondWorkspaceLayout ?? current.diamondWorkspaceLayout,
      uiSettings: mergedUi,
      commandCenterLayout:
        patch.commandCenterLayout !== undefined
          ? patch.commandCenterLayout
          : current.commandCenterLayout,
      workspaceScenarios: patch.workspaceScenarios ?? current.workspaceScenarios,
      workspaceActivityLog: patch.workspaceActivityLog ?? current.workspaceActivityLog,
      activeScenarioId:
        patch.activeScenarioId !== undefined ? patch.activeScenarioId : current.activeScenarioId,
      aiDismissedPatterns: patch.aiDismissedPatterns ?? current.aiDismissedPatterns,
    }

    const next = sanitizeWorkspaceSnapshotForUpsert(merged)
    const tabsPayload = next.openTabs

    const { data: settingsExisting } = await supabase
      .from("user_workspace_settings")
      .select("settings")
      .eq("user_id", user.id)
      .maybeSingle()

    const settingsColumn = mergeSettingsColumnForUpsert(
      (settingsExisting as { settings?: unknown } | null)?.settings,
      next.uiSettings,
      {
        ...(next.commandCenterLayout ? { commandCenterLayout: next.commandCenterLayout } : {}),
        activeScenarioId: next.activeScenarioId,
        aiDismissedPatterns: next.aiDismissedPatterns,
      }
    )

    const row = {
      user_id: user.id,
      pinned_widgets: next.pinnedWidgets,
      side_panel_open: next.sidePanelOpen,
      default_browser_homepage: next.defaultBrowserHomepage,
      workspace_persona: next.workspacePersona,
      open_tabs: tabsPayload,
      active_tabs: tabsPayload,
      split_view: next.splitView,
      secondary_tab_href: next.secondaryTabHref,
      split_primary_pinned_href: next.splitPrimaryPinnedHref,
      assistant_split_docked: next.assistantSplitDocked,
      browser_panel_enabled: next.browserPanelEnabled,
      default_project_id: next.defaultProjectId,
      email_bridge_sso: next.emailBridgeSso,
      browser_bookmarks: next.browserBookmarks,
      diamond_workspace_layout: next.diamondWorkspaceLayout,
      settings: settingsColumn,
      workspace_scenarios: next.workspaceScenarios,
      workspace_activity_log: next.workspaceActivityLog,
      updated_at: new Date().toISOString(),
    }

    let lastMessage = ""
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { error } = await supabase.from("user_workspace_settings").upsert(row, {
        onConflict: "user_id",
      })

      if (!error) {
        return { ok: true }
      }

      lastMessage = String(error.message ?? error)
      logWorkspaceSaveError("upsert_failed", error, {
        userId: user.id,
        attempt,
        code: (error as { code?: string }).code,
      })

      if (attempt === 0 && isTransientWorkspaceWriteError(lastMessage)) {
        await sleep(150)
        continue
      }

      break
    }

    logWorkspaceSaveError("upsert_aborted_after_retry", lastMessage, { userId: user.id })
    return {
      ok: false,
      error: lastMessage.trim() || "שמירת שולחן העבודה נכשלה",
    }
  } catch (e) {
    logWorkspaceSaveError("saveMyWorkspaceSettings_exception", e)
    return { ok: false, error: formatError(e) }
  }
}

export async function saveCommandCenterLayout(
  layout: CommandCenterWorkspaceLayout
): Promise<{ ok: true } | { ok: false; error: string }> {
  return saveMyWorkspaceSettings({ commandCenterLayout: layout })
}
