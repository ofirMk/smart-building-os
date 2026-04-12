"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useMemo } from "react"
import { usePathname } from "next/navigation"

import { MarkerOfekDrawerNavContent } from "@/components/marker-ofek/marker-ofek-dual-pane-sidebar"
import { useModuleVisibility } from "@/components/marker-ofek/marker-ofek-dashboard-context"
import { useSmartWorkspace } from "@/components/marker-ofek/workspace/smart-workspace-context"
import { useNavDrawer } from "@/components/dashboard/nav-drawer-context"
import {
  FACILITY_ADMIN_NAV_SECTIONS,
  HOLDEN_NAV_SECTIONS,
  type SidebarNavItem,
} from "@/components/marker-ofek/marker-ofek-sidebar-sections"
import { sidebarMenuButtonVariants } from "@/components/ui/sidebar"
import type { AppUserRole } from "@/lib/auth/user-role"
import {
  isFacilityManagementContext,
  isMarkerOfekExecutiveContext,
  isSidebarNavItemActive,
} from "@/lib/infrastructure/navigation/sidebar-routes"
import { filterSidebarSectionsByModules } from "@/lib/marker-ofek/module-registry"
import { cn } from "@/lib/utils"

function FacilityDrawerLinkRow({
  item,
  pathname,
  closeMobileNav,
}: {
  item: SidebarNavItem
  pathname: string
  closeMobileNav: () => void
}) {
  const Icon = item.icon
  const active = isSidebarNavItemActive(pathname, item.href)
  return (
    <li className="group/menu-item relative">
      <Link
        href={item.href}
        data-active={active ? "" : undefined}
        onClick={() => closeMobileNav()}
        dir="rtl"
        className={cn(
          sidebarMenuButtonVariants({ variant: "default", size: "default" }),
          "gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ease-out",
          "[&_svg]:size-4 [&_svg]:shrink-0",
          "data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:shadow-sm",
          "flex w-full items-center justify-start text-start"
        )}
      >
        <Icon aria-hidden />
        <span className="truncate">{item.title}</span>
      </Link>
    </li>
  )
}

export function DashboardNavDrawerPanel({
  userRole,
  showPartnerFinanceNav = false,
  showHoldingExecutiveNav = false,
  showUserPermissionsNav = false,
  showAiUserSetupNav = false,
  scopedProjectCount = null,
  applyEmptyPortfolioNav = false,
}: {
  userRole: AppUserRole
  showPartnerFinanceNav?: boolean
  showHoldingExecutiveNav?: boolean
  showUserPermissionsNav?: boolean
  showAiUserSetupNav?: boolean
  scopedProjectCount?: number | null
  applyEmptyPortfolioNav?: boolean
}) {
  const pathname = usePathname() ?? ""
  const router = useRouter()
  const { setOpen: setNavOpen } = useNavDrawer()
  const smartWs = useSmartWorkspace()
  const { modules } = useModuleVisibility()

  const closeMobileNav = useCallback(() => {
    setNavOpen(false)
  }, [setNavOpen])

  const markerSoftNav = useCallback(
    (href: string, title: string) => {
      smartWs?.ensureTabForPath(href, title)
      router.push(href)
    },
    [router, smartWs]
  )

  const holdenNavSections = useMemo(() => {
    const raw =
      userRole === "admin"
        ? [...HOLDEN_NAV_SECTIONS, ...FACILITY_ADMIN_NAV_SECTIONS]
        : HOLDEN_NAV_SECTIONS
    return filterSidebarSectionsByModules(raw, modules)
  }, [userRole, modules])

  /** מרקר אופק / דשבורד ראשי: המגירה נטענת אך ורק מ־`MARKER_OFEK_SIDEBAR_SECTIONS` דרך `MarkerOfekDrawerNavContent`. */
  const isMarker = isMarkerOfekExecutiveContext(pathname)

  if (isMarker) {
    return (
      <div
        className="flex h-full min-h-0 w-full flex-col overflow-y-auto bg-sidebar px-2 pb-4 pt-2 text-sidebar-foreground"
        dir="rtl"
      >
        <MarkerOfekDrawerNavContent
          modules={modules}
          closeMobileNav={closeMobileNav}
          markerSoftNav={markerSoftNav}
          showPartnerFinanceNav={showPartnerFinanceNav}
          showHoldingExecutiveNav={showHoldingExecutiveNav}
          showUserPermissionsNav={showUserPermissionsNav}
          showAiUserSetupNav={showAiUserSetupNav}
          scopedProjectCount={scopedProjectCount}
          applyEmptyPortfolioNav={applyEmptyPortfolioNav}
        />
      </div>
    )
  }

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col overflow-y-auto bg-sidebar px-3 pb-4 pt-3 text-sidebar-foreground"
      dir="rtl"
    >
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        {isFacilityManagementContext(pathname)
          ? "הולדן גרופ — ניהול מבנים"
          : "ניווט"}
      </p>
      {holdenNavSections.map((section, idx) => (
        <div key={section.label ?? `sec-${idx}`} className="mb-4">
          {section.label ? (
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
              {section.label}
            </p>
          ) : null}
          <ul className="flex flex-col gap-0.5 p-0">
            {section.items.map((item, itemIdx) => (
              <FacilityDrawerLinkRow
                key={`${idx}-${itemIdx}-${item.href}`}
                item={item}
                pathname={pathname}
                closeMobileNav={closeMobileNav}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
