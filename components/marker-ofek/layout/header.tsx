"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ChevronDown, Home } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  MARKER_OFEK_SIDEBAR_SECTIONS,
  type MarkerOfekSidebarNavItem,
} from "@/lib/marker-ofek/marker-ofek-sidebar-nav-config"
import { filterNavItemsByModules } from "@/lib/marker-ofek/module-registry"
import { cn } from "@/lib/utils"
import { useModuleVisibility } from "@/components/marker-ofek/marker-ofek-dashboard-context"

function normalizeHrefPath(href: string): string {
  const [path] = href.split("?")
  return path || href
}

function isActivePath(pathname: string, href: string): boolean {
  const baseHref = normalizeHrefPath(href)
  return pathname === baseHref || pathname.startsWith(`${baseHref}/`)
}

function dedupeItems(items: MarkerOfekSidebarNavItem[]): MarkerOfekSidebarNavItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.href)) return false
    seen.add(item.href)
    return true
  })
}

export function MarkerOfekHeaderNav({ className }: { className?: string }) {
  const router = useRouter()
  const pathname = usePathname() ?? ""
  const { modules } = useModuleVisibility()
  const sections = MARKER_OFEK_SIDEBAR_SECTIONS.map((section) => ({
    ...section,
    items: dedupeItems(filterNavItemsByModules(section.items, modules)),
  })).filter((section) => section.items.length > 0)

  return (
    <nav
      dir="rtl"
      aria-label="ניווט מודולים עליון"
      className={cn("flex items-center gap-1.5", className)}
    >
      <Link
        href="/marker-ofek/command-center"
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-card px-2 text-[11px] font-semibold text-slate-800 transition hover:bg-background",
          isActivePath(pathname, "/marker-ofek/command-center") &&
            "border-sky-200 bg-sky-50 text-sky-900"
        )}
      >
        <Home className="size-3.5" aria-hidden />
        בית
      </Link>

      {sections.map((section) => {
        const moduleActive = section.items.some((item) =>
          isActivePath(pathname, item.href)
        )

        return (
          <DropdownMenu key={section.id}>
            <DropdownMenuTrigger
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-md border border-transparent bg-card px-2 text-[11px] font-semibold text-slate-700 transition hover:border-slate-200 hover:bg-background hover:text-foreground",
                moduleActive && "border-sky-200 bg-sky-50 text-sky-900"
              )}
            >
              {section.label}
              <ChevronDown className="size-3.5 opacity-70" aria-hidden />
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="center"
              sideOffset={6}
              className="max-h-[65vh] w-72 overflow-y-auto border-slate-200 bg-card p-1 text-slate-800"
            >
              {section.items.map((item, index) => {
                const Icon = item.icon
                const navigateToItem = () => router.push(item.href)
                return (
                  <DropdownMenuItem
                    key={`${section.id}-${item.title}-${index}`}
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

              {section.items.length === 0 ? (
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
