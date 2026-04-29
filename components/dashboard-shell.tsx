"use client"

import { usePathname } from "next/navigation"

import {
  CommandPaletteHeaderTrigger,
  CommandPaletteProvider,
} from "@/components/dashboard/command-palette"
import { DashboardLastVisitTracker } from "@/components/dashboard-last-visit-tracker"
import { TopNavigation } from "@/components/layout/top-navigation"
import { CompanyContextGate } from "@/components/layout/company-context-gate"
import { FullscreenToggle } from "@/components/marker-ofek/fullscreen-toggle"
import { SaveWorkspaceButton } from "@/components/marker-ofek/workspace/save-workspace-button"
import { WorkspaceEfficiencyHost } from "@/components/marker-ofek/workspace/workspace-efficiency-host"
import { WorkspaceScenarioSwitcher } from "@/components/marker-ofek/workspace/workspace-scenario-switcher"
import { WorkspaceScrollRestore } from "@/components/marker-ofek/workspace/workspace-scroll-restore"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  isMarkerOfekExecutiveContext,
  isMarkerOfekPath,
} from "@/lib/infrastructure/navigation/sidebar-routes"
import { MirrorModeBanner } from "@/components/marker-ofek/mirror-mode-banner"
import { MirrorModeSelector } from "@/components/marker-ofek/mirror-mode-selector"
import { DiamondSidekickToggle } from "@/components/marker-ofek/workspace/diamond-sidekick"
import { AiAssistant } from "@/components/dashboard/AiAssistant"
import { AiAssistantScreenProvider } from "@/components/dashboard/ai-assistant-screen-context"
import { DiamondWorkspaceHotkeys } from "@/components/marker-ofek/workspace/diamond-workspace-hotkeys"
import { SmartWorkspaceChrome } from "@/components/marker-ofek/workspace/smart-workspace-chrome"
import { SmartWorkspaceProvider } from "@/components/marker-ofek/workspace/smart-workspace-context"
import { WorkspaceParallelSplitControl } from "@/components/marker-ofek/workspace/workspace-parallel-split-control"
import { WorkspaceTabBar } from "@/components/marker-ofek/workspace/workspace-tab-bar"
import { useOrganizationBranding } from "@/components/organization-branding-context"
import { MIRROR_BANNER_INSET_PT_CLASS } from "@/lib/marker-ofek/mirror-layout"
import type { ViewAsToken } from "@/lib/marker-ofek/mirror-mode-types"
import type { HrWelcomePayload } from "@/lib/marker-ofek/diamond-navigator-curriculum"
import type { WorkspaceSettingsSnapshot } from "@/lib/marker-ofek/workspace-types"
import { DEFAULT_WORKSPACE_SNAPSHOT } from "@/lib/marker-ofek/user-workspace-shared"
import { cn } from "@/lib/utils"
import type { CompanyContextId } from "@/lib/company-context"

/**
 * Full dashboard chrome (workspace, command palette, **TopNavigation** + main).
 * Mounted from `app/(dashboard)/layout.tsx` together with `DashboardProviders`.
 *
 * הניווט הראשי הוא אופקי (TopNavigation, Salient-style). אין יותר סרגל צדדי / NavDrawer —
 * כל הניווט מתבצע מה-header האופקי. דפים אחראים להחזיק את ה-context שלהם.
 */
