"use client"

/**
 * תפריט צד — הגדרות עם אייקונים (חייב מודול Client).
 * נתיבים טהורים: `./sidebar-routes`
 * סדר זהב (כרונולוגיית בנייה): ראשי → רכש → מכרזים → פרויקטים → חוזה וחשבונות → כספים.
 * אקורדיון קטגוריות (מרקר אופק): `AppSidebar` ב־`components/app-sidebar.tsx`.
 */
import type { LucideIcon } from "lucide-react"
import {
  Archive,
  BarChart,
  BarChart3,
  Bot,
  Briefcase,
  Building2,
  Calculator,
  CalendarDays,
  Car,
  ClipboardList,
  FileSearch,
  FileScan,
  FileSignature,
  FileText,
  GitBranch,
  GitCompare,
  Landmark,
  LayoutGrid,
  LayoutDashboard,
  Layers,
  Megaphone,
  MessageSquare,
  LayoutList,
  PackageSearch,
  Percent,
  Receipt,
  ReceiptText,
  Scale,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Table2,
  Ticket,
  Truck,
  Users,
  Wallet,
  Warehouse,
  Wrench,
  Zap,
} from "lucide-react"

import {
  FACILITY_HOME_PATH,
  MARKER_OFEK_HREFS,
} from "@/app/(dashboard)/_components/sidebar-routes"
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

/** ניווט מרקר אופק — סדר זהב: רכש → מכרזים → פרויקטים → חוזה וחשבונות → כספים; מערכת (מרכז/הנהלה) בסוף */
export const MARKER_OFEK_CONTRACTING_NAV_SECTIONS: SidebarNavSection[] = [
  {
    label: "רכש",
    items: [
      {
        title: "גיליון פריטים",
        href: "/marker-ofek/items",
        icon: PackageSearch,
      },
      {
        title: "קטלוג פריטים",
        href: "/marker-ofek/procurement/catalog",
        icon: LayoutGrid,
      },
      {
        title: "הזמנות",
        href: "/marker-ofek/procurement/orders",
        icon: ClipboardList,
      },
      {
        title: "הזמנות רכש",
        href: "/marker-ofek/procurement/purchase-orders/new",
        icon: ShoppingCart,
      },
      {
        title: "ספקים",
        href: "/marker-ofek/procurement/suppliers",
        icon: Building2,
      },
      {
        title: "ניהול ספקים",
        href: "/marker-ofek/supply-chain/suppliers",
        icon: Briefcase,
      },
      {
        title: "ניהול מלאי",
        href: "/marker-ofek/procurement/inventory",
        icon: Warehouse,
      },
      {
        title: "נכסי חברה",
        href: "/marker-ofek/procurement/assets",
        icon: Car,
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
      {
        title: "קליטת חשבונית (מסמכים)",
        href: MARKER_OFEK_HREFS.procurementAiImport,
        icon: FileScan,
      },
      {
        title: "גילון ספקים",
        href: "/marker-ofek/procurement/aging",
        icon: Scale,
      },
    ],
  },
  {
    label: "מכרזים",
    items: [
      {
        title: "מכרזים נכנסים",
        href: "/marker-ofek/pre-construction/tender-intake",
        icon: FileText,
      },
      {
        title: "תמחור מכרזים",
        href: "/marker-ofek/pre-construction/tender-pricing",
        icon: Table2,
      },
      {
        title: "מרכז",
        href: "/marker-ofek/tenders",
        icon: LayoutDashboard,
      },
      {
        title: "תמחור פרויקטים",
        href: "/marker-ofek/tenders/pricing",
        icon: Calculator,
      },
      {
        title: "כתבי כמויות",
        href: "/marker-ofek/tenders/boq",
        icon: FileSearch,
      },
      {
        title: "השוואת הצעות",
        href: "/marker-ofek/tenders/comparison",
        icon: GitCompare,
      },
      {
        title: "מבנה WBS",
        href: "/marker-ofek/tenders/wbs",
        icon: Layers,
      },
    ],
  },
  {
    label: "פרויקטים",
    items: [
      {
        title: "מרכז פרויקטים",
        href: "/marker-ofek/projects",
        icon: Briefcase,
      },
      {
        title: "לו\"ז וביצוע (גאנט)",
        href: "/marker-ofek/execution/gantt",
        icon: LayoutList,
      },
      {
        title: "יומני עבודה",
        href: "/marker-ofek/execution/daily-logs",
        icon: ClipboardList,
      },
      {
        title: "תוכניות ו-Takeoff",
        href: "/marker-ofek/execution/plans",
        icon: FileScan,
      },
      {
        title: "משאבים ולוח שנה",
        href: "/marker-ofek/execution/resources",
        icon: Users,
      },
    ],
  },
  {
    label: "חוזה וחשבונות",
    items: [
      {
        title: "מרכז חוזה וחשבונות",
        href: "/marker-ofek/finance/contracts-billing",
        icon: LayoutDashboard,
      },
      {
        title: "חוזי מזמין וספקי ביצוע",
        href: "/marker-ofek/contracts",
        icon: FileSignature,
      },
      {
        title: "כספת מסמכי חוזה",
        href: "/marker-ofek/finance/contract-vault",
        icon: Archive,
      },
      {
        title: "הצמדות ומדדים",
        href: "/marker-ofek/finance/indexation",
        icon: Percent,
      },
      {
        title: "עכבון וערבויות",
        href: "/marker-ofek/finance/retention",
        icon: Shield,
      },
      {
        title: "חריגים ותוספות",
        href: "/marker-ofek/finance/variations",
        icon: GitBranch,
      },
      {
        title: "חשבונות חלקיים",
        href: "/marker-ofek/finance/partials",
        icon: BarChart,
      },
    ],
  },
  {
    label: "כספים",
    items: [
      {
        title: "מרכז חיוב ותזרים",
        href: "/marker-ofek/finance/billing",
        icon: Landmark,
      },
      { title: "חשבוניות מס", href: "/marker-ofek/finance", icon: Receipt },
      {
        title: "רווח והפסד",
        href: "/marker-ofek/finance/pnl",
        icon: BarChart3,
      },
      {
        title: "עקיפות והעמסה",
        href: "/marker-ofek/finance/overhead",
        icon: Percent,
      },
      {
        title: "דוח מע״מ",
        href: "/marker-ofek/finance/vat-report",
        icon: Scale,
      },
      {
        title: "חשבונית מרכזת",
        href: MARKER_OFEK_HREFS.financeCentralized,
        icon: Wallet,
      },
    ],
  },
  {
    label: "מערכת",
    items: [
      {
        title: "מרכז מודולים",
        href: "/marker-ofek/command-center",
        icon: LayoutDashboard,
      },
      {
        title: "דשבורד הנהלה",
        href: "/management",
        icon: BarChart3,
      },
      {
        title: "ניהול מודולים",
        href: "/marker-ofek/settings/modules",
        icon: SlidersHorizontal,
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
