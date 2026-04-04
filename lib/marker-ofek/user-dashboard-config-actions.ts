"use server"

import {
  DEFAULT_MODULE_VISIBILITY,
  mergeRemoteModuleConfig,
  type ModuleId,
  type ModuleVisibilityState,
} from "@/lib/marker-ofek/module-registry"
import { resolvePartnerMetricsPersona } from "@/lib/marker-ofek/partner-metrics/access"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import { formatError } from "@/lib/utils"
import {
  DEFAULT_MARKER_ACCESS,
  markerAccessFromConfigRow,
  type MarkerAccessFlags,
} from "@/lib/marker-ofek/marker-access-flags"
import {
  mergeNavigatorPreferencesRaw,
  parseNavigatorPrefs,
  type DiamondNavigatorPreferences,
  type HrWelcomePayload,
} from "@/lib/marker-ofek/diamond-navigator-curriculum"

function assertOphirSuper(email: string | null | undefined): boolean {
  return resolvePartnerMetricsPersona(email) === "ophir"
}

type DashboardConfigRow = {
  modules?: unknown
  marker_ofek_diamond_onboarding_completed_at?: string | null
  marker_ofek_view_financials?: boolean | null
  marker_ofek_edit_access?: boolean | null
  diamond_navigator_preferences?: unknown
  last_visited_path?: string | null
  last_visited_at?: string | null
}

export async function getDashboardBootstrap(): Promise<{
  modules: ModuleVisibilityState
  diamondOnboardingCompleted: boolean
  markerAccess: MarkerAccessFlags
  diamondNavigatorPreferences: DiamondNavigatorPreferences
  hrWelcome: HrWelcomePayload | null
  hrWelcomePending: boolean
}> {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) {
    return {
      modules: { ...DEFAULT_MODULE_VISIBILITY },
      diamondOnboardingCompleted: false,
      markerAccess: { ...DEFAULT_MARKER_ACCESS },
      diamondNavigatorPreferences: {},
      hrWelcome: null,
      hrWelcomePending: false,
    }
  }

  const { data, error } = await supabase
    .from("user_dashboard_configs")
    .select(
      "modules, marker_ofek_diamond_onboarding_completed_at, marker_ofek_view_financials, marker_ofek_edit_access, diamond_navigator_preferences"
    )
    .eq("user_id", user.id)
    .maybeSingle()

  if (error && /column|does not exist/i.test(String(error.message ?? ""))) {
    const { data: legacy } = await supabase
      .from("user_dashboard_configs")
      .select("modules, marker_ofek_diamond_onboarding_completed_at")
      .eq("user_id", user.id)
      .maybeSingle()
    const lr = legacy as DashboardConfigRow | null
    const raw = lr?.modules
    const partial =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Partial<ModuleVisibilityState>)
        : null
    return {
      modules: mergeRemoteModuleConfig(partial),
      diamondOnboardingCompleted: Boolean(
        lr?.marker_ofek_diamond_onboarding_completed_at
      ),
      markerAccess: { ...DEFAULT_MARKER_ACCESS },
      diamondNavigatorPreferences: {},
      hrWelcome: null,
      hrWelcomePending: false,
    }
  }

  const row = data as DashboardConfigRow | null
  const raw = row?.modules
  const partial =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Partial<ModuleVisibilityState>)
      : null

  const nav = parseNavigatorPrefs(row?.diamond_navigator_preferences)
  const hrWelcome = nav.hrWelcome ?? null
  const hrWelcomePending = Boolean(hrWelcome && !hrWelcome.completedAt)

  return {
    modules: mergeRemoteModuleConfig(partial),
    diamondOnboardingCompleted: Boolean(
      row?.marker_ofek_diamond_onboarding_completed_at
    ),
    markerAccess: markerAccessFromConfigRow(row),
    diamondNavigatorPreferences: nav,
    hrWelcome,
    hrWelcomePending,
  }
}

export async function getMyDashboardModules(): Promise<ModuleVisibilityState> {
  const b = await getDashboardBootstrap()
  return b.modules
}

