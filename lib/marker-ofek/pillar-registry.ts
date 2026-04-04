import type { LucideIcon } from "lucide-react"
import {
  Archive,
  BarChart,
  Database,
  FileScan,
  FileSignature,
  FileSearch,
  FolderKanban,
  Gavel,
  Gauge,
  GitBranch,
  GitCompare,
  Briefcase,
  KeyRound,
  Landmark,
  Map,
  Percent,
  Car,
  Calculator,
  Receipt,
  Scale,
  ScrollText,
  Shield,
  ShoppingCart,
  Settings,
  Table2,
  Tags,
  Truck,
  Users,
  Wallet,
  Warehouse,
  Building2,
  ClipboardList,
  LayoutGrid,
  LayoutDashboard,
  LayoutList,
  Layers,
} from "lucide-react"

import { MARKER_OFEK_HREFS } from "@/app/(dashboard)/_components/sidebar-routes"
import { MARKER_OFEK_SIDEBAR_SECTIONS } from "@/lib/marker-ofek/marker-ofek-sidebar-nav-config"

export type MarkerOfekPillarNavItem = {
  title: string
  href: string
  icon: LucideIcon
}

export type MarkerOfekPillar = {
  /** מזהה פנימי */
  id: string
  /** כותרת בסרגל (ללא מספור) */
  navTitle: string
  /** כותרת קצרה בכרטיס Hub */
  cardTitle: string
  /** משפט אחד */
  tagline: string
  href: string
  icon: LucideIcon
  /** פתיחת אקורדיון כברירת מחדל */
  defaultOpen: boolean
  /** קישורים בסרגל ובדף הנחיתה */
  navItems: MarkerOfekPillarNavItem[]
  /** עד 3 פעולות נפוצות על גבי הכרטיס ב-Hub */
  quickActions: Array<{ title: string; href: string }>
}

/**
 * עמודי ליבה של מרקר אופק — מקור אמת ל-Hub, סרגל צד ודפי נחיתה.
 * סדר זהב ב-Hub: `erp-module-hub` → procurement, tenders, field-execution, contracts-billing, finance.
 */
