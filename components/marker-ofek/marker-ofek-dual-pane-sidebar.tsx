"use client"

import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import {
  Activity,
  ArrowLeftRight,
  CreditCard,
  FileEdit,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Table2,
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
import { isSidebarNavItemActive } from "@/lib/infrastructure/navigation/sidebar-routes"
import {
  filterNavItemsByModules,
  type ModuleVisibilityState,
} from "@/lib/marker-ofek/module-registry"
import { navItemHiddenWhenNoManagedProjects } from "@/lib/marker-ofek/project-scope"
import { cn } from "@/lib/utils"

export type NavContextId =
  | "procurement"
  | "finance"
  | "masterData"
  | "system"

type ContextualItem = {
  title: string
  href: string
  icon: LucideIcon
}

const PRIMARY: {
  id: NavContextId
  label: string
  icon: LucideIcon
}[] = [
  { id: "procurement", label: "ניהול רכש", icon: ShoppingCart },
  { id: "finance", label: "ניהול כספים", icon: Wallet },
  { id: "masterData", label: "ניהול נתונים", icon: Table2 },
  { id: "system", label: "מערכת", icon: Activity },
]

function deriveContextFromPathname(pathname: string): NavContextId {
  if (
    pathname.startsWith("/marker-ofek/finance") ||
    pathname.startsWith("/marker-ofek/holden-erp")
  ) {
    return "finance"
  }
  if (pathname.startsWith("/marker-ofek/master-data")) {
    return "masterData"
  }
  if (pathname.startsWith("/marker-ofek/system")) {
    return "system"
  }
  if (
    pathname.startsWith("/marker-ofek/procurement") ||
    pathname.startsWith("/marker-ofek/supply-chain") ||
    pathname.startsWith("/marker-ofek/items")
  ) {
    return "procurement"
  }
  return "procurement"
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
  showPartnerFinanceNav: _showPartnerFinanceNav = false,
  showHoldingExecutiveNav: _showHoldingExecutiveNav = false,
  showUserPermissionsNav: _showUserPermissionsNav = false,
  showAiUserSetupNav: _showAiUserSetupNav = false,
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

  const contextualById = useMemo(
    (): Record<NavContextId, ContextualItem[]> => ({
      procurement: [
        {
          title: "מרכז רכש אחוד",
          href: "/marker-ofek/procurement",
          icon: ShoppingCart,
        },
      ],
      finance: [
        {
          title: "הזנת פקודת יומן",
          href: "/marker-ofek/finance/journal-entries/new",
          icon: FileEdit,
        },
        {
          title: "בקרת תשלומים",
          href: "/marker-ofek/finance/clearance",
          icon: ShieldCheck,
        },
        {
          title: "התאמות בנקים",
          href: "/marker-ofek/finance/reconciliations",
          icon: ArrowLeftRight,
        },
        {
          title: "הפקת חשבונית מס",
          href: "/marker-ofek/finance/billing/new",
          icon: Receipt,
        },
        {
          title: "ניהול מס״ב",
          href: "/marker-ofek/finance/payments",
          icon: CreditCard,
        },
      ],
      masterData: [
        {
          title: "מרכז נתוני מאסטר",
          href: "/marker-ofek/master-data",
          icon: Table2,
        },
      ],
      system: [
        {
          title: "בריאות המערכת",
          href: "/marker-ofek/system/health",
          icon: Activity,
        },
      ],
    }),
    []
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
      <nav
        className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-e border-slate-800/50 bg-slate-950/40 py-2 pe-0.5 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent"
        aria-label="ארבעת העמודים"
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
