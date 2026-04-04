import type { LucideIcon } from "lucide-react"
import {
  Archive,
  BarChart,
  BarChart3,
  Bot,
  Briefcase,
  Building2,
  Calculator,
  Car,
  ClipboardList,
  FileScan,
  FileSearch,
  FileSignature,
  FileText,
  FolderKanban,
  GitBranch,
  GitCompare,
  Landmark,
  LayoutDashboard,
  LayoutGrid,
  Layers,
  LayoutList,
  PackageSearch,
  Percent,
  Receipt,
  ScrollText,
  Shield,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Scale,
  Table2,
  Truck,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react"

import { MARKER_OFEK_HREFS } from "@/app/(dashboard)/_components/sidebar-routes"

export type MarkerOfekSidebarNavItem = {
  title: string
  href: string
  icon: LucideIcon
}

export type MarkerOfekSidebarNavSection = {
  id: string
  label: string
  defaultOpen: boolean
  items: MarkerOfekSidebarNavItem[]
}

/**
 * אקורדיון מרקר אופק — סדר זהב: ראשי → רכש → מכרזים → פרויקטים → חוזה וחשבונות → כספים.
 */
export const MARKER_OFEK_SIDEBAR_SECTIONS: MarkerOfekSidebarNavSection[] = [
  {
    id: "home",
    label: "ראשי",
    defaultOpen: true,
    items: [
      {
        title: "מרכז מודולים",
        href: "/marker-ofek",
        icon: LayoutDashboard,
      },
      {
        title: "דשבורד הנהלה",
        href: "/marker-ofek/executive",
        icon: BarChart3,
      },
      {
        title: "ניהול מודולים",
        href: "/marker-ofek/settings/modules",
        icon: SlidersHorizontal,
      },
    ],
  },
  {
    id: "mdm",
    label: "נתוני מאסטר",
    defaultOpen: false,
    items: [
      {
        title: "פרופיל חברה",
        href: "/marker-ofek/settings/company",
        icon: Building2,
      },
      {
        title: "כללי מערכת (מס)",
        href: "/marker-ofek/settings/system-rules",
        icon: Percent,
      },
      {
        title: "ישויות",
        href: "/marker-ofek/entities",
        icon: Users,
      },
      {
        title: "ספקים — תאימות",
        href: "/marker-ofek/entities/suppliers",
        icon: ShieldCheck,
      },
      {
        title: "קטלוג פריטים (גלובלי)",
        href: "/marker-ofek/catalog/items",
        icon: PackageSearch,
      },
    ],
  },
  {
    id: "procurement-command",
    label: "רכש",
    defaultOpen: true,
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
        title: "חשבוניות ספק ובינה מלאכותית",
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
    id: "tenders-estimations",
    label: "מכרזים",
    defaultOpen: true,
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
    id: "projects",
    label: "פרויקטים",
    defaultOpen: true,
    items: [
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
  },
  {
    id: "contracts-billing",
    label: "חוזה וחשבונות",
    defaultOpen: true,
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
    id: "finance",
    label: "כספים",
    defaultOpen: true,
    items: [
      {
        title: "מרכז חיוב ותזרים",
        href: "/marker-ofek/finance/billing",
        icon: Landmark,
      },
      {
        title: "חשבוניות מס",
        href: "/marker-ofek/finance",
        icon: Receipt,
      },
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
]
