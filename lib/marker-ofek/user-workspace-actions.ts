"use server"

import {
  DEFAULT_WORKSPACE_SNAPSHOT,
  rowToSnapshot,
  type SaveWorkspacePayload,
} from "@/lib/marker-ofek/user-workspace-shared"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type { WorkspaceSettingsSnapshot } from "@/lib/marker-ofek/workspace-types"
import { formatError } from "@/lib/utils"

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
        "pinned_widgets, side_panel_open, default_browser_homepage, workspace_persona, open_tabs, active_tabs, split_view, secondary_tab_href, split_primary_pinned_href, assistant_split_docked, browser_panel_enabled, default_project_id, email_bridge_sso, browser_bookmarks"
      )
      .eq("user_id", user.id)
      .maybeSingle()

    if (error) {
      if (/relation|does not exist|column/i.test(String(error.message ?? ""))) {
        return { ...DEFAULT_WORKSPACE_SNAPSHOT }
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
    const next: WorkspaceSettingsSnapshot = {
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
    }

    const row = {
      user_id: user.id,
      pinned_widgets: next.pinnedWidgets,
      side_panel_open: next.sidePanelOpen,
      default_browser_homepage: next.defaultBrowserHomepage,
      workspace_persona: next.workspacePersona,
      open_tabs: next.openTabs,
      active_tabs: next.openTabs,
      split_view: next.splitView,
      secondary_tab_href: next.secondaryTabHref,
      split_primary_pinned_href: next.splitPrimaryPinnedHref,
      assistant_split_docked: next.assistantSplitDocked,
      browser_panel_enabled: next.browserPanelEnabled,
      default_project_id: next.defaultProjectId,
      email_bridge_sso: next.emailBridgeSso,
      browser_bookmarks: next.browserBookmarks,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from("user_workspace_settings").upsert(row, {
      onConflict: "user_id",
    })
    if (error) {
      if (/relation|does not exist|column/i.test(String(error.message ?? ""))) {
        return { ok: false, error: "טבלת שולחן העבודה עדיין לא הופעלה במסד הנתונים." }
      }
      throw error
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