export const MARKER_OFEK_PILLARS: MarkerOfekPillar[] = [
  {
    id: "master-data",
    navTitle: "תשתיות נתונים",
    cardTitle: "תשתיות נתונים",
    tagline: "קטלוג, הגדרות ארגון ומפת הדרכים של המערכת.",
    href: "/marker-ofek/master-data",
    icon: Database,
    defaultOpen: true,
    navItems: [
      { title: "קטלוג פריטים", href: "/marker-ofek/items", icon: Tags },
      { title: "הגדרות חברה", href: "/marker-ofek/settings", icon: Settings },
      { title: "מפת המערכת", href: "/marker-ofek/system-map", icon: Map },
    ],
    quickActions: [
      { title: "קטלוג פריטים", href: "/marker-ofek/items" },
      { title: "הגדרות חברה", href: "/marker-ofek/settings" },
      { title: "מפת מערכת", href: "/marker-ofek/system-map" },
    ],
  },
  {
    id: "pre-construction",
    navTitle: "קדם ביצוע",
    cardTitle: "קדם ביצוע",
    tagline: "מכרזים נכנסים ותמחור — לפני חוזים וביצוע.",
    href: "/marker-ofek/pre-construction",
    icon: Gavel,
    defaultOpen: false,
    navItems: [
      {
        title: "קליטת חומרי מכרז (בינה מלאכותית)",
        href: "/marker-ofek/pre-construction/tender-intake",
        icon: FileScan,
      },
      {
        title: "כתב כמויות ותמחור",
        href: "/marker-ofek/pre-construction/tender-pricing",
        icon: Table2,
      },
    ],
    quickActions: [
      {
        title: "קליטת חומרי מכרז",
        href: "/marker-ofek/pre-construction/tender-intake",
      },
      {
        title: "כתב כמויות ותמחור",
        href: "/marker-ofek/pre-construction/tender-pricing",
      },
    ],
  },
  {
    id: "tenders",
    navTitle: "מכרזים והערכות",
    cardTitle: "מכרזים",
    tagline:
      "תמחור, כתבי כמויות, השוואת הצעות ומבנה WBS — עד לזכייה והמרה לחוזה.",
    href: "/marker-ofek/tenders",
    icon: FileSearch,
    defaultOpen: true,
    navItems: [
      {
        title: "מרכז מכרזים",
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
      { title: "מבנה WBS", href: "/marker-ofek/tenders/wbs", icon: Layers },
    ],
    quickActions: [
      { title: "מרכז מכרזים", href: "/marker-ofek/tenders" },
      { title: "כתבי כמויות", href: "/marker-ofek/tenders/boq" },
      { title: "השוואת הצעות", href: "/marker-ofek/tenders/comparison" },
    ],
  },
  {
    id: "procurement",
    navTitle: "רכש",
    cardTitle: "רכש",
    tagline: "הזמנות, ספקים, קטלוג פריטים ונכסי חברה — קליטת סחורה וחשבוניות.",
    href: "/marker-ofek/procurement/orders",
    icon: Truck,
    defaultOpen: true,
    navItems: [
      { title: "גיליון פריטים", href: "/marker-ofek/items", icon: Tags },
      {
        title: "קטלוג פריטים",
        href: "/marker-ofek/procurement/catalog",
        icon: LayoutGrid,
      },
      { title: "הזמנות", href: "/marker-ofek/procurement/orders", icon: ClipboardList },
      {
        title: "הזמנות רכש",
        href: "/marker-ofek/procurement/purchase-orders/new",
        icon: ShoppingCart,
      },
      { title: "ספקים", href: "/marker-ofek/procurement/suppliers", icon: Building2 },
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
        title: "חשבוניות ספק",
        href: "/marker-ofek/procurement/invoices/new",
        icon: Receipt,
      },
      {
        title: "בקרת התאמות חודשית",
        href: "/marker-ofek/procurement/reconciliation",
        icon: Scale,
      },
      {
        title: "קליטת חשבונית (מסמכים)",
        href: MARKER_OFEK_HREFS.procurementAiImport,
        icon: FileScan,
      },
      { title: "גילון ספקים", href: "/marker-ofek/procurement/aging", icon: Scale },
    ],
    quickActions: [
      { title: "גיליון פריטים", href: "/marker-ofek/items" },
      { title: "קטלוג פריטים", href: "/marker-ofek/procurement/catalog" },
      { title: "הזמנות", href: "/marker-ofek/procurement/orders" },
    ],
  },
  {
    id: "field-execution",
    navTitle: "פרויקטים",
    cardTitle: "פרויקטים",
    tagline: "ניהול אתרים, גאנט ביצוע, יומני עבודה וסנכרון שטח.",
    href: "/marker-ofek/projects",
    icon: Briefcase,
    defaultOpen: true,
    navItems: [
      {
        title: "מרכז פרויקטים",
        href: "/marker-ofek/projects",
        icon: FolderKanban,
      },
      {
        title: "לו\"ז וביצוע (גאנט)",
        href: "/marker-ofek/execution/gantt",
        icon: LayoutList,
      },
      {
        title: "יומני עבודה",
        href: "/marker-ofek/execution/daily-logs",
        icon: ScrollText,
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
    quickActions: [
      { title: "מרכז פרויקטים", href: "/marker-ofek/projects" },
      { title: "גאנט", href: "/marker-ofek/execution/gantt" },
      { title: "יומן עבודה", href: "/marker-ofek/execution/daily-logs" },
    ],
  },
  {
    id: "contracts-billing",
    navTitle: "חוזה וחשבונות",
    cardTitle: "חוזה וחשבונות",
    tagline:
      "חוזים, כספת מסמכים, מדדים, עכבון וחריגים — ואז חשבונות חלקיים; כספים (חשבוניות מס) במודול נפרד.",
    href: "/marker-ofek/finance/contracts-billing",
    icon: Landmark,
    defaultOpen: true,
    navItems: [
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
    quickActions: [
      { title: "מרכז חוזה וחשבונות", href: "/marker-ofek/finance/contracts-billing" },
      { title: "חוזי מזמין וספקי ביצוע", href: "/marker-ofek/contracts" },
      { title: "חשבונות חלקיים", href: "/marker-ofek/finance/partials" },
    ],
  },
  {
    id: "finance",
    navTitle: "כספים",
    cardTitle: "כספים",
    tagline: "חשבוניות מס, מרכז חיוב ותזרים וחשבונית מרכזת — אחרי חוזים וביצוע.",
    href: "/marker-ofek/finance/billing",
    icon: Wallet,
    defaultOpen: true,
    navItems: [
      {
        title: "מרכז חיוב ותזרים",
        href: "/marker-ofek/finance/billing",
        icon: Landmark,
      },
      { title: "חשבוניות מס", href: "/marker-ofek/finance", icon: Receipt },
      {
        title: "חשבונית מרכזת",
        href: MARKER_OFEK_HREFS.financeCentralized,
        icon: Wallet,
      },
    ],
    quickActions: [
      { title: "מרכז חיוב ותזרים", href: "/marker-ofek/finance/billing" },
      { title: "חשבוניות מס", href: "/marker-ofek/finance" },
      { title: "חשבונית מרכזת", href: MARKER_OFEK_HREFS.financeCentralized },
    ],
  },
  {
    id: "financial-control",
    navTitle: "בקרה תקציבית",
    cardTitle: "בקרה תקציבית",
    tagline: "מגבלות, מעקב עומסים ותמונה כספית מול תכנון.",
    href: "/marker-ofek/financial-control",
    icon: Gauge,
    defaultOpen: false,
    navItems: [
      { title: "בקרה תקציבית", href: "/marker-ofek/budget", icon: Gauge },
    ],
    quickActions: [{ title: "בקרה תקציבית", href: "/marker-ofek/budget" }],
  },
  {
    id: "handover",
    navTitle: "הספקה והעברה",
    cardTitle: "הספקה והעברה",
    tagline: "סגירת פרויקט, מסירה ללקוח ותיעוד העברה.",
    href: "/marker-ofek/handover",
    icon: KeyRound,
    defaultOpen: false,
    navItems: [
      {
        title: "פרויקטים",
        href: "/marker-ofek/projects",
        icon: FolderKanban,
      },
    ],
    quickActions: [{ title: "פרויקטים", href: "/marker-ofek/projects" }],
  },
]

export function getPillarByHref(href: string): MarkerOfekPillar | undefined {
  return MARKER_OFEK_PILLARS.find((p) => p.href === href)
}

export function getPillarById(id: string): MarkerOfekPillar | undefined {
  return MARKER_OFEK_PILLARS.find((p) => p.id === id)
}

/** כל נתיבי הניווט לרישום בסרגל (ייחודיים), כולל שורש מרקר אופק */
export function getMarkerOfekFlatNavHrefs(): readonly string[] {
  const seen = new Set<string>(["/marker-ofek/command-center", "/marker-ofek"])
  const out: string[] = ["/marker-ofek/command-center", "/marker-ofek"]
  for (const s of MARKER_OFEK_SIDEBAR_SECTIONS) {
    for (const it of s.items) {
      if (!seen.has(it.href)) {
        seen.add(it.href)
        out.push(it.href)
      }
    }
  }
  for (const p of MARKER_OFEK_PILLARS) {
    for (const it of p.navItems) {
      if (!seen.has(it.href)) {
        seen.add(it.href)
        out.push(it.href)
      }
    }
  }
  return Object.freeze([...out])
}