/** סימון סיור Diamond Path כהושלם (לא יוצג שוב עד איפוס). */
export async function completeDiamondOnboarding(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const { data: existing } = await supabase
      .from("user_dashboard_configs")
      .select(
        "modules, marker_ofek_view_financials, marker_ofek_edit_access, diamond_navigator_preferences, last_visited_path, last_visited_at"
      )
      .eq("user_id", user.id)
      .maybeSingle()

    const ex = existing as DashboardConfigRow | null
    const raw = ex?.modules
    const partial =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Partial<ModuleVisibilityState>)
        : null
    const modules = mergeRemoteModuleConfig(partial)
    const acc = markerAccessFromConfigRow(ex)
    const navRaw = mergeNavigatorPreferencesRaw(ex?.diamond_navigator_preferences, {})

    const { error } = await supabase.from("user_dashboard_configs").upsert(
      {
        user_id: user.id,
        modules,
        marker_ofek_view_financials: acc.viewFinancials,
        marker_ofek_edit_access: acc.editAccess,
        marker_ofek_diamond_onboarding_completed_at: new Date().toISOString(),
        diamond_navigator_preferences: navRaw,
        last_visited_path: ex?.last_visited_path ?? null,
        last_visited_at: ex?.last_visited_at ?? null,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: "user_id" }
    )
    if (error) throw error
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/** סיום סיור HR בעוזר AI — שומר hrWelcome.completedAt */
export async function completeHrConciergeWelcome(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const { data: existing } = await supabase
      .from("user_dashboard_configs")
      .select(
        "modules, marker_ofek_view_financials, marker_ofek_edit_access, diamond_navigator_preferences, marker_ofek_diamond_onboarding_completed_at, last_visited_path, last_visited_at"
      )
      .eq("user_id", user.id)
      .maybeSingle()

    const ex = existing as DashboardConfigRow | null
    const raw = ex?.modules
    const partial =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Partial<ModuleVisibilityState>)
        : null
    const modules = mergeRemoteModuleConfig(partial)
    const acc = markerAccessFromConfigRow(ex)
    const prev = parseNavigatorPrefs(ex?.diamond_navigator_preferences)
    const hr = prev.hrWelcome
    if (!hr) return { ok: false, error: "אין סיור HR פעיל" }

    const doneAt = new Date().toISOString()
    const navRaw = mergeNavigatorPreferencesRaw(ex?.diamond_navigator_preferences, {
      hrWelcome: { ...hr, completedAt: doneAt },
    })

    const { error } = await supabase.from("user_dashboard_configs").upsert(
      {
        user_id: user.id,
        modules,
        marker_ofek_view_financials: acc.viewFinancials,
        marker_ofek_edit_access: acc.editAccess,
        marker_ofek_diamond_onboarding_completed_at:
          ex?.marker_ofek_diamond_onboarding_completed_at ?? doneAt,
        diamond_navigator_preferences: navRaw,
        last_visited_path: ex?.last_visited_path ?? null,
        last_visited_at: ex?.last_visited_at ?? null,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: "user_id" }
    )
    if (error) throw error
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/** איפוס סיור — יוצג שוב בכניסה הבאה למרקר אופק. */
export async function resetDiamondOnboarding(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const { data: existing } = await supabase
      .from("user_dashboard_configs")
      .select(
        "modules, marker_ofek_view_financials, marker_ofek_edit_access, diamond_navigator_preferences, last_visited_path, last_visited_at"
      )
      .eq("user_id", user.id)
      .maybeSingle()

    const ex = existing as DashboardConfigRow | null
    const raw = ex?.modules
    const partial =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Partial<ModuleVisibilityState>)
        : null
    const modules = mergeRemoteModuleConfig(partial)
    const acc = markerAccessFromConfigRow(ex)
    const navRaw = mergeNavigatorPreferencesRaw(ex?.diamond_navigator_preferences, {})

    const { error } = await supabase.from("user_dashboard_configs").upsert(
      {
        user_id: user.id,
        modules,
        marker_ofek_view_financials: acc.viewFinancials,
        marker_ofek_edit_access: acc.editAccess,
        marker_ofek_diamond_onboarding_completed_at: null,
        diamond_navigator_preferences: navRaw,
        last_visited_path: ex?.last_visited_path ?? null,
        last_visited_at: ex?.last_visited_at ?? null,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: "user_id" }
    )
    if (error) throw error
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function saveMyDashboardModules(
  modules: ModuleVisibilityState
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const safe = mergeRemoteModuleConfig(modules)
    const { data: prev } = await supabase
      .from("user_dashboard_configs")
      .select(
        "marker_ofek_diamond_onboarding_completed_at, marker_ofek_view_financials, marker_ofek_edit_access"
      )
      .eq("user_id", user.id)
      .maybeSingle()
    const prevRow = prev as DashboardConfigRow | null
    const prevAt = prevRow?.marker_ofek_diamond_onboarding_completed_at
    const acc = markerAccessFromConfigRow(prevRow)

    const { error } = await supabase.from("user_dashboard_configs").upsert(
      {
        user_id: user.id,
        modules: safe,
        marker_ofek_view_financials: acc.viewFinancials,
        marker_ofek_edit_access: acc.editAccess,
        marker_ofek_diamond_onboarding_completed_at: prevAt ?? null,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: "user_id" }
    )
    if (error) throw error
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export type DashboardConfigUserRow = {
  userId: string
  email: string | null
  modules: ModuleVisibilityState
  markerAccess: MarkerAccessFlags
}

export async function listUsersForDashboardConfig(): Promise<
  { ok: true; users: DashboardConfigUserRow[] } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.email) return { ok: false, error: "נדרשת התחברות" }
    if (!assertOphirSuper(user.email)) {
      return { ok: false, error: "אין הרשאה" }
    }

    const service = createSupabaseServiceRoleClient()
    const { data: page, error: listErr } = await service.auth.admin.listUsers({
      perPage: 500,
      page: 1,
    })
    if (listErr) throw listErr

    const ids = (page.users ?? []).map((u) => u.id)
    const { data: cfgRows } =
      ids.length === 0
        ? {
            data: [] as {
              user_id: string
              modules: unknown
              marker_ofek_view_financials?: boolean | null
              marker_ofek_edit_access?: boolean | null
            }[],
          }
        : await service
            .from("user_dashboard_configs")
            .select(
              "user_id, modules, marker_ofek_view_financials, marker_ofek_edit_access"
            )
            .in("user_id", ids)

    const cfgByUser = new Map<string, DashboardConfigRow>()
    for (const r of cfgRows ?? []) {
      const row = r as {
        user_id: string
        modules?: unknown
        marker_ofek_view_financials?: boolean | null
        marker_ofek_edit_access?: boolean | null
      }
      cfgByUser.set(row.user_id, row as DashboardConfigRow)
    }

    const users: DashboardConfigUserRow[] = (page.users ?? []).map((u) => {
      const full = cfgByUser.get(u.id) ?? null
      const raw = full?.modules
      const partial =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as Partial<ModuleVisibilityState>)
          : null
      return {
        userId: u.id,
        email: u.email ?? null,
        modules: mergeRemoteModuleConfig(partial),
        markerAccess: markerAccessFromConfigRow(full),
      }
    })

    users.sort((a, b) => (a.email ?? "").localeCompare(b.email ?? "", "en"))

    return { ok: true, users }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function saveUserDashboardModulesForUser(params: {
  targetUserId: string
  modules: ModuleVisibilityState
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.email) return { ok: false, error: "נדרשת התחברות" }
    if (!assertOphirSuper(user.email)) {
      return { ok: false, error: "אין הרשאה" }
    }

    const target = params.targetUserId.trim()
    if (!target) return { ok: false, error: "משתמש לא חוקי" }

    const safe = mergeRemoteModuleConfig(params.modules)
    const service = createSupabaseServiceRoleClient()
    const { data: prevRow } = await service
      .from("user_dashboard_configs")
      .select(
        "marker_ofek_diamond_onboarding_completed_at, marker_ofek_view_financials, marker_ofek_edit_access"
      )
      .eq("user_id", target)
      .maybeSingle()
    const pr = prevRow as DashboardConfigRow | null
    const prevDiamond = pr?.marker_ofek_diamond_onboarding_completed_at
    const acc = markerAccessFromConfigRow(pr)

    const { error } = await service.from("user_dashboard_configs").upsert(
      {
        user_id: target,
        modules: safe,
        marker_ofek_view_financials: acc.viewFinancials,
        marker_ofek_edit_access: acc.editAccess,
        marker_ofek_diamond_onboarding_completed_at: prevDiamond ?? null,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: "user_id" }
    )
    if (error) throw error
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function setUserDashboardModuleFlag(params: {
  targetUserId: string
  moduleId: ModuleId
  value: boolean
}): Promise<{ ok: true; modules: ModuleVisibilityState } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.email) return { ok: false, error: "נדרשת התחברות" }
    if (!assertOphirSuper(user.email)) {
      return { ok: false, error: "אין הרשאה" }
    }

    const service = createSupabaseServiceRoleClient()
    const { data: existing } = await service
      .from("user_dashboard_configs")
      .select(
        "modules, marker_ofek_diamond_onboarding_completed_at, marker_ofek_view_financials, marker_ofek_edit_access"
      )
      .eq("user_id", params.targetUserId)
      .maybeSingle()

    const exFull = existing as DashboardConfigRow | null
    const prevRaw = exFull?.modules
    const prevDiamond = exFull?.marker_ofek_diamond_onboarding_completed_at
    const acc = markerAccessFromConfigRow(exFull)
    const base =
      prevRaw && typeof prevRaw === "object" && !Array.isArray(prevRaw)
        ? mergeRemoteModuleConfig(prevRaw as Partial<ModuleVisibilityState>)
        : { ...DEFAULT_MODULE_VISIBILITY }
    const next = { ...base, [params.moduleId]: params.value }

    const { error } = await service.from("user_dashboard_configs").upsert(
      {
        user_id: params.targetUserId,
        modules: next,
        marker_ofek_view_financials: acc.viewFinancials,
        marker_ofek_edit_access: acc.editAccess,
        marker_ofek_diamond_onboarding_completed_at: prevDiamond ?? null,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: "user_id" }
    )
    if (error) throw error
    return { ok: true, modules: next }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function setUserMarkerAccessFlags(params: {
  targetUserId: string
  viewFinancials: boolean
  editAccess: boolean
}): Promise<{ ok: true; markerAccess: MarkerAccessFlags } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.email) return { ok: false, error: "נדרשת התחברות" }
    if (!assertOphirSuper(user.email)) {
      return { ok: false, error: "אין הרשאה" }
    }

    const target = params.targetUserId.trim()
    if (!target) return { ok: false, error: "משתמש לא חוקי" }

    const service = createSupabaseServiceRoleClient()
    const { data: existing } = await service
      .from("user_dashboard_configs")
      .select(
        "modules, marker_ofek_diamond_onboarding_completed_at, marker_ofek_view_financials, marker_ofek_edit_access"
      )
      .eq("user_id", target)
      .maybeSingle()

    const ex = existing as DashboardConfigRow | null
    const prevRaw = ex?.modules
    const prevDiamond = ex?.marker_ofek_diamond_onboarding_completed_at
    const partial =
      prevRaw && typeof prevRaw === "object" && !Array.isArray(prevRaw)
        ? (prevRaw as Partial<ModuleVisibilityState>)
        : null
    const modules = mergeRemoteModuleConfig(partial)

    const { error } = await service.from("user_dashboard_configs").upsert(
      {
        user_id: target,
        modules,
        marker_ofek_view_financials: params.viewFinancials,
        marker_ofek_edit_access: params.editAccess,
        marker_ofek_diamond_onboarding_completed_at: prevDiamond ?? null,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: "user_id" }
    )
    if (error) throw error
    return {
      ok: true,
      markerAccess: {
        viewFinancials: params.viewFinancials,
        editAccess: params.editAccess,
      },
    }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function assertUserMayViewPartnerFinancials(): Promise<boolean> {
  const b = await getDashboardBootstrap()
  return b.markerAccess.viewFinancials
}

