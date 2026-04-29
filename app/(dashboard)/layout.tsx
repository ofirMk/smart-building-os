import type { Metadata } from "next"
import type { ReactNode } from "react"

import { DashboardProviders } from "@/components/dashboard-providers"
import { DashboardShell } from "@/components/dashboard-shell"
import { getDashboardLayoutProps } from "@/lib/dashboard/dashboard-layout-props"

export const metadata: Metadata = {
  title: "לוח בקרה",
}

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode
}) {
  const p = await getDashboardLayoutProps()

  return (
    <DashboardProviders
      initialModules={p.initialModules}
      diamondNavigatorPreferences={p.diamondNavigatorPreferences}
      managingPartnerFilterId={p.managingPartnerFilterId}
      initialMarkerAccess={p.initialMarkerAccess}
      organizationBranding={p.organizationBranding}
    >
      <DashboardShell
        hostFirstName={p.hostFirstName}
        hrWelcome={p.hrWelcome}
        hrWelcomePending={p.hrWelcomePending}
        initialWorkspace={p.initialWorkspace}
        showMirrorSelector={p.showMirrorSelector}
        mirrorViewAs={p.mirrorViewAs}
        mirrorBannerLabel={p.mirrorBannerLabel}
        selectedCompany={p.selectedCompany}
      >
        {children}
      </DashboardShell>
    </DashboardProviders>
  )
}
