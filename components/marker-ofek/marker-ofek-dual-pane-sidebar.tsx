"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import {
  Archive,
  BarChart3,
  ClipboardList,
  FilePenLine,
  FolderKanban,
  GanttChartSquare,
  Home,
  LayoutDashboard,
  Layers,
  Receipt,
  Settings,
  Shield,
  Sparkles,
  Wallet,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react"

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  isSidebarNavItemActive,
  MARKER_OFEK_HREFS,
} from "@/lib/infrastructure/navigation/sidebar-routes"
import {
  filterNavItemsByModules,
  type ModuleVisibilityState,
} from "@/lib/marker-ofek/module-registry"
import { navItemHiddenWhenNoManagedProjects } from "@/lib/marker-ofek/project-scope"
import { cn } from "@/lib/utils"

export type NavContextId = "home" | "finance" | "projects" | "execution"

type ContextualItem = {
  title: string
  href: string
  icon: typeof Home
}

const PRIMARY: {
  id: NavContextId
  label: string
  icon: typeof Home
}[] = [
  { id: "home", label: "ראשי", icon: Home },
  { id: "finance", label: "כספים", icon: Wallet },
  { id: "projects", label: "פרויקטים", icon: FolderKanban },
  { id: "execution", label: "ביצוע", icon: GanttChartSquare },
]

function deriveContextFromPathname(pathname: string): NavContextId {
  if (pathname.startsWith("/marker-ofek/finance")) return "finance"
  if (pathname.startsWith("/marker-ofek/holden-erp")) return "finance"
  if (pathname.startsWith("/marker-ofek/projects")) return "projects"
  if (pathname.startsWith("/marker-ofek/execution")) return "execution"
  return "home"
}

function filterItems(
  items: ContextualItem[],
  modules: ModuleVisibilityState,
  scopedProjectCount: number | null,
  applyEmptyPortfolioNav: boolean
): ContextualItem[] {
  const modFiltered = filterNavItemsByModules(items, modules)
  if (!applyEmptyPortfolioNav) return modFiltered
  if (scopedProjectCount === null || scopedProjectCount > 0) return modFiltered
  return modFiltered.filter(
    (item) => !navItemHiddenWhenNoManagedProjects(item.href)
  )
}

function contextIsActive(pathname: string, ctx: NavContextId): boolean {
  return deriveContextFromPathname(pathname) === ctx
}

