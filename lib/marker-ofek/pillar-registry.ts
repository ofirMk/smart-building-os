import type { LucideIcon } from "lucide-react"
import {
  Database,
  FileScan,
  FileSignature,
  FolderKanban,
  Gavel,
  Gauge,
  BarChart3,
  HardHat,
  KeyRound,
  Landmark,
  Map,
  Package,
  Receipt,
  Scale,
  ScrollText,
  Settings,
  ShoppingCart,
  Table2,
  Tags,
  Truck,
  Wallet,
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
 * שמונת עמודי הליבה של מרקר אופק — מקור אמת ל-Hub, סרגל צד ודפי נחיתה.
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
      { title: "מפת המערכת (Roadmap)", href: "/marker-ofek/system-map", icon: Map },
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
        title: "קליטת חומרי מכרז (AI)",
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
    id: "project-setup",
    navTitle: "פרויקטים",
    cardTitle: "פרויקטים",
    tagline:
      "מרכזי רווח (Profit Center): פרויקטים, חוזים, חשבונות חלקיים ויומני עבודה.",
    href: "/marker-ofek/projects",
    icon: FolderKanban,
    defaultOpen: true,
    navItems: [
      {
        title: "מרכז פרויקטים",
        href: "/marker-ofek/projects",
        icon: FolderKanban,
      },
      {
        title: "חוזי לקוחות",
        href: "/marker-ofek/contracts",
        icon: FileSignature,
      },
      {
        title: "חשבונות חלקיים",
        href: "/marker-ofek/execution/progress-reports",
        icon: BarChart3,
      },
      {
        title: "יומני עבודה",
        href: "/marker-ofek/execution/daily-logs",
        icon: ScrollText,
      },
    ],
    quickActions: [
      { title: "פרויקטים", href: "/marker-ofek/projects" },
      { title: "הקמת פרויקט חדש", href: "/marker-ofek/projects/new" },
      { title: "חוזה חדש", href: "/marker-ofek/contracts/new" },
    ],
  },
  {
    id: "procurement",
    navTitle: "שרשרת אספקה ורכש",
    cardTitle: "שרשרת אספקה ורכש",
    tagline: "הזמנות, קליטת סחורה וקליטת מסמכי ספק חכמה.",
    href: "/marker-ofek/procurement",
    icon: Truck,
    defaultOpen: true,
    navItems: [
      { title: "לוח רכש", href: "/marker-ofek/procurement", icon: ShoppingCart },
      {
        title: "ניהול ספקים",
        href: "/marker-ofek/supply-chain/suppliers",
        icon: Scale,
      },
      {
        title: "גיליון פריטים",
        href: "/marker-ofek/items",
        icon: Tags,
      },
      {
        title: "הזמנות רכש",
        href: "/marker-ofek/procurement/purchase-orders/new",
        icon: Package,
      },
      {
        title: "תעודות משלוח",
        href: "/marker-ofek/procurement/delivery-notes/new",
        icon: Truck,
      },
      {
        title: "חשבוניות ספק ו-AI",
        href: "/marker-ofek/procurement/invoices/new",
        icon: Receipt,
      },
      {
        title: "Audit התאמות חודשי",
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
      {
        title: "ניהול ספקים",
        href: "/marker-ofek/supply-chain/suppliers",
      },
      {
        title: "גיליון פריטים",
        href: "/marker-ofek/items",
      },
      {
        title: "הזמנות רכש",
        href: "/marker-ofek/procurement/purchase-orders/new",
      },
      {
        title: "תעודות משלוח",
        href: "/marker-ofek/procurement/delivery-notes/new",
      },
      {
        title: "חשבוניות ספק",
        href: "/marker-ofek/procurement/invoices/new",
      },
      {
        title: "Audit התאמות",
        href: "/marker-ofek/procurement/reconciliation",
      },
    ],
  },
  {
    id: "field-execution",
    navTitle: "ביצוע בשטח",
    cardTitle: "ביצוע בשטח",
    tagline: "מעקב קבלות, איכות וסגירת פערים מול הזמנות.",
    href: "/marker-ofek/field-execution",
    icon: HardHat,
    defaultOpen: false,
    navItems: [
      {
        title: "סיכום ביצוע בשטח",
        href: "/marker-ofek/field-execution",
        icon: HardHat,
      },
      {
        title: "יומני עבודה",
        href: "/marker-ofek/execution/daily-logs",
        icon: ScrollText,
      },
      {
        title: "חשבונות חלקיים",
        href: "/marker-ofek/execution/progress-reports",
        icon: BarChart3,
      },
      { title: "גילון ספקים", href: "/marker-ofek/procurement/aging", icon: Scale },
    ],
    quickActions: [
      { title: "יומן עבודה", href: "/marker-ofek/execution/daily-logs" },
      {
        title: "חשבון חלקי",
        href: "/marker-ofek/execution/progress-reports",
      },
      { title: "גילון ספקים", href: "/marker-ofek/procurement/aging" },
    ],
  },
  {
    id: "billing",
    navTitle: "חיוב והנהלה",
    cardTitle: "חיוב והנהלה",
    tagline: "חשבוניות מס, תשלומים וחיוב מרוכז ללקוחות.",
    href: "/marker-ofek/billing",
    icon: Wallet,
    defaultOpen: false,
    navItems: [
      { title: "נקודת כניסה לעמודה", href: "/marker-ofek/billing", icon: Wallet },
      { title: "כספים — חשבוניות", href: "/marker-ofek/finance", icon: Receipt },
      {
        title: "חשבונית מרכזת",
        href: MARKER_OFEK_HREFS.financeCentralized,
        icon: Landmark,
      },
    ],
    quickActions: [
      { title: "חשבוניות", href: "/marker-ofek/finance" },
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

/** כל נתיבי הניווט לרישום בסרגל (ייחודיים), כולל שורש מרקר אופק */
export function getMarkerOfekFlatNavHrefs(): readonly string[] {
  const seen = new Set<string>(["/marker-ofek"])
  const out: string[] = ["/marker-ofek"]
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
