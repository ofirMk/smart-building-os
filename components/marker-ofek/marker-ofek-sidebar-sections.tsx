"use client"

/**
 * תפריט צד — הגדרות עם אייקונים (חייב מודול Client).
 * נתיבים טהורים: `lib/infrastructure/navigation/sidebar-routes`
 * סדר זהב (כרונולוגיית בנייה): ראשי → רכש → מכרזים → פרויקטים → חוזה וחשבונות → הנהלת חשבונות → כספים.
 * אקורדיון קטגוריות (מרקר אופק): `AppSidebar` ב־`components/app-sidebar.tsx`.
 */
import type { LucideIcon } from "lucide-react"
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Building2,
  CalendarDays,
  CreditCard,
  FileEdit,
  LayoutGrid,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Receipt,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Table2,
  Ticket,
  Users,
  Wrench,
  Zap,
} from "lucide-react"

import { FACILITY_HOME_PATH } from "@/lib/infrastructure/navigation/sidebar-routes"
import { getMarkerOfekFlatNavHrefs } from "@/lib/marker-ofek/pillar-registry"

export { FACILITY_HOME_PATH, MARKER_OFEK_HREFS } from "@/lib/infrastructure/navigation/sidebar-routes"
export {
  isFacilityManagementContext,
  isMarkerOfekExecutiveContext,
  isMarkerOfekPath,
} from "@/lib/infrastructure/navigation/sidebar-routes"

export type SidebarNavItem = {
  title: string
  href: string
  icon: LucideIcon
}

export type SidebarNavSection = {
  label: string | null
  items: SidebarNavItem[]
}

/** Stable, de-duplicated href list from nav sections (non-empty strings only). */
function uniqueNavHrefsFromSections(
  sections: readonly SidebarNavSection[]
): readonly string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of sections) {
    for (const { href } of s.items) {
      const h = typeof href === "string" ? href.trim() : ""
      if (!h || seen.has(h)) continue
      seen.add(h)
      out.push(h)
    }
  }
  return Object.freeze([...out])
}

/** נתיבי ERP — נגזרים מ־pillar-registry (אקורדיון מרקר אופק) */
export const MARKER_OFEK_ROUTES: readonly string[] = getMarkerOfekFlatNavHrefs()

/** ניווט מרקר אופק — ארבעה עמודים (מסונכרן עם marker-ofek-sidebar-nav-config) */
export const MARKER_OFEK_CONTRACTING_NAV_SECTIONS: SidebarNavSection[] = [
  {
    label: "ניהול רכש",
    items: [
      {
        title: "מרכז רכש אחוד",
        href: "/marker-ofek/procurement",
        icon: ShoppingCart,
      },
    ],
  },
  {
    label: "ניהול כספים",
    items: [
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
  },
  {
    label: "ניהול נתונים",
    items: [
      {
        title: "מרכז נתוני מאסטר",
        href: "/marker-ofek/master-data",
        icon: Table2,
      },
    ],
  },
  {
    label: "מערכת",
    items: [
      {
        title: "בריאות המערכת",
        href: "/marker-ofek/system/health",
        icon: Activity,
      },
    ],
  },
]

/** ניווט הולדן — ניהול נכסים (לא כולל מרקר אופק). */
export const HOLDEN_NAV_SECTIONS: SidebarNavSection[] = [
  {
    label: "הולדן - ניהול מבנים",
    items: [
      {
        title: "מרכז פיקוד הולדן",
        href: "/dashboard/holden",
        icon: Building2,
      },
      { title: "ניהול אנרגיה וטעינה", href: "/ev-management", icon: Zap },
      { title: "קריאות שירות", href: "/tickets", icon: ReceiptText },
    ],
  },
]

/** תפריט מתקנים מורחב (גיבוי / הרחבות עתידיות) */
export const FACILITY_MANAGEMENT_NAV_SECTIONS: SidebarNavSection[] = [
  {
    label: "ניהול מתקנים",
    items: [
      {
        title: "לוח בקרה",
        href: FACILITY_HOME_PATH,
        icon: LayoutDashboard,
      },
      { title: "בניינים", href: "/buildings", icon: Building2 },
      { title: "קריאות שירות", href: "/tickets", icon: Ticket },
      { title: "תחזוקה מונעת", href: "/maintenance", icon: Wrench },
    ],
  },
  {
    label: "דיירים ושירות",
    items: [
      { title: "צ'אט בינה מלאכותית", href: "/chat", icon: MessageSquare },
      { title: "דוחות ונתונים", href: "/announcements", icon: Megaphone },
      { title: "מתקנים", href: "/amenities", icon: CalendarDays },
    ],
  },
]

export const FACILITY_ADMIN_NAV_SECTIONS: SidebarNavSection[] = [
  {
    label: "ניהול",
    items: [
      { title: "ניהול דיירים", href: "/tenants", icon: Users },
      { title: "הגדרות פרויקט", href: "/settings", icon: Settings },
      { title: "חזרה לפורטל הולדן", href: "/portal", icon: LayoutGrid },
    ],
  },
]

export const HOLDEN_NAV_ROUTES: readonly string[] =
  uniqueNavHrefsFromSections(HOLDEN_NAV_SECTIONS)

export const FACILITY_MANAGEMENT_ROUTES: readonly string[] =
  uniqueNavHrefsFromSections(FACILITY_MANAGEMENT_NAV_SECTIONS)

export const FACILITY_ADMIN_ROUTES: readonly string[] =
  uniqueNavHrefsFromSections(FACILITY_ADMIN_NAV_SECTIONS)

export const MARKER_OFEK_ERP_HREFS = new Set(MARKER_OFEK_ROUTES)
