/**
 * נתיבי בסיס ופונקציות עזר — ללא רכיבי UI (בטוח לייבוא מכל מקום).
 * Diamond V1.0: לוגיקת ניווט מחוץ ל־app/ לשימוש חוזר וסוכני AI.
 */
export const MARKER_OFEK_HREFS = {
  procurementAiImport: "/marker-ofek/procurement/ai-import",
  financeCentralized: "/marker-ofek/finance/centralized",
  financeInvoiceNew: "/marker-ofek/finance/invoices/new",
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
  if (pathname === "/management" || pathname.startsWith("/management/")) return true
  if (pathname === "/partner-finance" || pathname.startsWith("/partner-finance/")) return true
  return isMarkerOfekPath(pathname)
}

/**
 * Paths that count as "ניהול מתקנים" for the shell toggle (not Marker Ofek).
 * Keep in sync with `HOLDEN_NAV_SECTIONS` and `FACILITY_ADMIN_NAV_SECTIONS` in `marker-ofek-sidebar-sections.tsx`.
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
  "/holden",
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
  if (pathname === "/holden") return true
  return pathnameMatchesFacilityPrefixes(pathname)
}

function pathPrefixForNavMatch(hrefOrPath: string): string {
  const noHash = hrefOrPath.split("#")[0] ?? hrefOrPath
  const noQuery = noHash.split("?")[0] ?? noHash
  const trimmed = noQuery.replace(/\/+$/, "")
  return trimmed === "" ? "/" : trimmed
}

/** התאמת קישור תפריט צד — תואם ל־AppSidebar (דשבורד, מרכז מודולים, קידומת נתיב). */
export function isSidebarNavItemActive(pathname: string, href: string): boolean {
  const pathNorm = pathPrefixForNavMatch(pathname)
  const hrefNorm = pathPrefixForNavMatch(href)

  if (hrefNorm === "/dashboard") {
    return pathNorm === "/" || pathNorm === "/dashboard"
  }
  if (hrefNorm === "/marker-ofek" || hrefNorm === "/marker-ofek/command-center") {
    return (
      pathNorm === "/marker-ofek/command-center" ||
      pathNorm === "/marker-ofek" ||
      pathNorm === "/marker-ofek/"
    )
  }
  if (hrefNorm === "/") {
    return pathNorm === "/" || pathNorm === "/dashboard"
  }
  return pathNorm === hrefNorm || pathNorm.startsWith(`${hrefNorm}/`)
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
