"use server"

import type { AppUserRole } from "@/lib/auth/user-role"
import { mergeNavigatorPreferencesRaw } from "@/lib/marker-ofek/diamond-navigator-curriculum"
import {
  buildHrProvisionWorkspaceTabs,
  defaultBrowserBookmarksForPersona,
} from "@/lib/marker-ofek/hr-default-workspace-tabs"
import { hrComplianceRulesBrief } from "@/lib/marker-ofek/hr-onboarding-copy"
import { mergeRemoteModuleConfig } from "@/lib/marker-ofek/module-registry"
import { isPartnerDashboardSuperAdmin } from "@/lib/marker-ofek/partner-metrics/access"
import {
  mergePinnedWithHrConcierge,
  workspacePersonaPreset,
} from "@/lib/marker-ofek/workspace-persona"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import { formatError } from "@/lib/utils"
import type { WorkspacePersona, WorkspacePersonaPreset } from "@/lib/marker-ofek/workspace-types"
import { isWorkspacePersona } from "@/lib/marker-ofek/workspace-types"

export type ProvisionUserInput = {
  email: string
  fullName: string
  persona: WorkspacePersona
  /** מנהל/ת מערכת — profile.role = admin, שולחן עבודה כמו הנהלה */
  grantSystemAdmin?: boolean
  projectId?: string | null
}

function profileRoleForProvision(
  preset: WorkspacePersonaPreset,
  grantSystemAdmin: boolean
): AppUserRole {
  if (grantSystemAdmin) return "admin"
  if (preset.profileRole === "contractor") return "contractor"
  return "property_manager"
}

async function findAuthUserIdByEmail(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  email: string
): Promise<string | null> {
  const normalized = email.trim().toLowerCase()
  let page = 1
  const perPage = 200
  for (let guard = 0; guard < 50; guard += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error || !data?.users?.length) break
    const u = data.users.find((x) => x.email?.toLowerCase() === normalized)
    if (u?.id) return u.id
    if (data.users.length < perPage) break
    page += 1
  }
  return null
}

function assertProvisioner(
  callerEmail: string | null,
  callerRole: AppUserRole
): { ok: true } | { ok: false; error: string } {
  if (callerRole === "admin") return { ok: true }
  if (isPartnerDashboardSuperAdmin(callerEmail)) return { ok: true }
  return { ok: false, error: "אין הרשאה להקמת משתמשים" }
}

/**
 * הזמנה + פרופיל + מודולים + שולחן עבודה (לשוניות, מפוצל, סימניות, EmailBridge) + שיוך פרויקט.
 */
