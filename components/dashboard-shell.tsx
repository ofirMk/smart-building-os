"use client"

import { useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronLeft } from "lucide-react"

import { CommentNotificationBell } from "@/components/dashboard/comment-notification-bell"
import { DashboardLastVisitTracker } from "@/components/dashboard-last-visit-tracker"
import { AppSidebar } from "@/components/app-sidebar"
import { FullscreenToggle } from "@/components/marker-ofek/fullscreen-toggle"
import { GlobalProjectSearch } from "@/components/marker-ofek/global-project-search"
import { MarkerOfekModuleHeaderActions } from "@/components/marker-ofek/marker-ofek-module-header-actions"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  type AppUserRole,
  guyRahumimWelcomeMessage,
} from "@/lib/auth/user-role"
import {
  isMarkerOfekExecutiveContext,
  isMarkerOfekPath,
} from "@/app/(dashboard)/_components/sidebar-routes"
import { MirrorModeBanner } from "@/components/marker-ofek/mirror-mode-banner"
import { MirrorModeSelector } from "@/components/marker-ofek/mirror-mode-selector"
import { DiamondSidekickToggle } from "@/components/marker-ofek/workspace/diamond-sidekick"
import { AiAssistant } from "@/components/dashboard/AiAssistant"
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

  return (
    <SmartWorkspaceProvider initial={initialWorkspace ?? DEFAULT_WORKSPACE_SNAPSHOT}>
    <SidebarProvider dir="rtl">
      {mirrorBannerOn && mirrorBannerLabel ? (
        <MirrorModeBanner label={mirrorBannerLabel} />
      ) : null}
      <AppSidebar
        userEmail={userEmail}
        userRole={userRole}
        hostGreetingLine={hostGreetingLine}
        showPartnerFinanceNav={showPartnerFinanceNav}
        showHoldingExecutiveNav={showHoldingExecutiveNav}
        showUserPermissionsNav={showUserPermissionsNav}
        showAiUserSetupNav={showAiUserSetupNav}
        scopedProjectCount={scopedProjectCount}
        applyEmptyPortfolioNav={applyEmptyPortfolioNav}
        mirrorBannerActive={mirrorBannerOn}
      />
      <DashboardLastVisitTracker />
      <SidebarInset
        dir="rtl"
        className={cn(
          "relative z-0 min-h-svh min-w-0 flex-1 overflow-x-hidden bg-background text-foreground",
          "lg:peer-data-[variant=inset]:m-0 lg:peer-data-[variant=inset]:rounded-none lg:peer-data-[variant=inset]:bg-background",
          "lg:peer-data-[variant=inset]:shadow-none lg:peer-data-[variant=inset]:ring-0 lg:peer-data-[variant=inset]:backdrop-blur-none",
          "print:pe-0 print:lg:pe-0",
          mirrorBannerOn && MIRROR_BANNER_INSET_PT_CLASS
        )}
      >
        <header
          className={cn(
            "sticky z-20 flex min-h-[3.75rem] shrink-0 items-center gap-4 border-b border-slate-100 bg-white px-4 py-3 print:hidden md:px-8",
            mirrorBannerOn ? MIRROR_BANNER_STICKY_TOP_CLASS : "top-0",
            "text-slate-900"
          )}
        >
          <SidebarTrigger
            className={cn(
              "size-9 shrink-0 rounded-lg transition-all duration-200 ease-out",
              "border border-border bg-background text-muted-foreground shadow-sm hover:bg-accent hover:text-accent-foreground"
            )}
          />
          <div className="flex min-w-0 flex-1 flex-col text-start">
            <div className="mb-0.5 flex items-center gap-1 overflow-x-auto text-[10px] text-muted-foreground">
              {crumbs.map((crumb, idx) => (
                <span key={`${crumb.label}-${idx}`} className="inline-flex items-center gap-1 whitespace-nowrap">
                  {idx > 0 ? <ChevronLeft className="size-3 opacity-70" aria-hidden /> : null}
                  {crumb.href && idx < crumbs.length - 1 ? (
                    <Link
                      href={crumb.href}
                      className="transition-colors duration-200 hover:text-foreground"
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
            {isMarkerOfekPath(pathname) ? <WorkspaceParallelSplitControl /> : null}
            {isMarkerOfekPath(pathname) ? <DiamondSidekickToggle /> : null}
            {showMirrorSelector ? (
              <MirrorModeSelector currentViewAs={mirrorViewAs} />
            ) : null}
            <ThemeToggle />
            <FullscreenToggle />
            {userRole === "admin" ? (
              <CommentNotificationBell className="text-muted-foreground transition-colors duration-300 ease-in-out hover:text-foreground" />
            ) : null}
          </div>
        </header>
        {isMarkerOfekPath(pathname) ? (
          <>
            <WorkspaceTabBar />
            <DiamondWorkspaceHotkeys />
          </>
        ) : null}
        <SmartWorkspaceChrome>
          <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-10 bg-background px-6 py-10 print:p-0 md:px-10 md:py-12">
            {children}
          </div>
        </SmartWorkspaceChrome>
        {isMarkerOfekExecutiveContext(pathname) ? (
          <footer
            className="shrink-0 border-t border-slate-100 bg-white px-6 py-4 text-center print:hidden md:px-10"
            dir="rtl"
          >
            <p className="text-[11px] font-medium text-slate-500">
              {branding.organizationName}
            </p>
            <p className="mt-1 font-currency-mono text-[10px] leading-relaxed text-slate-400">
              {branding.slogan}
            </p>
          </footer>
        ) : null}
      </SidebarInset>
    </SidebarProvider>
      <AiAssistant
        hostFirstName={hostFirstName}
        hrWelcome={hrWelcome}
        hrWelcomePending={hrWelcomePending}
      />
    </SmartWorkspaceProvider>
  )
}
