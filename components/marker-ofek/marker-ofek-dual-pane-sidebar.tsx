"use client"

import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useMemo, useState, type MouseEvent } from "react"

import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { SidebarProjectContextSwitcher } from "@/components/marker-ofek/sidebar-project-context-switcher"
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
      defaultOpen: section.defaultOpen,
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

  const activeSectionId = useMemo(() => {
    const activeSection = navSections.find((section) =>
      section.items.some((item) => isSidebarNavItemActive(pathname, item.href))
    )
    return activeSection?.id ?? null
  }, [navSections, pathname])

  const [manualExpandedSections, setManualExpandedSections] = useState<string[]>(() =>
    navSections
      .filter((section) => section.defaultOpen)
      .map((section) => section.id)
  )
  const expandedSections = useMemo(() => {
    const next = new Set<string>()
    for (const section of navSections) {
      if (section.defaultOpen) next.add(section.id)
    }
    for (const sectionId of manualExpandedSections) {
      if (navSections.some((section) => section.id === sectionId)) next.add(sectionId)
    }
    if (activeSectionId) next.add(activeSectionId)
    return [...next]
  }, [activeSectionId, manualExpandedSections, navSections])

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-border/70 pt-2"
      dir="rtl"
    >
      <div className="px-1">
        <SidebarProjectContextSwitcher />
      </div>
      <nav
        className="flex min-h-0 flex-1 flex-col px-1 pb-3"
        aria-label="ניווט מרקר אופק"
      >
        <Accordion
          type="multiple"
          value={expandedSections}
          onValueChange={setManualExpandedSections}
          className="w-full"
        >
          {navSections.map((section) => (
            <AccordionItem
              key={section.id}
              value={section.id}
              className={cn(
                "mb-2 overflow-hidden rounded-xl border border-border bg-card px-1",
                "shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
              )}
            >
              <AccordionHeader>
                <AccordionTrigger className="rounded-lg px-2 py-3 text-xs font-semibold tracking-[0.04em] text-muted-foreground transition-all duration-200 data-[state=open]:text-foreground hover:bg-accent hover:text-accent-foreground">
                  {section.label}
                </AccordionTrigger>
              </AccordionHeader>
              <AccordionContent className="border-t border-border/70 pb-2 pt-2">
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
                            "data-active:border data-active:border-border data-active:bg-accent data-active:text-accent-foreground data-active:shadow-sm",
                            "border border-transparent hover:border-border hover:bg-accent hover:text-accent-foreground",
                            "flex w-full items-center justify-start text-start text-muted-foreground",
                            "active:scale-[0.99]"
                          )}
                        >
                          <Icon aria-hidden />
                          <span className="truncate text-[13px]">{item.title}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </nav>
    </div>
  )
}

/** @deprecated Prefer `MarkerOfekDrawerNavContent` in new code; kept for legacy imports. */
export function MarkerOfekDualPaneSidebar(props: MarkerOfekDrawerNavProps) {
  return <MarkerOfekDrawerNavContent {...props} />
}