/** מיזוג העדפות סיור 360 (JSONB) — לא דורס מודולים או דגלים אחרים */
export async function saveDiamondNavigatorPreferences(patch: {
  suppressIntroTips?: boolean
  masteredTracks?: string[]
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const { data: existing } = await supabase
      .from("user_dashboard_configs")
      .select(
        "modules, marker_ofek_diamond_onboarding_completed_at, marker_ofek_view_financials, marker_ofek_edit_access, diamond_navigator_preferences, last_visited_path, last_visited_at"
      )
      .eq("user_id", user.id)
      .maybeSingle()

    const ex = existing as DashboardConfigRow | null
    const raw = ex?.modules
    const partial =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Partial<ModuleVisibilityState>)
        : null
    const modules = mergeRemoteModuleConfig(partial)
    const acc = markerAccessFromConfigRow(ex)
    const navRaw = mergeNavigatorPreferencesRaw(ex?.diamond_navigator_preferences, {})
    if (patch.suppressIntroTips !== undefined) {
      navRaw.suppressIntroTips = patch.suppressIntroTips
    }
    if (patch.masteredTracks !== undefined) {
      navRaw.masteredTracks = patch.masteredTracks
    }

    const { error } = await supabase.from("user_dashboard_configs").upsert(
      {
        user_id: user.id,
        modules,
        marker_ofek_view_financials: acc.viewFinancials,
        marker_ofek_edit_access: acc.editAccess,
        marker_ofek_diamond_onboarding_completed_at:
          ex?.marker_ofek_diamond_onboarding_completed_at ?? null,
        diamond_navigator_preferences: navRaw,
        last_visited_path: ex?.last_visited_path ?? null,
        last_visited_at: ex?.last_visited_at ?? null,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: "user_id" }
    )
    if (error) throw error
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/** עדכון נתיב אחרון (למעט מרכז הפיקוד) — נקרא מהלקוח אחרי ניווט */
export async function recordLastDashboardVisit(pathname: string): Promise<void> {
  const path = pathname.trim()
  if (!path) return
  if (
    !path.startsWith("/marker-ofek") &&
    !path.startsWith("/partner-finance") &&
    path !== "/partner-finance"
  ) {
    return
  }
  if (
    path === "/marker-ofek/command-center" ||
    path === "/marker-ofek" ||
    path === "/marker-ofek/"
  ) {
    return
  }

  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return

    const { data: existing } = await supabase
      .from("user_dashboard_configs")
      .select(
        "modules, marker_ofek_diamond_onboarding_completed_at, marker_ofek_view_financials, marker_ofek_edit_access, diamond_navigator_preferences, last_visited_path, last_visited_at"
      )
      .eq("user_id", user.id)
      .maybeSingle()

    const ex = existing as DashboardConfigRow | null
    const raw = ex?.modules
    const partial =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Partial<ModuleVisibilityState>)
        : null
    const modules = mergeRemoteModuleConfig(partial)
    const acc = markerAccessFromConfigRow(ex)
    const navPrefs = parseNavigatorPrefs(ex?.diamond_navigator_preferences)

    await supabase.from("user_dashboard_configs").upsert(
      {
        user_id: user.id,
        modules,
        marker_ofek_view_financials: acc.viewFinancials,
        marker_ofek_edit_access: acc.editAccess,
        marker_ofek_diamond_onboarding_completed_at:
          ex?.marker_ofek_diamond_onboarding_completed_at ?? null,
        diamond_navigator_preferences: navPrefs,
        last_visited_path: path,
        last_visited_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: "user_id" }
    )
  } catch {
    /* אין להפריע לניווט */
  }
}

export async function getLastDashboardVisitForUser(): Promise<{
  path: string
  at: string | null
} | null> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return null

    const { data, error } = await supabase
      .from("user_dashboard_configs")
      .select("last_visited_path, last_visited_at")
      .eq("user_id", user.id)
      .maybeSingle()

    if (error) return null
    const row = data as DashboardConfigRow | null
    const p = row?.last_visited_path?.trim()
    if (!p) return null
    return { path: p, at: row?.last_visited_at ?? null }
  } catch {
    return null
  }
}