export function DashboardShell({
  children,
  hostFirstName = null,
  hrWelcome = null,
  hrWelcomePending = false,
  initialWorkspace,
  showMirrorSelector = false,
  mirrorViewAs = "global" as ViewAsToken,
  mirrorBannerLabel = null,
  selectedCompany = null,
}: {
  children: React.ReactNode
  hostFirstName?: string | null
  hrWelcome?: HrWelcomePayload | null
  hrWelcomePending?: boolean
  initialWorkspace?: WorkspaceSettingsSnapshot
  showMirrorSelector?: boolean
  mirrorViewAs?: ViewAsToken
  mirrorBannerLabel?: string | null
  selectedCompany?: CompanyContextId | null
}) {
  const pathname = usePathname()
  const branding = useOrganizationBranding()

  const mirrorBannerOn = Boolean(mirrorBannerLabel?.trim())
  const requiresCompanySelection = selectedCompany == null

  return (
    <SmartWorkspaceProvider initial={initialWorkspace ?? DEFAULT_WORKSPACE_SNAPSHOT}>
    <CommandPaletteProvider>
    <AiAssistantScreenProvider>
      {mirrorBannerOn && mirrorBannerLabel ? (
        <MirrorModeBanner label={mirrorBannerLabel} />
      ) : null}
      <DashboardLastVisitTracker />
      {requiresCompanySelection ? <CompanyContextGate /> : null}
      {/*
        ╔═══════════════════════════════════════════════════════════════════╗
        ║  LAYOUT INVARIANT — אין גלילה גלובלית של ה-viewport               ║
        ║  ────────────────────────────────────────────────────────────────  ║
        ║  השרשרת מ-html → body → wrappers → main בנויה על:                 ║
        ║    1. h-[100dvh] על ה-root (html/body) + overflow-hidden          ║
        ║    2. flex flex-col + flex-1 + min-h-0 בכל רמה                     ║
        ║    3. סרגלים (header/tabbar/footer) = flex-none / shrink-0         ║
        ║    4. main = flex-1 min-h-0 overflow-y-auto (היא היחידה שגוללת)   ║
        ║                                                                    ║
        ║  כשמוסיפים דף חדש — או שהדף הוא בלוק רגיל (main גוללת אותו        ║
        ║  באופן טבעי), או שהדף עצמו `flex flex-1 min-h-0 overflow-hidden`   ║
        ║  עם scroll containers פנימיים. אסור לערבב בין השתיים.              ║
        ╚═══════════════════════════════════════════════════════════════════╝
      */}
      <div
        className={cn(
          "flex h-full min-h-0 w-full max-w-none min-w-0 flex-col overflow-hidden bg-background text-foreground",
          requiresCompanySelection && "hidden",
          mirrorBannerOn && MIRROR_BANNER_INSET_PT_CLASS
        )}
        data-dashboard-layout="topnav-main"
        data-layout-region="shell-root"
      >
        <TopNavigation>
          {/*
            Actions slot — מינימליסטי. כלים תלויי-נתיב של Marker Ofek
            (split / sidekick / scenarios / save) נשמרים כי הם מספקים
            פונקציונליות לא-זמינה אחרת. ברדקרמבים/כותרת-עמוד הוסרו —
            הניווט החדש מסתמך על פריטי התפריט עצמם להתמצאות.
          */}
          <CommandPaletteHeaderTrigger />
          {isMarkerOfekPath(pathname) ? <WorkspaceParallelSplitControl /> : null}
          {isMarkerOfekPath(pathname) ? <DiamondSidekickToggle /> : null}
          {showMirrorSelector ? (
            <MirrorModeSelector currentViewAs={mirrorViewAs} />
          ) : null}
          <ThemeToggle />
          <FullscreenToggle />
          {isMarkerOfekPath(pathname) ? <WorkspaceScenarioSwitcher /> : null}
          {isMarkerOfekPath(pathname) ? <WorkspaceEfficiencyHost enabled /> : null}
          {isMarkerOfekPath(pathname) ? <SaveWorkspaceButton /> : null}
        </TopNavigation>
        <div
          className="relative z-10 flex flex-1 min-h-0 overflow-hidden"
          data-layout-region="below-header"
        >
          <div
            className="flex flex-1 min-h-0 flex-col overflow-hidden"
            data-layout-region="vertical-stack"
          >
            <WorkspaceScrollRestore
              initialWorkspace={initialWorkspace ?? DEFAULT_WORKSPACE_SNAPSHOT}
            />
            {isMarkerOfekPath(pathname) ? (
              <>
                <WorkspaceTabBar />
                <DiamondWorkspaceHotkeys />
              </>
            ) : null}
            <SmartWorkspaceChrome>
              <main
                dir="rtl"
                data-layout-region="main-scroll"
                className={cn(
                  // השרשרת: flex-1 + min-h-0 + overflow-y-auto. זוהי האזור הגלילה היחיד.
                  // הסרנו את `pt-16 md:pt-16` הישן — הוא היה leftover מתקופה שהיה
                  // tab-bar fixed/absolute. כעת ה-WorkspaceTabBar הוא flex sibling
                  // ועוצר את עצמו טבעית, אין צורך ברזרבה.
                  "relative z-10 flex flex-1 min-h-0 w-full min-w-0 max-w-none flex-col gap-2 overflow-y-auto overflow-x-hidden bg-background px-2 py-2 text-foreground print:bg-background print:p-0 md:px-3 md:py-3"
                )}
              >
                {children}
              </main>
            </SmartWorkspaceChrome>
          </div>
        </div>
        {isMarkerOfekExecutiveContext(pathname) ? (
          <footer
            className="flex-none z-40 border-t border-border bg-card px-6 py-3 text-center text-muted-foreground print:hidden md:px-10"
            dir="rtl"
          >
            <p className="text-[11px] font-medium">
              {branding.organizationName}
            </p>
            <p className="mt-1 font-currency-mono text-[10px] leading-relaxed opacity-90">
              {branding.slogan}
            </p>
          </footer>
        ) : null}
      </div>
      <AiAssistant
        hostFirstName={hostFirstName}
        hrWelcome={hrWelcome}
        hrWelcomePending={hrWelcomePending}
      />
    </AiAssistantScreenProvider>
    </CommandPaletteProvider>
    </SmartWorkspaceProvider>
  )
}
