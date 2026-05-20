import type { Metadata } from "next"
import type { ReactNode } from "react"

import {
  CommandPaletteAutoClose,
  CommandPaletteProvider,
} from "@/components/layout/command-palette"
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
      {/* Sprint T16 — Global Command Palette (⌘/Ctrl+K). Provider mounts the
          modal once at the dashboard root and exposes the open/close API via
          context so deep components (like the top-navigation search trigger)
          can drive it without prop drilling. */}
      <CommandPaletteProvider>
        <CommandPaletteAutoClose />
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
      </CommandPaletteProvider>
    </DashboardProviders>
  )
}
