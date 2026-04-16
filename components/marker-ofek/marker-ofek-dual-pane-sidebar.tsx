"use client"

import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useMemo, type MouseEvent } from "react"

import { sidebarMenuButtonVariants } from "@/components/ui/sidebar"
import { isSidebarNavItemActive } from "@/lib/infrastructure/navigation/sidebar-routes"
import { MARKER_OFEK_SIDEBAR_SECTIONS } from "@/lib/marker-ofek/marker-ofek-sidebar-nav-config"
import {
  filterNavItemsByModules,
  type ModuleVisibilityState,
} from "@/lib/marker-ofek/module-registry"
import { navItemHiddenWhenNoManagedProjects } from "@/lib/marker-ofek/project-scope"
import { cn } from "@/lib/utils"

type DrawerNavItem = {
  title: string
  href: string
  icon: LucideIcon
}

function filterDrawerItems(
  items: DrawerNavItem[],
  modules: ModuleVisibilityState,
  scopedProjectCount: number | null,
  applyEmptyPortfolioNav: boolean
): DrawerNavItem[] {
  const modFiltered = filterNavItemsByModules(items, modules)
  if (!applyEmptyPortfolioNav) return modFiltered
  if (scopedProjectCount === null || scopedProjectCount > 0) return modFiltered
  return modFiltered.filter(
    (item) => !navItemHiddenWhenNoManagedProjects(item.href)
  )
}

export type MarkerOfekDrawerNavProps = {
  modules: ModuleVisibilityState
  closeMobileNav: () => void
  markerSoftNav?: (href: string, title: string) => void
  showPartnerFinanceNav?: boolean
  showHoldingExecutiveNav?: boolean
  showUserPermissionsNav?: boolean
  showAiUserSetupNav?: boolean
  scopedProjectCount?: number | null
  applyEmptyPortfolioNav?: boolean
}

/**
 * מגירת ניווט מרקר אופק — נבנה מ־`MARKER_OFEK_SIDEBAR_SECTIONS` (מקור אמת יחיד).
 * עדכון `marker-ofek-sidebar-nav-config.ts` משתקף כאן אוטומטית.
 *
 * התראות גלובליות (פעמון) — ב־`components/layout/TopNavBar.tsx` דרך `NotificationBell`, לא בסרגל צד.
 */
export function MarkerOfekDrawerNavContent({
  modules,
  closeMobileNav,
  markerSoftNav,
  scopedProjectCount = null,
  applyEmptyPortfolioNav = false,
}: MarkerOfekDrawerNavProps) {
  const pathname = usePathname() ?? ""

  const navSections = useMemo(() => {
    return MARKER_OFEK_SIDEBAR_SECTIONS.map((section) => ({
      id: section.id,
      label: section.label,
      items: filterDrawerItems(
        section.items.map((it) => ({
          title: it.title,
          href: it.href,
          icon: it.icon,
        })),
        modules,
        scopedProjectCount,
        applyEmptyPortfolioNav
      ),
    })).filter((s) => s.items.length > 0)
  }, [modules, scopedProjectCount, applyEmptyPortfolioNav])

  const onNavClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>, href: string, title: string) => {
      if (markerSoftNav && href.startsWith("/marker-ofek")) {
        e.preventDefault()
        closeMobileNav()
        markerSoftNav(href, title)
      } else {
        closeMobileNav()
      }
    },
    [closeMobileNav, markerSoftNav]
  )

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-slate-800/40 pt-2"
      dir="rtl"
    >
      <nav
        className="flex min-h-0 flex-1 flex-col gap-4 px-1 pb-3"
        aria-label="ניווט מרקר אופק"
      >
        {navSections.map((section) => (
          <div key={section.id} className="min-w-0">
            <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {section.label}
            </p>
            <ul className="flex w-full min-w-0 flex-col gap-0.5 p-0">
              {section.items.map((item, index) => {
                const Icon = item.icon
                const active = isSidebarNavItemActive(pathname, item.href)
                return (
                  <li
                    key={`${section.id}-${item.title}-${index}`}
                    className="group/menu-item relative"
                  >
                    <Link
                      href={item.href}
                      onClick={(e) => onNavClick(e, item.href, item.title)}
                      dir="rtl"
                      data-active={active ? "" : undefined}
                      className={cn(
                        sidebarMenuButtonVariants({
                          variant: "default",
                          size: "default",
                        }),
                        "gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ease-out",
                        "[&_svg]:size-4 [&_svg]:shrink-0",
                        "data-active:bg-emerald-500/20 data-active:text-emerald-50 data-active:shadow-sm",
                        "hover:bg-slate-800/80 hover:text-emerald-100",
                        "flex w-full items-center justify-start text-start"
                      )}
                    >
                      <Icon aria-hidden />
                      <span className="truncate text-[13px]">{item.title}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  )
}

/** @deprecated Prefer `MarkerOfekDrawerNavContent` in new code; kept for legacy imports. */
export function MarkerOfekDualPaneSidebar(props: MarkerOfekDrawerNavProps) {
  return <MarkerOfekDrawerNavContent {...props} />
}
