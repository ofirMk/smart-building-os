import type { LucideIcon } from "lucide-react"
import {
  AlertTriangle,
  ArrowLeftRight,
  Building2,
  ClipboardList,
  FileEdit,
  FileStack,
  FileText,
  FolderKanban,
  ListChecks,
  ListOrdered,
  Package,
  PackageOpen,
  ReceiptText,
  Receipt,
  ShoppingCart,
  Users,
  Wrench,
  Zap,
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
    id: "procurement-chain",
    label: "שרשרת רכש (Procurement)",
    defaultOpen: false,
    items: [
      {
        title: "ספקים",
        href: "/marker-ofek/procurement/suppliers",
        icon: Building2,
      },
      {
        title: "קטלוג פריטים",
        href: "/marker-ofek/catalog",
        icon: Package,
      },
      {
        title: "מחירוני ספקים",
        href: "/marker-ofek/procurement/catalog",
        icon: FileStack,
      },
      {
        title: "הזמנות רכש",
        href: "/marker-ofek/procurement/orders",
        icon: ShoppingCart,
      },
      {
        title: "קבלות סחורה (GRPO)",
        href: "/marker-ofek/procurement/goods-receipt/new",
        icon: PackageOpen,
      },
      {
        title: "חשבוניות ספק (AP)",
        href: "/marker-ofek/procurement/invoices/new",
        icon: Receipt,
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
    ],
  },
  {
    id: "contracts-billing",
    label: "חוזים וחשבונות (Contracts & Billing)",
    defaultOpen: true,
    items: [
      {
        title: "חוזי קבלן",
        href: "/marker-ofek/contracts/create-subcontractor",
        icon: FileEdit,
      },
      {
        title: "חוזי מזמין",
        href: "/marker-ofek/finance/contracts-billing",
        icon: FileText,
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
