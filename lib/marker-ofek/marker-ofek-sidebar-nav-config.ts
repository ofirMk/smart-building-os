import type { LucideIcon } from "lucide-react"
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Bot,
  Building2,
  ClipboardList,
  Clock,
  CreditCard,
  GanttChartSquare,
  FileEdit,
  FileText,
  FolderKanban,
  HardHat,
  Landmark,
  LayoutDashboard,
  LineChart,
  ListOrdered,
  Map,
  MessageSquare,
  Package,
  PackageOpen,
  PieChart,
  PlusCircle,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Table2,
  Truck,
  Wallet,
  Wrench,
} from "lucide-react"

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
    id: "project-cockpit",
    label: "לוח בקרה",
    defaultOpen: true,
    items: [
      {
        title: "אנליטיקה והנהלה (BI)",
        href: "/marker-ofek/analytics",
        icon: LineChart,
      },
      {
        title: "קוקפיט (Dashboard)",
        href: "/marker-ofek/dashboard",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    id: "project-mgmt",
    label: "ניהול פרויקטים",
    defaultOpen: true,
    items: [
      {
        title: "אתרים פעילים",
        href: "/marker-ofek/projects",
        icon: FolderKanban,
      },
      {
        title: "הקמת פרויקט / מכרז",
        href: "/marker-ofek/projects/new",
        icon: FolderKanban,
      },
      {
        title: "ניהול משימות",
        href: "/marker-ofek/execution/daily-logs/new",
        icon: ClipboardList,
      },
      {
        title: "גאנט פרויקטים",
        href: "/marker-ofek/projects/gantt",
        icon: GanttChartSquare,
      },
    ],
  },
  {
    id: "procurement-mgmt",
    label: "רכש ואספקה",
    defaultOpen: true,
    items: [
      {
        title: "מרכז רכש",
        href: "/marker-ofek/procurement",
        icon: ShoppingCart,
      },
      {
        title: "רשימת הזמנות (PO)",
        href: "/marker-ofek/procurement/orders",
        icon: ListOrdered,
      },
      {
        title: "הזמנת רכש חדשה (מנוע)",
        href: "/marker-ofek/procurement/purchase-orders/new",
        icon: PlusCircle,
      },
      {
        title: "הזמנה ממכרז (BoQ)",
        href: "/marker-ofek/procurement/purchase-orders/from-boq",
        icon: FileText,
      },
      {
        title: "קטלוג פריטים (מאסטר)",
        href: "/marker-ofek/catalog",
        icon: Package,
      },
      {
        title: "קטלוג ברכש (מחובר)",
        href: "/marker-ofek/procurement/catalog",
        icon: Table2,
      },
      {
        title: "ספקים",
        href: "/marker-ofek/procurement/suppliers",
        icon: Building2,
      },
      {
        title: "קליטת סחורה (GR)",
        href: "/marker-ofek/procurement/goods-receipt/new",
        icon: PackageOpen,
      },
      {
        title: "תעודת משלוח",
        href: "/marker-ofek/procurement/delivery-notes/new",
        icon: Truck,
      },
    ],
  },
  {
    id: "execution-mgmt",
    label: "ניהול ביצוע",
    defaultOpen: true,
    items: [
      {
        title: "יומן עבודה (Daily Log)",
        href: "/marker-ofek/execution/daily-logs/new",
        icon: HardHat,
      },
      {
        title: "ניהול ליקויים (QA)",
        href: "/marker-ofek/execution/qa-defects/new",
        icon: AlertTriangle,
      },
      {
        title: "ניפוק ציוד (Material Issue)",
        href: "/marker-ofek/execution/material-issue/new",
        icon: Truck,
      },
      {
        title: "שעון נוכחות (Attendance)",
        href: "/marker-ofek/execution/attendance",
        icon: Clock,
      },
    ],
  },
  {
    id: "logistics",
    label: "לוגיסטיקה",
    defaultOpen: true,
    items: [
      {
        title: "כלי עבודה (Tools/Assets)",
        href: "/marker-ofek/logistics/asset-tracking",
        icon: Wrench,
      },
    ],
  },
  {
    id: "hr-mgmt",
    label: "משאבי אנוש (HR)",
    defaultOpen: true,
    items: [
      {
        title: "ניהול שעות ושכר",
        href: "/marker-ofek/hr/timesheets",
        icon: ClipboardList,
      },
      {
        title: "ספר עובדים",
        href: "/marker-ofek/entities/new?kind=worker",
        icon: Building2,
      },
      {
        title: "נוכחות עובדים",
        href: "/marker-ofek/execution/attendance",
        icon: Clock,
      },
    ],
  },
  {
    id: "finance-accounts",
    label: "כספים וחשבונות",
    defaultOpen: true,
    items: [
      {
        title: "בקרת תקציב (Budget Control)",
        href: "/marker-ofek/finance/budget-control",
        icon: PieChart,
      },
      {
        title: "אישורי חשבונות קבלנים",
        href: "/marker-ofek/finance/subcontractor-billing/new",
        icon: Wallet,
      },
      {
        title: "חשבונות יזם (Client Billing)",
        href: "/marker-ofek/finance/client-billing/new",
        icon: Landmark,
      },
      {
        title: "חשבוניות מס",
        href: "/marker-ofek/finance/invoices",
        icon: Receipt,
      },
      {
        title: "תשלומים",
        href: "/marker-ofek/finance/payments",
        icon: CreditCard,
      },
    ],
  },
  {
    id: "finance-mgmt",
    label: "ניהול כספים — הרחבה",
    defaultOpen: false,
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
    id: "master-data-mgmt",
    label: "ניהול נתונים",
    defaultOpen: true,
    items: [
      {
        title: "מרכז נתוני מאסטר",
        href: "/marker-ofek/master-data",
        icon: Table2,
      },
      {
        title: "הקמת ספק",
        href: "/marker-ofek/entities/new?kind=supplier&lock=1",
        icon: Building2,
      },
    ],
  },
  {
    id: "ai-agent",
    label: "AI Agent",
    defaultOpen: true,
    items: [
      {
        title: "צ׳אט עוזר חכם",
        href: "/chat",
        icon: MessageSquare,
      },
      {
        title: "סוכן תפעול ארגוני",
        href: "/chat",
        icon: Bot,
      },
    ],
  },
  {
    id: "system-ops",
    label: "מערכת",
    defaultOpen: true,
    items: [
      {
        title: "מפת דרכים (Roadmap)",
        href: "/marker-ofek/roadmap",
        icon: Map,
      },
      {
        title: "בריאות המערכת",
        href: "/marker-ofek/system/health",
        icon: Activity,
      },
    ],
  },
]
