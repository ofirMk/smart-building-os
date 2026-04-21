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
      className={cn("flex flex-wrap items-center gap-1", className)}
    >
      <Link
        href="/marker-ofek/command-center"
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-[10px] font-semibold text-foreground transition-all duration-200 ease-in-out hover:bg-accent hover:text-accent-foreground hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isActivePath(pathname, "/marker-ofek/command-center") &&
            "border-primary/40 bg-accent text-accent-foreground"
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
                "inline-flex h-7 items-center gap-1 rounded-md border border-transparent bg-card px-2 text-[10px] font-semibold text-muted-foreground transition-all duration-200 ease-in-out hover:border-border hover:bg-accent hover:text-accent-foreground hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                moduleActive && "border-primary/40 bg-accent text-accent-foreground"
              )}
            >
              {section.label}
              <ChevronDown className="size-3.5 opacity-70" aria-hidden />
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="center"
              sideOffset={6}
              className="max-h-[65vh] w-72 overflow-y-auto border-border bg-popover p-1 text-popover-foreground"
            >
              {section.items.map((item, index) => {
                const Icon = item.icon
                const navigateToItem = () => router.push(item.href)
                return (
                  <DropdownMenuItem
                    key={`${section.id}-${item.title}-${index}`}
                    className={cn(
                      "cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium text-foreground transition-all duration-200 ease-in-out hover:bg-accent hover:text-accent-foreground hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      isActivePath(pathname, item.href) && "bg-accent text-accent-foreground"
                    )}
                    onClick={navigateToItem}
                    onSelect={(event) => {
                      event.preventDefault()
                      navigateToItem()
                    }}
                  >
                    <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                    <span className="truncate">{item.title}</span>
                  </DropdownMenuItem>
                )
              })}

              {section.items.length === 0 ? (
                <DropdownMenuItem disabled className="text-[11px] text-muted-foreground">
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
