import "server-only"

import type { AppUserRole } from "@/lib/auth/user-role"
import {
  buildHostWelcomeLine,
  jerusalemHour,
  resolveHostFirstName,
} from "@/lib/marker-ofek/concierge-host"
import { resolveManagingPartnerScope } from "@/lib/marker-ofek/effective-managing-partner-scope"
import { getOrganizationBranding } from "@/lib/marker-ofek/organization-branding"
import {
  canViewHoldingExecutive,
  isPartnerDashboardSuperAdmin,
  isPartnerMetricsViewer,
  resolvePartnerMetricsPersona,
} from "@/lib/marker-ofek/partner-metrics/access"
import { getDashboardBootstrap } from "@/lib/marker-ofek/user-dashboard-config-actions"
import { getWorkspaceSettingsBootstrap } from "@/lib/marker-ofek/user-workspace-actions"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

const ACTIVE_PROJECT_STATUSES = ["planning", "active", "on_hold"] as const

async function fetchScopedProjectCount(
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>,
  email: string | null,
  userId: string | null
): Promise<number | null> {
  const persona = resolvePartnerMetricsPersona(email)
  const scope = await resolveManagingPartnerScope(email, userId)

  if (persona === "guy" || persona === "samer") {
    if (!userId) return null
    const { count } = await supabase
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("is_deleted", false)
      .in("status", [...ACTIVE_PROJECT_STATUSES])
      .eq("managing_partner_id", userId)
    return count ?? 0
  }

  if (persona === "ophir" && scope.effectiveManagingPartnerId) {
    const { count } = await supabase
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("is_deleted", false)
      .in("status", [...ACTIVE_PROJECT_STATUSES])
      .eq("managing_partner_id", scope.effectiveManagingPartnerId)
    return count ?? 0
  }

  return null
}

export async function getDashboardLayoutProps() {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const userEmail = user?.email?.trim() ?? null
  const userId = user?.id ?? null

  const [
    bootstrap,
    organizationBranding,
    initialWorkspace,
    scope,
    scopedProjectCount,
  ] = await Promise.all([
    getDashboardBootstrap(),
    getOrganizationBranding(),
    getWorkspaceSettingsBootstrap(),
    resolveManagingPartnerScope(userEmail, userId),
    fetchScopedProjectCount(supabase, userEmail, userId),
  ])

  type ProfileRow = { full_name: string | null; role: string | null }
  let profile: ProfileRow | null = null
  if (userId) {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", userId)
      .maybeSingle()
    profile = (data as ProfileRow | null) ?? null
  }

  const userRole = (profile?.role as AppUserRole | undefined) ?? "tenant"
  const firstName = resolveHostFirstName(user, profile?.full_name ?? undefined)
  const hostGreetingLine = buildHostWelcomeLine(firstName, jerusalemHour())
  const persona = resolvePartnerMetricsPersona(userEmail)

  const applyEmptyPortfolioNav = persona === "guy" || persona === "samer"

  return {
    initialModules: bootstrap.modules,
    diamondNavigatorPreferences: bootstrap.diamondNavigatorPreferences,
    managingPartnerFilterId: scope.effectiveManagingPartnerId,
    initialMarkerAccess: bootstrap.markerAccess,
    organizationBranding,
    userEmail,
    userRole,
    hostGreetingLine,
    hostFirstName: firstName,
    hrWelcome: bootstrap.hrWelcome,
    hrWelcomePending: bootstrap.hrWelcomePending,
    initialWorkspace,
    showPartnerFinanceNav: isPartnerMetricsViewer(userEmail),
    showHoldingExecutiveNav: canViewHoldingExecutive(userEmail, userRole),
    showUserPermissionsNav: isPartnerDashboardSuperAdmin(userEmail),
    showAiUserSetupNav:
      userRole === "admin" || isPartnerDashboardSuperAdmin(userEmail),
    scopedProjectCount,
    applyEmptyPortfolioNav,
    showMirrorSelector: persona === "ophir" && Boolean(userId),
    mirrorViewAs: scope.viewAs,
    mirrorBannerLabel: scope.bannerLabel,
  }
}
