import { pathnameToModule, type SidebarNavItemShape } from "@/lib/marker-ofek/module-registry"

/**
 * When Guy/Samer have zero managed projects, hide ERP links that assume an assigned portfolio.
 * Settings (e.g. module switchboard) stay reachable via paths not listed here.
 */
export function navItemHiddenWhenNoManagedProjects(href: string): boolean {
  const m = pathnameToModule(href)
  if (m != null) return true
  const h = (href.split("?")[0] ?? "").replace(/\/+$/, "") || "/"
  if (h.startsWith("/marker-ofek/projects")) return true
  if (h.startsWith("/marker-ofek/contracts")) return true
  if (h.startsWith("/marker-ofek/partner-finance")) return true
  if (h.startsWith("/partner-finance")) return true
  if (h.startsWith("/marker-ofek/executive")) return true
  if (h.startsWith("/management")) return true
  if (h.startsWith("/partner-metrics")) return true
  return false
}

export function filterSidebarWhenNoManagedProjects<
  S extends { items: SidebarNavItemShape[]; label: string | null },
>(
  sections: S[],
  scopedProjectCount: number | null,
  applyEmptyPortfolioNav: boolean
): S[] {
  if (!applyEmptyPortfolioNav) return sections
  if (scopedProjectCount === null || scopedProjectCount > 0) return sections
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !navItemHiddenWhenNoManagedProjects(item.href)),
    }))
    .filter((s) => s.items.length > 0)
}
