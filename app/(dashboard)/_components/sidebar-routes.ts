/**
 * נתיבי בסיס ופונקציות עזר — ללא רכיבי UI (בטוח לייבוא מכל מקום).
 */
export const MARKER_OFEK_HREFS = {
  procurementAiImport: "/marker-ofek/procurement/ai-import",
  financeCentralized: "/marker-ofek/finance/centralized",
} as const

export const FACILITY_HOME_PATH = "/facility" as const

export function isMarkerOfekPath(pathname: string | null): boolean {
  if (pathname == null || pathname === "") return false
  return pathname === "/marker-ofek" || pathname.startsWith("/marker-ofek/")
}

/** מרקר אופק: דשבורד ראשי /dashboard + כל תת-הנתיבים של /marker-ofek */
export function isMarkerOfekExecutiveContext(pathname: string | null): boolean {
  if (pathname == null || pathname === "") return false
  if (pathname === "/" || pathname === "/dashboard") return true
  if (pathname === "/partner-finance" || pathname.startsWith("/partner-finance/")) return true
  return isMarkerOfekPath(pathname)
}

/**
 * Paths that count as "ניהול מתקנים" for the shell toggle (not Marker Ofek).
 * Keep in sync with `HOLDEN_NAV_SECTIONS` and `FACILITY_ADMIN_NAV_SECTIONS` in `sidebar.tsx`.
 */
const FACILITY_CONTEXT_PATH_PREFIXES: readonly string[] = [
  FACILITY_HOME_PATH,
  "/buildings",
  "/tickets",
  "/maintenance",
  "/chat",
  "/announcements",
  "/amenities",
  "/tenants",
  "/settings",
  "/portal",
  "/dashboard/holden",
  "/billing",
  "/documents",
  "/vendors",
  "/ev-management",
]

function pathnameMatchesFacilityPrefixes(pathname: string): boolean {
  return FACILITY_CONTEXT_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )
}

export function isFacilityManagementContext(pathname: string | null): boolean {
  if (pathname == null || pathname === "") return false
  if (isMarkerOfekExecutiveContext(pathname)) return false
  if (pathname === "/dashboard/holden") return true
  return pathnameMatchesFacilityPrefixes(pathname)
}

/** התאמת קישור תפריט צד — תואם ל־AppSidebar (דשבורד, מרכז מודולים, קידומת נתיב). */
export function isSidebarNavItemActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/" || pathname === "/dashboard"
  }
  if (href === "/marker-ofek" || href === "/marker-ofek/command-center") {
    return (
      pathname === "/marker-ofek/command-center" ||
      pathname === "/marker-ofek" ||
      pathname === "/marker-ofek/"
    )
  }
  if (href === "/") {
    return pathname === "/" || pathname === "/dashboard"
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** אינדקס קבוצת הניווט הראשונה שמכילה את הנתיב הנוכחי (או 0). */
export function indexOfSidebarSectionForPathname<
  T extends { items: readonly { href: string }[] },
>(pathname: string, sections: readonly T[]): number {
  const idx = sections.findIndex((s) =>
    s.items.some((it) => isSidebarNavItemActive(pathname, it.href))
  )
  return idx >= 0 ? idx : 0
}