export function MarkerOfekDualPaneSidebar({
  modules,
  closeMobileNav,
  markerSoftNav,
  showPartnerFinanceNav = false,
  showHoldingExecutiveNav = false,
  showUserPermissionsNav = false,
  showAiUserSetupNav = false,
  scopedProjectCount = null,
  applyEmptyPortfolioNav = false,
}: {
  modules: ModuleVisibilityState
  closeMobileNav: () => void
  markerSoftNav?: (href: string, title: string) => void
  showPartnerFinanceNav?: boolean
  showHoldingExecutiveNav?: boolean
  showUserPermissionsNav?: boolean
  showAiUserSetupNav?: boolean
  scopedProjectCount?: number | null
  applyEmptyPortfolioNav?: boolean
}) {
  const pathname = usePathname() ?? ""
  const [activeContext, setActiveContext] = useState<NavContextId>(() =>
    deriveContextFromPathname(pathname)
  )

  useEffect(() => {
    setActiveContext(deriveContextFromPathname(pathname))
  }, [pathname])

  const homeItems = useMemo((): ContextualItem[] => {
    const base: ContextualItem[] = [
      {
        title: "מרכז הפיקוד",
        href: "/marker-ofek/command-center",
        icon: LayoutDashboard,
      },
      {
        title: "מודולים",
        href: "/marker-ofek/settings/modules",
        icon: Layers,
      },
      {
        title: "הגדרות",
        href: "/marker-ofek/settings",
        icon: Settings,
      },
    ]
    if (showHoldingExecutiveNav) {
      base.push({
        title: "דשבורד הנהלה",
        href: "/marker-ofek/executive",
        icon: BarChart3,
      })
    }
    if (showPartnerFinanceNav) {
      base.push({
        title: "מרכז שותפי ניהול",
        href: "/marker-ofek/partner-finance",
        icon: BarChart3,
      })
    }
    if (showAiUserSetupNav) {
      base.push({
        title: "הקמת משתמש (AI)",
        href: "/marker-ofek/settings/users/ai-setup",
        icon: Sparkles,
      })
    }
    if (showUserPermissionsNav) {
      base.push({
        title: "הרשאות משתמשים",
        href: "/marker-ofek/settings/user-permissions",
        icon: Shield,
      })
    }
    return base
  }, [
    showHoldingExecutiveNav,
    showPartnerFinanceNav,
    showAiUserSetupNav,
    showUserPermissionsNav,
  ])

  const contextualById = useMemo(
    (): Record<NavContextId, ContextualItem[]> => ({
      home: homeItems,
      finance: [
        {
          title: "Holden ERP",
          href: "/marker-ofek/holden-erp",
          icon: Sparkles,
        },
        {
          title: "הפקת חשבונית מס",
          href: MARKER_OFEK_HREFS.financeInvoiceNew,
          icon: Receipt,
        },
        {
          title: "ארכיון כספים",
          href: "/marker-ofek/finance/invoices",
          icon: Archive,
        },
      ],
      projects: [
        {
          title: "לוח פרויקטים",
          href: "/marker-ofek/projects",
          icon: FolderKanban,
        },
      ],
      execution: [
        {
          title: "גאנט ביצוע",
          href: "/marker-ofek/execution/gantt",
          icon: GanttChartSquare,
        },
        {
          title: "יומני עבודה",
          href: "/marker-ofek/execution/daily-logs",
          icon: FilePenLine,
        },
        {
          title: "דוחות התקדמות",
          href: "/marker-ofek/execution/progress-reports",
          icon: ClipboardList,
        },
      ],
    }),
    [homeItems]
  )

  const visibleContextual = useMemo(
    () =>
      filterItems(
        contextualById[activeContext],
        modules,
        scopedProjectCount,
        applyEmptyPortfolioNav
      ),
    [
      activeContext,
      contextualById,
      modules,
      scopedProjectCount,
      applyEmptyPortfolioNav,
    ]
  )

  const contextTitle = useMemo(() => {
    const p = PRIMARY.find((x) => x.id === activeContext)
    return p?.label ?? "ניווט"
  }, [activeContext])

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
      className="flex min-h-0 flex-1 gap-0 border-t border-slate-800/40 pt-2"
      dir="rtl"
    >
      {/* Primary — slim icons (rightmost in RTL = first in DOM) */}
      <nav
        className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-e border-slate-800/50 bg-slate-950/40 py-2 pe-0.5 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent"
        aria-label="הקשר ראשי"
      >
        {PRIMARY.map((p) => {
          const Icon = p.icon
          const active = contextIsActive(pathname, p.id)
          const selected = activeContext === p.id
          return (
            <button
              key={p.id}
              type="button"
              title={p.label}
              onClick={() => setActiveContext(p.id)}
              className={cn(
                "flex size-10 items-center justify-center rounded-lg transition-all duration-200",
                selected || active
                  ? "bg-emerald-500/15 text-emerald-400 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.35)]"
                  : "text-slate-500 hover:bg-slate-800/90 hover:text-slate-100"
              )}
            >
              <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
              <span className="sr-only">{p.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Secondary — contextual links */}
      <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
        <div className="border-b border-slate-800/50 px-2 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {contextTitle}
          </p>
        </div>
            <AnimatePresence mode="wait">
          <motion.div
            key={activeContext}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="px-1 py-1"
          >
            {visibleContextual.length === 0 ? (
              <p className="px-3 py-6 text-center text-[11px] leading-relaxed text-slate-500">
                אין קישורים זמינים בהקשר הזה (בדוק מודולים או הרשאות).
              </p>
            ) : (
            <SidebarMenu className="gap-0.5">
              {visibleContextual.map((item) => {
                const Icon = item.icon
                return (
                  <SidebarMenuItem key={`${activeContext}-${item.href}`}>
                    <SidebarMenuButton
                      isActive={isSidebarNavItemActive(pathname, item.href)}
                      tooltip={item.title}
                      size="default"
                      className={cn(
                        "gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ease-out",
                        "[&_svg]:size-4 [&_svg]:shrink-0",
                        "data-active:bg-emerald-500/20 data-active:text-emerald-50 data-active:shadow-sm",
                        "hover:bg-slate-800/80 hover:text-emerald-100"
                      )}
                      render={
                        <Link
                          href={item.href}
                          onClick={(e) => onNavClick(e, item.href, item.title)}
                          dir="rtl"
                          className="flex w-full items-center justify-start gap-2 text-start"
                        >
                          <Icon aria-hidden />
                          <span className="truncate font-currency-mono text-[13px]">
                            {item.title}
                          </span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