export async function provisionUserFromAiWizard(
  input: ProvisionUserInput
): Promise<
  | { ok: true; userId: string; invited: boolean }
  | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user: caller },
    } = await supabase.auth.getUser()
    if (!caller?.id) return { ok: false, error: "נדרשת התחברות" }

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .maybeSingle()
    const callerRole = (callerProfile as { role?: AppUserRole } | null)?.role ?? "tenant"

    const gate = assertProvisioner(caller.email ?? null, callerRole)
    if (!gate.ok) return gate

    const email = input.email.trim().toLowerCase()
    const fullName = input.fullName.trim()
    const grantSystemAdmin = input.grantSystemAdmin === true
    if (!email || !email.includes("@")) return { ok: false, error: "אימייל לא תקין" }
    if (!fullName) return { ok: false, error: "נא למלא שם מלא" }
    if (!isWorkspacePersona(input.persona)) {
      return { ok: false, error: "תפקיד לא חוקי" }
    }

    const preset = workspacePersonaPreset(input.persona)
    const profileRole = profileRoleForProvision(preset, grantSystemAdmin)
    const pinned = mergePinnedWithHrConcierge(preset.pinnedWidgets)
    const wsPlan = buildHrProvisionWorkspaceTabs({
      persona: input.persona,
      projectId: input.projectId?.trim() || null,
      grantSystemAdmin,
    })
    const bookmarks = defaultBrowserBookmarksForPersona(input.persona)
    const rulesBrief = hrComplianceRulesBrief(input.persona, grantSystemAdmin)

    const sr = createSupabaseServiceRoleClient()

    let userId = await findAuthUserIdByEmail(sr, email)
    let invited = false

    if (!userId) {
      const site =
        process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
        process.env.VERCEL_URL?.trim()
      const origin = site?.startsWith("http") ? site : site ? `https://${site}` : ""
      const redirectTo = origin ? `${origin}/auth/marker-ofek/login` : undefined

      const { data: inv, error: invErr } = await sr.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        redirectTo,
      })
      if (inv?.user?.id) {
        userId = inv.user.id
        invited = true
      } else if (invErr) {
        userId = await findAuthUserIdByEmail(sr, email)
        if (!userId) {
          return { ok: false, error: formatError(invErr) }
        }
      }
    }

    if (!userId) return { ok: false, error: "לא נמצאה זהות משתמש" }

    let projectName: string | null = null
    const pid = input.projectId?.trim() || null
    if (pid) {
      const { data: pj } = await sr.from("projects").select("name").eq("id", pid).maybeSingle()
      projectName = (pj as { name?: string | null } | null)?.name?.trim() || null
    }

    const { error: profErr } = await sr.from("profiles").upsert(
      {
        id: userId,
        full_name: fullName,
        role: profileRole,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    if (profErr) throw profErr

    const { data: existingCfg } = await sr
      .from("user_dashboard_configs")
      .select(
        "modules, marker_ofek_view_financials, marker_ofek_edit_access, diamond_navigator_preferences, marker_ofek_diamond_onboarding_completed_at, last_visited_path, last_visited_at"
      )
      .eq("user_id", userId)
      .maybeSingle()

    const ex = existingCfg as {
      modules?: unknown
      marker_ofek_view_financials?: boolean | null
      marker_ofek_edit_access?: boolean | null
      diamond_navigator_preferences?: unknown
      marker_ofek_diamond_onboarding_completed_at?: string | null
      last_visited_path?: string | null
      last_visited_at?: string | null
    } | null

    const raw = ex?.modules
    const partial =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, boolean>)
        : null
    const merged = mergeRemoteModuleConfig({ ...partial, ...preset.modules })

    const diamondNavMerged = mergeNavigatorPreferencesRaw(ex?.diamond_navigator_preferences, {
      hrWelcome: {
        projectName,
        persona: input.persona,
        grantSystemAdmin,
        rulesBrief,
        completedAt: null,
      },
    })

    const onboardingAt =
      invited ? null : (ex?.marker_ofek_diamond_onboarding_completed_at ?? null)

    const { error: cfgErr } = await sr.from("user_dashboard_configs").upsert(
      {
        user_id: userId,
        modules: merged,
        marker_ofek_view_financials: preset.markerViewFinancials,
        marker_ofek_edit_access: preset.markerEditAccess,
        diamond_navigator_preferences: diamondNavMerged,
        marker_ofek_diamond_onboarding_completed_at: onboardingAt,
        last_visited_path: ex?.last_visited_path ?? null,
        last_visited_at: ex?.last_visited_at ?? null,
        updated_at: new Date().toISOString(),
        updated_by: caller.id,
      },
      { onConflict: "user_id" }
    )
    if (cfgErr) throw cfgErr

    if (pid) {
      const { error: paErr } = await sr.from("project_assignments").upsert(
        {
          project_id: pid,
          user_id: userId,
          can_view_financials: preset.markerViewFinancials,
          can_edit_financials: preset.markerEditAccess,
          granted_by_user_id: caller.id,
          note: "AI HR Concierge",
        },
        { onConflict: "project_id,user_id" }
      )
      if (paErr && !/relation|does not exist/i.test(String(paErr.message ?? ""))) {
        throw paErr
      }
    }

    const { error: wsErr } = await sr.from("user_workspace_settings").upsert(
      {
        user_id: userId,
        pinned_widgets: pinned,
        side_panel_open: false,
        default_browser_homepage: preset.defaultBrowserHomepage,
        workspace_persona: input.persona,
        open_tabs: wsPlan.openTabs,
        active_tabs: wsPlan.openTabs,
        split_view: wsPlan.splitView,
        secondary_tab_href: wsPlan.secondaryTabHref,
        split_primary_pinned_href: wsPlan.splitPrimaryPinnedHref,
        assistant_split_docked: false,
        browser_panel_enabled: preset.browserPanelEnabled,
        default_project_id: pid,
        email_bridge_sso: email,
        browser_bookmarks: bookmarks,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    if (wsErr) {
      if (!/relation|does not exist|column/i.test(String(wsErr.message ?? ""))) {
        throw wsErr
      }
    }

    if (invited) {
      const { error: obErr } = await sr.from("user_onboarding_status").upsert(
        {
          user_id: userId,
          is_qualified: false,
          qualified_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      if (obErr && !/relation|does not exist|column/i.test(String(obErr.message ?? ""))) {
        console.error("[provision] user_onboarding_status:", obErr.message)
      }
    }

    return { ok: true, userId, invited }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
