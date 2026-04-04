"use server"

import {
  DEFAULT_WORKSPACE_SNAPSHOT,
  rowToSnapshot,
  sanitizeWorkspaceSnapshotForUpsert,
  type SaveWorkspacePayload,
} from "@/lib/marker-ofek/user-workspace-shared"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type { WorkspaceSettingsSnapshot } from "@/lib/marker-ofek/workspace-types"
import { formatError } from "@/lib/utils"

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
    }

    const next = sanitizeWorkspaceSnapshotForUpsert(merged)
    const tabsPayload = next.openTabs

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

      if (/relation|does not exist|column/i.test(lastMessage)) {
        return {
          ok: false,
          error: "טבלת שולחן העבודה עדיין לא הופעלה במסד הנתונים.",
        }
      }

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
