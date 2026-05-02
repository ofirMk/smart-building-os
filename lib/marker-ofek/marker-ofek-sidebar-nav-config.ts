import type { LucideIcon } from "lucide-react"
import {
  AlertTriangle,
  Archive,
  ArrowLeftRight,
  Building2,
  ClipboardList,
  Database,
  FileEdit,
  FileSearch,
  FileStack,
  FileText,
  FolderKanban,
  Gauge,
  Gavel,
  GitCompare,
  Inbox,
  LayoutDashboard,
  ListChecks,
  ListOrdered,
  Map,
  Milestone,
  Package,
  PackageOpen,
  ReceiptText,
  Receipt,
  Shield,
  ShoppingCart,
  Sparkles,
  Users,
  Wrench,
  Zap,
} from "lucide-react"

import { MARKER_OFEK_HREFS } from "@/lib/infrastructure/navigation/sidebar-routes"

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

/** ניווט מרקר אופק — מקור אמת יחיד לסרגל ולמגירה */
export const MARKER_OFEK_SIDEBAR_SECTIONS: MarkerOfekSidebarNavSection[] = [
  {
    id: "master-data-core",
    label: "תשתיות נתונים (Master Data)",
    defaultOpen: true,
    items: [
      {
        title: "מרכז מאסטר דאטה",
        href: "/marker-ofek/master-data",
        icon: Database,
      },
      {
        // Phase 7.14.0 — נתוני אב חיים, EntityWorkspace + supabase live.
        title: "קטלוג פריטים (נתוני אב)",
        href: "/marker-ofek/items",
        icon: Package,
      },
      {
        // Phase 7.14.0 — workspace ישן עם mock data; משאירים זמין כארכיון לסקירה,
        // אבל ה-banner על העמוד עצמה מפנה ל-/items.
        title: "קטלוג טכני (legacy)",
        href: "/marker-ofek/catalog",
        icon: Archive,
      },
      {
        title: "הגדרות חברה",
        href: "/marker-ofek/settings",
        icon: Wrench,
      },
      {
        title: "מפת מערכת",
        href: "/marker-ofek/system-map",
        icon: Map,
      },
      {
        title: "מפת דרכים",
        href: "/marker-ofek/roadmap",
        icon: Milestone,
      },
    ],
  },
  {
    id: "pre-construction",
    label: "קדם ביצוע (Pre-Construction)",
    defaultOpen: false,
    items: [
      {
        title: "קליטת חומרי מכרז (AI)",
        href: "/marker-ofek/pre-construction/tender-intake",
        icon: Gavel,
      },
      {
        title: "כתב כמויות ותמחור",
        href: "/marker-ofek/pre-construction/tender-pricing",
        icon: ListOrdered,
      },
    ],
  },
  {
    id: "tenders-estimation",
    label: "מכרזים והערכות (Tenders)",
    defaultOpen: true,
    items: [
      {
        title: "מרכז מכרזים",
        href: "/marker-ofek/tenders",
        icon: LayoutDashboard,
      },
      {
        title: "תמחור פרויקטים",
        href: "/marker-ofek/tenders/pricing",
        icon: FileStack,
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
        icon: ListOrdered,
      },
    ],
  },
  {
    id: "procurement-chain",
    label: "שרשרת רכש (Procurement)",
    defaultOpen: false,
    items: [
      {
        title: "מרכז רכש אחוד",
        href: "/marker-ofek/procurement",
        icon: Sparkles,
      },
      {
        title: "נתוני מאסטר רכש",
        href: "/marker-ofek/master-data",
        icon: Database,
      },
      {
        title: "ספקים",
        href: "/marker-ofek/procurement/suppliers",
        icon: Building2,
      },
      {
        title: "מחירוני ספקים",
        href: "/marker-ofek/procurement/catalog",
        icon: FileStack,
      },
      {
        // Phase 7.14.0 — שרשרת הרכש מצביעה על ה-master החי.
        // UX Hotfix (Phase 8.3 prep): הוזז ישירות מעל "הזמנות רכש" + שונה
        // ל"כרטיס פריט" (שפה נגישה לאנשי שטח) לפי בקשת לקוח.
        title: "כרטיס פריט",
        href: "/marker-ofek/items",
        icon: Package,
      },
      {
        title: "הזמנות רכש",
        href: "/marker-ofek/procurement/orders",
        icon: ShoppingCart,
      },
      {
        title: "תיבת אישורים",
        href: "/marker-ofek/procurement/approvals",
        icon: Inbox,
      },
      {
        title: "קבלת סחורה",
        href: "/marker-ofek/procurement/goods-receipt/new",
        icon: PackageOpen,
      },
      {
        title: "חשבוניות ספק (AP)",
        href: "/marker-ofek/procurement/invoices/new",
        icon: Receipt,
      },
      {
        title: "זרימת הזמנה ואספקה",
        href: "/marker-ofek/procurement/purchase-order-delivery-flow",
        icon: ArrowLeftRight,
      },
    ],
  },
  {
    id: "projects-control",
    label: "פרויקטים ובקרה (Projects & Control)",
    defaultOpen: true,
    items: [
      {
        title: "כרטיס פרויקט",
        href: "/marker-ofek/projects",
        icon: FolderKanban,
      },
      {
        title: "לו\"ז וביצוע (גאנט)",
        href: "/marker-ofek/execution/gantt",
        icon: ListChecks,
      },
      {
        title: "יומני עבודה",
        href: "/marker-ofek/execution/daily-logs",
        icon: ClipboardList,
      },
      {
        title: "תוכניות ו-Takeoff",
        href: "/marker-ofek/execution/plans",
        icon: FileStack,
      },
      {
        title: "משאבים ולוח שנה",
        href: "/marker-ofek/execution/resources",
        icon: Users,
      },
      {
        title: "מהדורות תכנון (BOQ)",
        href: "/marker-ofek/tenders/wbs",
        icon: ListOrdered,
      },
      {
        title: "עץ מוצר לתמחור (BOM)",
        href: "/marker-ofek/tenders/pricing",
        icon: FileStack,
      },
      {
        title: "בקרה תקציבית - תכנון מול ביצוע",
        href: "/marker-ofek/finance/budget-control",
        icon: ArrowLeftRight,
      },
      {
        title: "בקרה תקציבית (דשבורד)",
        href: "/marker-ofek/budget",
        icon: Gauge,
      },
    ],
  },
  {
    id: "contracts-billing",
    label: "חוזים וחשבונות (Contracts & Billing)",
    defaultOpen: true,
    items: [
      {
        title: "מרכז חוזים וחשבונות",
        href: "/marker-ofek/finance/contracts-billing",
        icon: LayoutDashboard,
      },
      {
        title: "חוזי מזמין וספקי ביצוע",
        href: "/marker-ofek/contracts",
        icon: FileText,
      },
      {
        title: "יצירת חוזה קבלן משנה",
        href: "/marker-ofek/contracts/create-subcontractor",
        icon: FileEdit,
      },
      {
        title: "כספת מסמכי חוזה",
        href: "/marker-ofek/finance/contract-vault",
        icon: FileStack,
      },
      {
        title: "הצמדות ומדדים",
        href: "/marker-ofek/finance/indexation",
        icon: ArrowLeftRight,
      },
      {
        title: "עכבון וערבויות",
        href: "/marker-ofek/finance/retention",
        icon: Shield,
      },
      {
        title: "הוראות שינוי",
        href: "/marker-ofek/finance/variations",
        icon: ClipboardList,
      },
      {
        title: "חשבונות חלקיים",
        href: "/marker-ofek/finance/partials",
        icon: ReceiptText,
      },
    ],
  },
  {
    id: "finance-core",
    label: "כספים (Finance)",
    defaultOpen: true,
    items: [
      {
        title: "לקוחות",
        href: "/marker-ofek/finance/customers",
        icon: Users,
      },
      {
        title: "כרטסות",
        href: "/marker-ofek/finance/gl-accounts",
        icon: ListChecks,
      },
      {
        title: "תקבולים ותשלומים",
        href: "/marker-ofek/finance/payments",
        icon: ArrowLeftRight,
      },
      {
        title: "מרכז חיוב ותזרים",
        href: "/marker-ofek/finance/billing",
        icon: LayoutDashboard,
      },
      {
        title: "חשבוניות מס",
        href: "/marker-ofek/finance",
        icon: Receipt,
      },
      {
        title: "חשבונית מרכזת",
        href: MARKER_OFEK_HREFS.financeCentralized,
        icon: ReceiptText,
      },
    ],
  },
  {
    id: "office-management",
    label: "ניהול משרד (Office Management)",
    defaultOpen: true,
    items: [
      {
        title: "משאבי אנוש",
        href: "/marker-ofek/hr/timesheets",
        icon: ClipboardList,
      },
      {
        title: "רכבים וציוד",
        href: "/marker-ofek/logistics/asset-tracking",
        icon: Wrench,
      },
    ],
  },
  {
    id: "smart-building",
    label: "ניהול מבנים (Smart Building)",
    defaultOpen: true,
    items: [
      {
        title: "Residents",
        href: "/tenants",
        icon: Users,
      },
      {
        title: "Maintenance",
        href: "/maintenance",
        icon: Wrench,
      },
      {
        title: "Incidents",
        href: "/tickets",
        icon: AlertTriangle,
      },
    ],
  },
  {
    id: "ev-charging",
    label: "טעינת רכבים (EV Charging)",
    defaultOpen: false,
    items: [
      {
        title: "ניהול עמדות וצריכה",
        href: "/ev-management",
        icon: Zap,
      },
    ],
  },
]
