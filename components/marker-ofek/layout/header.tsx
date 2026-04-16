"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ChevronDown, Home } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  MARKER_OFEK_SIDEBAR_SECTIONS,
  type MarkerOfekSidebarNavSection,
  type MarkerOfekSidebarNavItem,
} from "@/lib/marker-ofek/marker-ofek-sidebar-nav-config"
import { cn } from "@/lib/utils"

type TopModule = {
  id: string
  label: string
  sectionIds: string[]
  extraItems?: MarkerOfekSidebarNavItem[]
}

const TOP_MODULES: TopModule[] = [
  {
    id: "procurement-logistics",
    label: "רכש ואספקה",
    sectionIds: ["procurement-mgmt", "logistics"],
  },
  {
    id: "finance-billing",
    label: "ניהול כספים",
    sectionIds: ["finance-accounts", "finance-mgmt"],
  },
  {
    id: "hr-timesheets",
    label: "משאבי אנוש",
    sectionIds: ["hr-mgmt"],
  },
  {
    id: "analytics-bi",
    label: "אנליטיקה ו-BI",
    sectionIds: ["project-cockpit"],
  },
  {
    id: "project-management",
    label: "ניהול פרויקטים",
    sectionIds: ["project-mgmt", "execution-mgmt"],
    extraItems: [
      {
        title: "מרכז הפיקוד",
        href: "/marker-ofek/command-center",
        icon: Home,
      },
    ],
  },
  {
    id: "data-system",
    label: "נתונים ומערכת",
    sectionIds: ["master-data-mgmt", "system-ops"],
  },
  {
    id: "ai-agent",
    label: "AI Agent",
    sectionIds: ["ai-agent"],
  },
]

function normalizeHrefPath(href: string): string {
  const [path] = href.split("?")
  return path || href
}

function isActivePath(pathname: string, href: string): boolean {
  const baseHref = normalizeHrefPath(href)
  return pathname === baseHref || pathname.startsWith(`${baseHref}/`)
}

function sectionsForModule(module: TopModule): MarkerOfekSidebarNavSection[] {
  const allSections = Array.isArray(MARKER_OFEK_SIDEBAR_SECTIONS)
    ? MARKER_OFEK_SIDEBAR_SECTIONS
    : []
  return allSections.filter((section) =>
    module.sectionIds.includes(section.id)
  )
}

function dedupeItems(items: MarkerOfekSidebarNavItem[]): MarkerOfekSidebarNavItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.href)) return false
    seen.add(item.href)
    return true
  })
}

function moduleItems(module: TopModule): MarkerOfekSidebarNavItem[] {
  const grouped = sectionsForModule(module).flatMap((section) => section.items)
  const extras = module.extraItems ?? []
  return dedupeItems([...extras, ...grouped])
}

export function MarkerOfekHeaderNav({ className }: { className?: string }) {
  const router = useRouter()
  const pathname = usePathname() ?? ""
  const modules = Array.isArray(TOP_MODULES) ? TOP_MODULES : []

  return (
    <nav
      dir="rtl"
      aria-label="ניווט מודולים עליון"
      className={cn("flex items-center gap-1.5", className)}
    >
      <Link
        href="/marker-ofek/command-center"
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-800 transition hover:bg-slate-50",
          isActivePath(pathname, "/marker-ofek/command-center") &&
            "border-sky-200 bg-sky-50 text-sky-900"
        )}
      >
        <Home className="size-3.5" aria-hidden />
        בית
      </Link>

      {modules.map((module) => {
        const items = moduleItems(module)
        const sections = sectionsForModule(module)
        const moduleActive = items.some((item) => isActivePath(pathname, item.href))

        return (
          <DropdownMenu key={module.id}>
            <DropdownMenuTrigger
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-md border border-transparent bg-white px-2 text-[11px] font-semibold text-slate-700 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900",
                moduleActive && "border-sky-200 bg-sky-50 text-sky-900"
              )}
            >
              {module.label}
              <ChevronDown className="size-3.5 opacity-70" aria-hidden />
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="center"
              sideOffset={6}
              className="max-h-[65vh] w-72 overflow-y-auto border-slate-200 bg-white p-1 text-slate-800"
            >
              {module.extraItems?.length ? (
                <>
                  <div className="px-2 py-1 text-[10px] font-bold text-slate-500">
                    קיצורי מודול
                  </div>
                  {module.extraItems.map((item) => {
                    const Icon = item.icon
                    const navigateToItem = () => router.push(item.href)
                    return (
                      <DropdownMenuItem
                        key={`extra-${item.href}`}
                        className={cn(
                          "cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium text-slate-800",
                          isActivePath(pathname, item.href) && "bg-sky-50 text-sky-900"
                        )}
                        onClick={navigateToItem}
                        onSelect={(event) => {
                          event.preventDefault()
                          navigateToItem()
                        }}
                      >
                        <Icon className="size-3.5 text-slate-500" aria-hidden />
                        <span className="truncate">{item.title}</span>
                      </DropdownMenuItem>
                    )
                  })}
                  <DropdownMenuSeparator />
                </>
              ) : null}

              {sections.map((section, sectionIndex) => (
                <div key={section.id}>
                  <div className="px-2 py-1 text-[10px] font-bold text-slate-500">
                    {section.label}
                  </div>
                  {section.items.map((item, index) => {
                    const Icon = item.icon
                    const navigateToItem = () => router.push(item.href)
                    return (
                      <DropdownMenuItem
                        key={`${item.title}-${index}`}
                        className={cn(
                          "cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium text-slate-800",
                          isActivePath(pathname, item.href) && "bg-sky-50 text-sky-900"
                        )}
                        onClick={navigateToItem}
                        onSelect={(event) => {
                          event.preventDefault()
                          navigateToItem()
                        }}
                      >
                        <Icon className="size-3.5 text-slate-500" aria-hidden />
                        <span className="truncate">{item.title}</span>
                      </DropdownMenuItem>
                    )
                  })}
                  {sectionIndex < sections.length - 1 ? <DropdownMenuSeparator /> : null}
                </div>
              ))}

              {items.length === 0 ? (
                <DropdownMenuItem disabled className="text-[11px] text-slate-400">
                  אין קישורים זמינים
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      })}
    </nav>
  )
}
