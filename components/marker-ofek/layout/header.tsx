"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown, Home } from "lucide-react"

import {
  MARKER_OFEK_SIDEBAR_SECTIONS,
  type MarkerOfekSidebarNavItem,
  type MarkerOfekSidebarNavSection,
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

type HeaderPillar = {
  id: "procurement" | "finance" | "projects"
  label: string
  sectionIds: string[]
  fallbackHref: string
}

type ResolvedPillar = {
  id: string
  label: string
  rootHref: string
  sections: MarkerOfekSidebarNavSection[]
}

const BASE_PILLARS: HeaderPillar[] = [
  {
    id: "procurement",
    label: "Procurement",
    sectionIds: ["pre-construction", "tenders-estimation", "procurement-chain"],
    fallbackHref: "/marker-ofek/procurement",
  },
  {
    id: "finance",
    label: "Finance",
    sectionIds: ["contracts-billing", "finance-core"],
    fallbackHref: "/marker-ofek/finance",
  },
  {
    id: "projects",
    label: "Projects",
    sectionIds: ["projects-control"],
    fallbackHref: "/marker-ofek/projects",
  },
]

const BASE_PILLAR_SECTION_IDS = new Set(
  BASE_PILLARS.flatMap((pillar) => pillar.sectionIds)
)

export function MarkerOfekHeaderNav({ className }: { className?: string }) {
  const pathname = usePathname() ?? ""
  const { modules } = useModuleVisibility()
  const [openPillar, setOpenPillar] = React.useState<string | null>(null)
  const [panelTop, setPanelTop] = React.useState(72)
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const navRef = React.useRef<HTMLElement | null>(null)
  const sections = React.useMemo(
    () =>
      MARKER_OFEK_SIDEBAR_SECTIONS.map((section) => ({
        ...section,
        items: dedupeItems(filterNavItemsByModules(section.items, modules)),
      })).filter((section) => section.items.length > 0),
    [modules]
  )

  const pillars = React.useMemo(() => {
    const sectionById = new Map<string, MarkerOfekSidebarNavSection>()
    sections.forEach((section) => sectionById.set(section.id, section))

    const mappedPillars: ResolvedPillar[] = BASE_PILLARS.map((pillar) => {
      const pillarSections = pillar.sectionIds
        .map((id) => sectionById.get(id))
        .filter((section): section is MarkerOfekSidebarNavSection => Boolean(section))
      const rootHref = pillarSections[0]?.items[0]?.href ?? pillar.fallbackHref

      return {
        ...pillar,
        rootHref,
        sections: pillarSections,
      }
    }).filter((pillar) => pillar.sections.length > 0)

    const operationsSections = sections.filter(
      (section) => !BASE_PILLAR_SECTION_IDS.has(section.id)
    )
    if (operationsSections.length > 0) {
      mappedPillars.push({
        id: "operations",
        label: "Operations",
        rootHref:
          operationsSections[0]?.items[0]?.href ??
          "/marker-ofek/command-center",
        sections: operationsSections,
      })
    }

    return mappedPillars
  }, [sections])

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  const scheduleClose = React.useCallback(() => {
    clearCloseTimer()
    closeTimer.current = setTimeout(() => setOpenPillar(null), 90)
  }, [clearCloseTimer])

  const updatePanelTop = React.useCallback(() => {
    const nextTop = navRef.current?.getBoundingClientRect().bottom
    if (!nextTop) return
    setPanelTop(Math.round(nextTop + 8))
  }, [])

  React.useEffect(() => {
    setOpenPillar(null)
  }, [pathname])

  React.useEffect(() => {
    return () => clearCloseTimer()
  }, [clearCloseTimer])

  React.useEffect(() => {
    if (!openPillar) return
    updatePanelTop()
    const onWindowChange = () => updatePanelTop()
    window.addEventListener("resize", onWindowChange)
    window.addEventListener("scroll", onWindowChange, { passive: true })
    return () => {
      window.removeEventListener("resize", onWindowChange)
      window.removeEventListener("scroll", onWindowChange)
    }
  }, [openPillar, updatePanelTop])

  const activePillar = pillars.find((pillar) => pillar.id === openPillar) ?? null

  return (
    <nav
      ref={navRef}
      dir="rtl"
      aria-label="ניווט מודולים עליון"
      className={cn("relative flex flex-wrap items-center justify-center gap-1", className)}
      onMouseEnter={clearCloseTimer}
      onMouseLeave={scheduleClose}
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

      {pillars.map((pillar) => {
        const moduleActive = pillar.sections.some((section) =>
          section.items.some((item) => isActivePath(pathname, item.href))
        )

        return (
          <div
            key={pillar.id}
            className="relative"
            onMouseEnter={() => {
              clearCloseTimer()
              setOpenPillar(pillar.id)
            }}
          >
            <button
              type="button"
              aria-expanded={openPillar === pillar.id}
              aria-controls={`marker-ofek-mega-${pillar.id}`}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-md border border-transparent bg-card px-2 text-[10px] font-semibold text-muted-foreground transition-all duration-200 ease-in-out hover:border-border hover:bg-accent hover:text-accent-foreground hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                (moduleActive || openPillar === pillar.id) &&
                  "border-primary/40 bg-accent text-accent-foreground"
              )}
            >
              {pillar.label}
              <ChevronDown
                className={cn(
                  "size-3.5 opacity-70 transition-transform",
                  openPillar === pillar.id && "rotate-180"
                )}
                aria-hidden
              />
            </button>
          </div>
        )
      })}

      <AnimatePresence mode="wait">
        {activePillar ? (
          <motion.div
            key={activePillar.id}
            style={{ top: panelTop }}
            className="pointer-events-none fixed inset-x-0 z-[90]"
            onMouseEnter={clearCloseTimer}
            onMouseLeave={scheduleClose}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16 }}
          >
            <section
              id={`marker-ofek-mega-${activePillar.id}`}
              className="pointer-events-auto w-screen border-y border-border bg-popover/95 shadow-2xl backdrop-blur-md"
            >
              <div className="mx-auto w-full max-w-[min(100vw,120rem)] px-8 py-10 text-popover-foreground 2xl:px-10">
                <div className="mb-6 flex items-center justify-between border-b border-border pb-3">
                  <p className="text-sm font-semibold tracking-wide text-muted-foreground">
                    {activePillar.label}
                  </p>
                  <Link
                    href={activePillar.rootHref}
                    onClick={() => setOpenPillar(null)}
                    className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
                  >
                    מעבר למודול
                  </Link>
                </div>

                <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-4">
                  {activePillar.sections.map((section) => (
                    <section
                      key={section.id}
                      className="rounded-xl border border-border/70 bg-card/40 p-5"
                    >
                      <p className="mb-4 border-b border-border/80 pb-2 text-sm font-semibold tracking-wide text-muted-foreground">
                        {section.label}
                      </p>
                      <div className="space-y-2">
                        {section.items.map((item, index) => {
                          const Icon = item.icon
                          const active = isActivePath(pathname, item.href)
                          return (
                            <Link
                              key={`${section.id}-${item.title}-${index}`}
                              href={item.href}
                              onClick={() => setOpenPillar(null)}
                              className={cn(
                                "flex items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-all duration-200",
                                "hover:border-border hover:bg-accent hover:text-accent-foreground hover:shadow-sm",
                                active && "border-border bg-accent text-accent-foreground"
                              )}
                            >
                              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                <Icon className="size-4" aria-hidden />
                              </span>
                              <span className="flex-1 text-start">
                                <span className="block whitespace-normal break-words text-sm font-semibold text-foreground">
                                  {item.title}
                                </span>
                                <span className="mt-0.5 block whitespace-normal break-all text-[11px] text-muted-foreground">
                                  {item.href}
                                </span>
                              </span>
                            </Link>
                          )
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </nav>
  )
}
