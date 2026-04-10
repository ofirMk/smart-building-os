import type { LucideIcon } from "lucide-react"
import {
  Activity,
  ArrowLeftRight,
  CreditCard,
  FileEdit,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Table2,
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

/** ארבעת העמודים — מרקר אופק */
export const MARKER_OFEK_SIDEBAR_SECTIONS: MarkerOfekSidebarNavSection[] = [
  {
    id: "procurement-mgmt",
    label: "ניהול רכש",
    defaultOpen: true,
    items: [
      {
        title: "מרכז רכש אחוד",
        href: "/marker-ofek/procurement",
        icon: ShoppingCart,
      },
    ],
  },
  {
    id: "finance-mgmt",
    label: "ניהול כספים",
    defaultOpen: true,
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
    ],
  },
  {
    id: "system-ops",
    label: "מערכת",
    defaultOpen: true,
    items: [
      {
        title: "בריאות המערכת",
        href: "/marker-ofek/system/health",
        icon: Activity,
      },
    ],
  },
]
