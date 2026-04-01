import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  FileScan,
  FileSignature,
  FolderKanban,
  Briefcase,
  Package,
  PackageSearch,
  Receipt,
  ScrollText,
  ShieldCheck,
  Table2,
  Truck,
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

/**
 * מבנה סרגל מרקר אופק — שלוש קבוצות ברורות (מקור אמת לתפריט הצד).
 */
export const MARKER_OFEK_SIDEBAR_SECTIONS: MarkerOfekSidebarNavSection[] = [
  {
    id: "pre-construction",
    label: "קדם ביצוע",
    defaultOpen: true,
    items: [
      {
        title: "מכרזים נכנסים",
        href: "/marker-ofek/pre-construction/tender-intake",
        icon: FileScan,
      },
      {
        title: "תמחור מכרזים",
        href: "/marker-ofek/pre-construction/tender-pricing",
        icon: Table2,
      },
    ],
  },
  {
    id: "projects-execution",
    label: "פרויקטים וביצוע",
    defaultOpen: true,
    items: [
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
  },
  {
    id: "procurement-chain",
    label: "שרשרת אספקה ורכש",
    defaultOpen: true,
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
        icon: ShieldCheck,
      },
    ],
  },
]
