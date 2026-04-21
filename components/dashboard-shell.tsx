"use client"

import { useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronLeft } from "lucide-react"

import {
  CommandPaletteHeaderTrigger,
  CommandPaletteProvider,
} from "@/components/dashboard/command-palette"
import { DashboardLastVisitTracker } from "@/components/dashboard-last-visit-tracker"
import { TopNavBar } from "@/components/layout/TopNavBar"
import { CompanyContextGate } from "@/components/layout/company-context-gate"
import { FullscreenToggle } from "@/components/marker-ofek/fullscreen-toggle"
import { GlobalProjectSearch } from "@/components/marker-ofek/global-project-search"
import { MarkerOfekModuleHeaderActions } from "@/components/marker-ofek/marker-ofek-module-header-actions"
import { SaveWorkspaceButton } from "@/components/marker-ofek/workspace/save-workspace-button"
import { WorkspaceEfficiencyHost } from "@/components/marker-ofek/workspace/workspace-efficiency-host"
import { WorkspaceScenarioSwitcher } from "@/components/marker-ofek/workspace/workspace-scenario-switcher"
import { WorkspaceScrollRestore } from "@/components/marker-ofek/workspace/workspace-scroll-restore"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  type AppUserRole,
  guyRahumimWelcomeMessage,
} from "@/lib/auth/user-role"
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
import {
  ERP_EXECUTION_SUBTITLE,
  useOrganizationBranding,
} from "@/components/organization-branding-context"
import {
  MIRROR_BANNER_INSET_PT_CLASS,
  MIRROR_BANNER_STICKY_TOP_CLASS,
} from "@/lib/marker-ofek/mirror-layout"
import type { ViewAsToken } from "@/lib/marker-ofek/mirror-mode-types"
import { titleForPath } from "@/lib/marker-ofek/route-page-title"
import type { HrWelcomePayload } from "@/lib/marker-ofek/diamond-navigator-curriculum"
import type { WorkspaceSettingsSnapshot } from "@/lib/marker-ofek/workspace-types"
import { DEFAULT_WORKSPACE_SNAPSHOT } from "@/lib/marker-ofek/user-workspace-shared"
import { cn } from "@/lib/utils"
import type { CompanyContextId } from "@/lib/company-context"

type Crumb = { label: string; href: string | null }

function buildHebrewCrumbs(pathname: string, erpRootLabel: string): Crumb[] {
  if (pathname === "/partner-finance" || pathname.startsWith("/partner-finance/")) {
    const crumbs: Crumb[] = [
      { label: "מרכז שותפי ניהול", href: "/marker-ofek/partner-finance" },
    ]
    const rest = pathname.replace(/^\/partner-finance\/?/, "").split("/").filter(Boolean)
    if (rest[0] && /^[0-9a-f-]{8,}$/i.test(rest[0])) {
      crumbs.push({ label: "פירוט פרויקט", href: null })
    }
    return crumbs
  }
  if (!pathname.startsWith("/marker-ofek")) {
    return [{ label: titleForPath(pathname), href: null }]
  }
  const labelMap: Record<string, string> = {
    "pre-construction": "קדם ביצוע",
    projects: "פרויקטים",
    contracts: "חוזים",
    execution: "פרויקטים",
    gantt: "גנט",
    procurement: "רכש",
    orders: "הזמנות",
    suppliers: "ספקים",
    inventory: "ניהול מלאי",
    catalog: "קטלוג פריטים",
    assets: "נכסי חברה",
    settings: "הגדרות",
    modules: "מודולים",
    executive: "דשבורד הנהלה",
    "partner-finance": "מרכז שותפי ניהול",
    invoices: "חשבוניות",
    reconciliation: "בקרת התאמות",
    "delivery-notes": "תעודות משלוח",
    "goods-receipt": "קליטת סחורה",
    items: "פריטים",
    "supply-chain": "שרשרת אספקה",
    "daily-logs": "יומני עבודה",
    "progress-reports": "חשבונות חלקיים",
    tenders: "מכרזים והערכות",
    pricing: "תמחור פרויקטים",
    boq: "כתבי כמויות",
    comparison: "השוואת הצעות",
    wbs: "מבנה WBS",
  }
  const segments = pathname.split("/").filter(Boolean)
  const crumbs: Crumb[] = [
    { label: erpRootLabel, href: "/marker-ofek/command-center" },
  ]
  let acc = ""
  for (const segment of segments.slice(1)) {
    acc += `/${segment}`
    const isIdLike = /^[0-9a-f-]{8,}$/i.test(segment)
    if (isIdLike) {
      crumbs.push({ label: "פרויקט", href: null })
      continue
    }
    crumbs.push({
      label: labelMap[segment] ?? segment.replace(/-/g, " "),
      href: `/marker-ofek${acc}`,
    })
  }
  return crumbs
}

/**
 * Full dashboard chrome (workspace, command palette, nav drawer, **TopNavBar** + main).
 * Mounted from `app/(dashboard)/layout.tsx` together with `DashboardProviders`.
 */
