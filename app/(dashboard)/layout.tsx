import { DashboardProviders } from "@/components/dashboard-providers"
import { DashboardShell } from "@/components/dashboard-shell"
import { getDashboardBootstrap } from "@/lib/marker-ofek/user-dashboard-config-actions"
import type { AppUserRole } from "@/lib/auth/user-role"
import {
  canViewHoldingExecutive,
  isPartnerDashboardSuperAdmin,
  isPartnerMetricsViewer,
  resolvePartnerMetricsPersona,
} from "@/lib/marker-ofek/partner-metrics/access"
import { resolveManagingPartnerScope } from "@/lib/marker-ofek/effective-managing-partner-scope"
import {
  buildHostWelcomeLine,
  jerusalemHour,
  resolveHostFirstName,
} from "@/lib/marker-ofek/concierge-host"
import { getOrganizationBranding } from "@/lib/marker-ofek/organization-branding"
import { getWorkspaceSettingsBootstrap } from "@/lib/marker-ofek/user-workspace-actions"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let userEmail: string | null = null
  let userRole: AppUserRole = "tenant"
  let userId: string | null = null
  let scopedProjectCount: number | null = null
  let hostGreetingLine: string | null = null
  let hostFirstName: string | null = null

  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    userEmail = user?.email ?? null
    userId = user?.id ?? null

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, full_name")
        .eq("id", user.id)
        .maybeSingle()
      const pr = profile as { role?: AppUserRole; full_name?: string | null } | null
      const r = pr?.role
      if (r) userRole = r
      const first = resolveHostFirstName(user, pr?.full_name ?? null)
      hostFirstName = first
      hostGreetingLine = buildHostWelcomeLine(first, jerusalemHour())
    }

  } catch {
    userEmail = null
  }

  const [
    {
      modules: initialModules,
      markerAccess,
      diamondNavigatorPreferences,
      hrWelcome,
      hrWelcomePending,
    },
    organizationBranding,
    initialWorkspace,
  ] = await Promise.all([
    getDashboardBootstrap(),
    getOrganizationBranding(),
    getWorkspaceSettingsBootstrap(),
  ])
  const partnerPersona = resolvePartnerMetricsPersona(userEmail)
  const scope = await resolveManagingPartnerScope(userEmail, userId)

  try {
    const supabase = await createSupabaseServerAuthClient()
    if (userId && scope.effectiveManagingPartnerId) {
      const { count } = await supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("is_deleted", false)
        .eq("managing_partner_id", scope.effectiveManagingPartnerId)
      scopedProjectCount = count ?? 0
    }
  } catch {
    /* keep scopedProjectCount */
  }

  const mirrorActive =
    partnerPersona === "ophir" &&
    scope.viewAs !== "global" &&
    scope.effectiveManagingPartnerId != null

  const applyEmptyPortfolioNav =
    partnerPersona === "guy" ||
    partnerPersona === "samer" ||
    mirrorActive

  const showPartnerFinanceNav =
    isPartnerMetricsViewer(userEmail) &&
    markerAccess.viewFinancials &&
    (scopedProjectCount === null || scopedProjectCount > 0)
  const showHoldingExecutiveNav =
    canViewHoldingExecutive(userEmail, userRole) &&
    (scopedProjectCount === null || scopedProjectCount > 0)
  const showUserPermissionsNav = isPartnerDashboardSuperAdmin(userEmail)
  const showAiUserSetupNav =
    userRole === "admin" || isPartnerDashboardSuperAdmin(userEmail)
  const showMirrorSelector = isPartnerDashboardSuperAdmin(userEmail)
  const hasRestoredWorkspace = (initialWorkspace.openTabs?.length ?? 0) > 0
  const markerWorkspaceSubtitle =
    hostFirstName != null
      ? hasRestoredWorkspace
        ? `${buildHostWelcomeLine(hostFirstName, jerusalemHour())}, שחזרתי עבורך את סביבת העבודה מהלילה האחרון.`
        : `${buildHostWelcomeLine(hostFirstName, jerusalemHour())}. שולחן העבודה שלך מוכן.`
      : null
  const mirrorBannerLabel =
    partnerPersona === "ophir" && scope.viewAs !== "global"
      ? scope.bannerLabel
      : null

  return (
    <>
      <DashboardProviders
        initialModules={initialModules}
        diamondNavigatorPreferences={diamondNavigatorPreferences}
        managingPartnerFilterId={scope.effectiveManagingPartnerId}
        initialMarkerAccess={markerAccess}
        organizationBranding={organizationBranding}
      >
        <DashboardShell
          userEmail={userEmail}
          userRole={userRole}
          hostGreetingLine={hostGreetingLine}
          hostFirstName={hostFirstName}
          hrWelcome={hrWelcome}
          hrWelcomePending={hrWelcomePending}
          initialWorkspace={initialWorkspace}
          showPartnerFinanceNav={showPartnerFinanceNav}
          showHoldingExecutiveNav={showHoldingExecutiveNav}
          showUserPermissionsNav={showUserPermissionsNav}
          showAiUserSetupNav={showAiUserSetupNav}
          markerWorkspaceSubtitle={markerWorkspaceSubtitle}
          scopedProjectCount={scopedProjectCount}
          applyEmptyPortfolioNav={applyEmptyPortfolioNav}
          showMirrorSelector={showMirrorSelector}
          mirrorViewAs={scope.viewAs}
          mirrorBannerLabel={mirrorBannerLabel}
        >
          {children}
        </DashboardShell>
      </DashboardProviders>
    </>
  )
}
