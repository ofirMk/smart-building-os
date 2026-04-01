"use client"

/**
 * תפריט צד — הגדרות עם אייקונים (חייב מודול Client).
 * נתיבים טהורים: `./sidebar-routes`
 */
import type { LucideIcon } from "lucide-react"
import {
  BarChart,
  Bot,
  Briefcase,
  Building2,
  Calculator,
  CalendarDays,
  ClipboardList,
  FileSignature,
  FileText,
  LayoutGrid,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  ShieldCheck,
  PackageSearch,
  ReceiptText,
  ShoppingCart,
  Settings,
  Ticket,
  Truck,
  Users,
  Wrench,
  Zap,
} from "lucide-react"

import { FACILITY_HOME_PATH } from "@/app/(dashboard)/_components/sidebar-routes"
import { getMarkerOfekFlatNavHrefs } from "@/lib/marker-ofek/pillar-registry"

export { FACILITY_HOME_PATH, MARKER_OFEK_HREFS } from "@/app/(dashboard)/_components/sidebar-routes"
export {
  isFacilityManagementContext,
  isMarkerOfekExecutiveContext,
  isMarkerOfekPath,
} from "@/app/(dashboard)/_components/sidebar-routes"

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

/** ניווט מרקר אופק — ליבת פעילות קבלנית */
export const MARKER_OFEK_CONTRACTING_NAV_SECTIONS: SidebarNavSection[] = [
  {
    label: "ראשי",
    items: [
      { title: "מרכז מודולים", href: "/marker-ofek", icon: LayoutDashboard },
    ],
  },
  {
    label: "קדם ביצוע",
    items: [
      {
        title: "מכרזים נכנסים",
        href: "/marker-ofek/pre-construction/tender-intake",
        icon: FileText,
      },
      {
        title: "תמחור מכרזים",
        href: "/marker-ofek/pre-construction/tender-pricing",
        icon: Calculator,
      },
    ],
  },
  {
    label: "פרויקטים וביצוע",
    items: [
      {
        title: "מרכז פרויקטים",
        href: "/marker-ofek/projects",
        icon: Briefcase,
      },
      {
        title: "חוזי לקוחות",
        href: "/marker-ofek/contracts",
        icon: FileSignature,
      },
      {
        title: "חשבונות חלקיים",
        href: "/marker-ofek/execution/progress-reports",
        icon: BarChart,
      },
      {
        title: "יומני עבודה",
        href: "/marker-ofek/execution/daily-logs",
        icon: ClipboardList,
      },
    ],
  },
  {
    label: "שרשרת אספקה ורכש",
    items: [
      {
        title: "ניהול ספקים",
        href: "/marker-ofek/supply-chain/suppliers",
        icon: Briefcase,
      },
      {
        title: "גיליון פריטים",
        href: "/marker-ofek/items",
        icon: PackageSearch,
      },
      {
        title: "הזמנות רכש",
        href: "/marker-ofek/procurement/purchase-orders/new",
        icon: ShoppingCart,
      },
      {
        title: "תעודות משלוח",
        href: "/marker-ofek/procurement/delivery-notes/new",
        icon: Truck,
      },
      {
        title: "חשבוניות ספק בבינה מלאכותית",
        href: "/marker-ofek/procurement/invoices/new",
        icon: Bot,
      },
      {
        title: "בקרת התאמות חודשית",
        href: "/marker-ofek/procurement/reconciliation",
        icon: ShieldCheck,
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