export function DashboardShell({
  children,
  userEmail,
  userRole,
  hostGreetingLine = null,
  hostFirstName = null,
  hrWelcome = null,
  hrWelcomePending = false,
  markerWorkspaceSubtitle = null,
  initialWorkspace,
  showPartnerFinanceNav = false,
  showHoldingExecutiveNav = false,
  showUserPermissionsNav = false,
  showAiUserSetupNav = false,
  scopedProjectCount = null,
  applyEmptyPortfolioNav = false,
  showMirrorSelector = false,
  mirrorViewAs = "global" as ViewAsToken,
  mirrorBannerLabel = null,
  selectedCompany = null,
}: {
  children: React.ReactNode
  userEmail: string | null
  userRole: AppUserRole
  /** ברכת זמן + שם פרטי — מרקר אופק */
  hostGreetingLine?: string | null
  hostFirstName?: string | null
  hrWelcome?: HrWelcomePayload | null
  hrWelcomePending?: boolean
  /** כותרת משנה לשולחן עבודה — מרקר אופק */
  markerWorkspaceSubtitle?: string | null
  initialWorkspace?: WorkspaceSettingsSnapshot
  /** מרכז שותפי ניהול — הרשאות הנהלה בכירה */
  showPartnerFinanceNav?: boolean
  /** דשבורד הנהלה — מבט פורטפוליו (מסונן לפי שותף כשלא אדמין/אופיר) */
  showHoldingExecutiveNav?: boolean
  showUserPermissionsNav?: boolean
  showAiUserSetupNav?: boolean
  scopedProjectCount?: number | null
  applyEmptyPortfolioNav?: boolean
  showMirrorSelector?: boolean
  mirrorViewAs?: ViewAsToken
  mirrorBannerLabel?: string | null
  selectedCompany?: CompanyContextId | null
}) {
  const pathname = usePathname()
  const branding = useOrganizationBranding()
  const title = useMemo(() => {
    if (
      pathname === "/marker-ofek/command-center" ||
      pathname === "/marker-ofek" ||
      pathname === "/marker-ofek/"
    ) {
      return `${branding.organizationName} — מרכז הפיקוד`
    }
    return titleForPath(pathname)
  }, [pathname, branding.organizationName])
  const headerBrand = useMemo(
    () =>
      isMarkerOfekExecutiveContext(pathname)
        ? `${branding.organizationName} · ${ERP_EXECUTION_SUBTITLE}`
        : "הולדן ניהול מבנים ומתחמים",
    [pathname, branding.organizationName]
  )
  const headerSubtitle = useMemo(() => {
    if (isMarkerOfekPath(pathname) && markerWorkspaceSubtitle?.trim()) {
      return markerWorkspaceSubtitle.trim()
    }
    return (
      guyRahumimWelcomeMessage(userEmail) ??
      "תפעול נכסים ברמה הגבוהה ביותר וחוויית דיירים"
    )
  }, [pathname, markerWorkspaceSubtitle, userEmail])
  const crumbs = useMemo(
    () => buildHebrewCrumbs(pathname, branding.organizationName),
    [pathname, branding.organizationName]
  )

  const mirrorBannerOn = Boolean(mirrorBannerLabel?.trim())
  const isHoldenErpShell = isMarkerOfekPath(pathname)
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
      <div
        className={cn(
          "flex h-screen min-h-0 min-w-0 w-full max-w-none flex-1 flex-col overflow-hidden bg-background text-foreground",
          requiresCompanySelection && "hidden",
          mirrorBannerOn && MIRROR_BANNER_INSET_PT_CLASS
        )}
        data-dashboard-layout="topnav-main"
      >
        <TopNavBar
          isHoldenErpShell={isHoldenErpShell}
          stickyClassName={
            mirrorBannerOn ? MIRROR_BANNER_STICKY_TOP_CLASS : "top-0"
          }
        >
          <div className="flex min-w-0 flex-1 flex-col text-start">
            <div className="mb-0.5 flex items-center gap-1 overflow-x-auto text-[10px] text-muted-foreground">
              {crumbs.map((crumb, idx) => (
                <span key={`${crumb.label}-${idx}`} className="inline-flex items-center gap-1 whitespace-nowrap">
                  {idx > 0 ? <ChevronLeft className="size-3 opacity-70" aria-hidden /> : null}
                  {crumb.href && idx < crumbs.length - 1 ? (
                    <Link
                      href={crumb.href}
                      className={cn(
                        "group/crumb relative rounded-sm px-0.5 transition-colors duration-200 hover:text-foreground",
                        "after:absolute after:inset-x-0 after:-bottom-px after:h-px after:origin-bottom after:scale-x-0 after:bg-foreground/45 after:transition-transform after:duration-300 after:ease-[cubic-bezier(0.22,1,0.36,1)] hover:after:scale-x-100"
                      )}
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={idx === crumbs.length - 1 ? "font-semibold text-foreground" : ""}>
                      {crumb.label}
                    </span>
                  )}
                </span>
              ))}
            </div>
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {headerBrand}
            </p>
            <h1 className="page-title truncate">
              {title}
            </h1>
            <p className="hidden text-[11px] font-normal leading-snug text-muted-foreground sm:block">
              {headerSubtitle}
            </p>
          </div>
          {isMarkerOfekExecutiveContext(pathname) ? <GlobalProjectSearch /> : null}
          <MarkerOfekModuleHeaderActions />
          <div className="flex shrink-0 items-center gap-1">
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
          </div>
        </TopNavBar>
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
            className="relative z-0 flex h-[calc(100vh-4rem)] min-h-0 flex-1 w-full min-w-0 max-w-none flex-col gap-2 overflow-hidden bg-background px-2 py-2 text-foreground print:bg-background print:p-0 md:px-3 md:py-3"
          >
            {children}
          </main>
        </SmartWorkspaceChrome>
        {isMarkerOfekExecutiveContext(pathname) ? (
          <footer
            className="shrink-0 border-t border-border bg-card px-6 py-3 text-center text-muted-foreground print:hidden md:px-10"
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
