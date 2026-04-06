"use client"

import * as React from "react"

import { DashboardDiamondStandardNav } from "@/components/dashboard-diamond-standard-nav"
import { MarkerOfekGlobalShortcuts } from "@/components/marker-ofek/marker-ofek-global-shortcuts"
import { DiamondOnboardingProvider } from "@/components/marker-ofek/diamond-onboarding"
import { MarkerOfekDashboardProvider } from "@/components/marker-ofek/marker-ofek-dashboard-context"
import { ModuleRouteGate } from "@/components/marker-ofek/module-route-gate"
import type { ModuleVisibilityState } from "@/lib/marker-ofek/module-registry"
import type { MarkerAccessFlags } from "@/lib/marker-ofek/marker-access-flags"
import { DEFAULT_MARKER_ACCESS } from "@/lib/marker-ofek/marker-access-flags"
import type { OrganizationBrandingSnapshot } from "@/lib/marker-ofek/organization-branding-public"
import { FALLBACK_ORGANIZATION_BRANDING } from "@/lib/marker-ofek/organization-branding-public"
import type { DiamondNavigatorPreferences } from "@/lib/marker-ofek/diamond-navigator-curriculum"
import { OrganizationBrandingProvider } from "@/components/organization-branding-context"
import { WorkspaceCrossTabSync } from "@/components/marker-ofek/workspace/workspace-cross-tab-sync"

export function DashboardProviders({
  children,
  initialModules,
  diamondNavigatorPreferences,
  managingPartnerFilterId,
  initialMarkerAccess,
  organizationBranding,
}: {
  children: React.ReactNode
  initialModules?: ModuleVisibilityState
  /** מ־`user_dashboard_configs.diamond_navigator_preferences` */
  diamondNavigatorPreferences?: DiamondNavigatorPreferences
  /** Mirror / partner scope for client project pickers */
  managingPartnerFilterId?: string | null
  initialMarkerAccess?: MarkerAccessFlags
  organizationBranding?: OrganizationBrandingSnapshot
}) {
  const brand = organizationBranding ?? FALLBACK_ORGANIZATION_BRANDING
  return (
    <React.Fragment>
      <OrganizationBrandingProvider value={brand}>
        <DashboardDiamondStandardNav />
        <MarkerOfekGlobalShortcuts />
        <WorkspaceCrossTabSync />
        <MarkerOfekDashboardProvider
          initialModules={initialModules}
          managingPartnerFilterId={managingPartnerFilterId ?? null}
          initialMarkerAccess={initialMarkerAccess ?? DEFAULT_MARKER_ACCESS}
        >
          <DiamondOnboardingProvider
            initialNavigatorPreferences={diamondNavigatorPreferences}
          >
            <ModuleRouteGate />
            {children}
          </DiamondOnboardingProvider>
        </MarkerOfekDashboardProvider>
      </OrganizationBrandingProvider>
    </React.Fragment>
  )
}
