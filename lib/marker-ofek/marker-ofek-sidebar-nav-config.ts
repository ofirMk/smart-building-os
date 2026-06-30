import type { LucideIcon } from "lucide-react"
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart2,
  Bot,
  Building2,
  Calculator,
  ClipboardList,
  Database,
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
  PackageCheck,
  PackageOpen,
  PieChart,
  Receipt,
  ReceiptText,
  Scale,
  Shield,
  ShoppingCart,
  Sparkles,
  Sun,
  TrendingUp,
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

/** ניווט מרקר אופק — 7 קטגוריות לפי מחזור חיים של בנייה */
export const MARKER_OFEK_SIDEBAR_SECTIONS: MarkerOfekSidebarNavSection[] = [
  {
    id: "personal-workspace",
    label: "סביבת עבודה אישית",
    defaultOpen: true,
    items: [
      { title: "My Day ☀️", href: "/marker-ofek/my-day", icon: Sun },
      { title: "מרכז פיקוד (CEO)", href: "/marker-ofek/command-center", icon: Gauge },
      { title: "פורטפוליו פרויקטים", href: "/marker-ofek/portfolio", icon: FolderKanban },
    ],
  },
  {
    id: "planning-pre-construction",
    label: "תכנון וקדם ביצוע",
    defaultOpen: true,
    items: [
      { title: "כל הפרויקטים", href: "/marker-ofek/projects", icon: FolderKanban },
      { title: "מרכז מכרזים", href: "/marker-ofek/tenders", icon: Gavel },
      { title: "קליטת חומרי מכרז (AI)", href: "/marker-ofek/pre-construction/tender-intake", icon: Gavel },
      { title: "כתב כמויות ותמחור", href: "/marker-ofek/pre-construction/tender-pricing", icon: ListOrdered },
      { title: "כתבי כמויות (BOQ)", href: "/marker-ofek/tenders/boq", icon: FileSearch },
      { title: "תמחור פרויקטים", href: "/marker-ofek/tenders/pricing", icon: FileStack },
      { title: "השוואת הצעות", href: "/marker-ofek/procurement/tenders/compare", icon: GitCompare },
      { title: "מבנה WBS", href: "/marker-ofek/tenders/wbs", icon: ListOrdered },
      { title: "בקרה תקציבית", href: "/marker-ofek/finance/budget-control", icon: ArrowLeftRight },
      { title: "קוקפיט בקרת עלויות", href: "/marker-ofek/projects-budget-control", icon: Gauge },
    ],
  },
  {
    id: "procurement-tenders",
    label: "רכש ומכרזים",
    defaultOpen: false,
    items: [
      { title: "קטלוג פריטים (נתוני אב)", href: "/marker-ofek/items", icon: Package },
      { title: "ספקים", href: "/marker-ofek/procurement/suppliers", icon: Building2 },
      { title: "מרכז רכש אחוד", href: "/marker-ofek/procurement", icon: Sparkles },
      { title: "הזמנות רכש", href: "/marker-ofek/procurement/orders", icon: ShoppingCart },
      { title: "תיבת אישורים", href: "/marker-ofek/procurement/approvals", icon: Inbox },
      { title: "קבלת סחורה", href: "/marker-ofek/procurement/goods-receipt/new", icon: PackageOpen },
      { title: "חשבוניות ספק (AP)", href: "/marker-ofek/procurement/invoices/new", icon: Receipt },
      { title: "AI ייבוא חשבוניות", href: "/marker-ofek/procurement/ai-import", icon: Bot },
      { title: "מהנדס רכש AI 🤖", href: "/marker-ofek/procurement/autonomous-po/new", icon: Bot },
      { title: "לוח מדדי KPI", href: "/marker-ofek/procurement/reports/kpi", icon: Gauge },
      { title: "ניתוח הוצאות", href: "/marker-ofek/procurement/reports/spend", icon: PieChart },
      { title: "גיל הזמנות פתוחות", href: "/marker-ofek/procurement/reports/aging", icon: BarChart2 },
      { title: "סטיות מחיר", href: "/marker-ofek/procurement/reports/variance", icon: TrendingUp },
    ],
  },
  {
    id: "construction-execution",
    label: "בנייה וביצוע",
    defaultOpen: false,
    items: [
      { title: 'לו"ז וביצוע (גאנט)', href: "/marker-ofek/execution/gantt", icon: ListChecks },
      { title: "יומני עבודה", href: "/marker-ofek/execution/daily-logs", icon: ClipboardList },
      { title: "תוכניות ו-Takeoff", href: "/marker-ofek/execution/plans", icon: FileStack },
      { title: "משאבים ולוח שנה", href: "/marker-ofek/execution/resources", icon: Users },
      { title: "ביצוע שטח", href: "/marker-ofek/field-execution", icon: Map },
      { title: "מסירת קומות", href: "/marker-ofek/execution/field/floor-handover", icon: FileStack },
      { title: "ביקורת ליקויים (Snags)", href: "/marker-ofek/execution/field/snags", icon: AlertTriangle },
      { title: "בדיקות QA / ליקויים", href: "/marker-ofek/execution/defects", icon: Shield },
      { title: "בדיקות וצ'קליסטים", href: "/marker-ofek/execution/checklists", icon: ListChecks },
      { title: "מסירה (Handover)", href: "/marker-ofek/handover", icon: PackageCheck },
    ],
  },
  {
    id: "contracts-finance",
    label: "חוזים וכספים",
    defaultOpen: true,
    items: [
      { title: "מנוע חוזים (Smart Billing)", href: "/marker-ofek/contracts-engine", icon: Scale },
      { title: "מאגר חוזים", href: "/marker-ofek/contracts", icon: FileText },
      { title: "כספת מסמכי חוזה", href: "/marker-ofek/finance/contract-vault", icon: FileStack },
      { title: "עכבון וערבויות", href: "/marker-ofek/finance/retention", icon: Shield },
      { title: "הוראות שינוי", href: "/marker-ofek/finance/variations", icon: ClipboardList },
      { title: "חשבונות חלקיים", href: "/marker-ofek/finance/partials", icon: ReceiptText },
      { title: "חשבונות קבלני משנה", href: "/marker-ofek/finance/subcontractor-accounts", icon: Users },
      { title: "מרכז חיוב ותזרים", href: "/marker-ofek/finance/billing", icon: LayoutDashboard },
      { title: "חשבוניות מס", href: "/marker-ofek/finance", icon: Receipt },
      { title: "תקבולים", href: "/marker-ofek/finance/receipts", icon: PackageCheck },
      { title: "לקוחות (AR)", href: "/marker-ofek/finance/customers", icon: Users },
      { title: "ריצת תשלומים", href: "/marker-ofek/finance/payments/runs", icon: ArrowLeftRight },
      { title: "התאמת חשבוניות (3-Way)", href: "/marker-ofek/finance/reconciliation", icon: Scale },
      { title: "Bank Reconciliation", href: "/marker-ofek/finance/bank-reconciliation", icon: Scale },
      { title: "🎯 דשבורד כספים", href: "/marker-ofek/finance/dashboard", icon: Gauge },
      { title: "תזרים מזומנים", href: "/marker-ofek/finance/cash-flow", icon: ArrowLeftRight },
      { title: "רווח והפסד", href: "/marker-ofek/finance/pnl", icon: TrendingUp },
      { title: 'דוח מע"מ', href: "/marker-ofek/finance/vat-report", icon: Calculator },
    ],
  },
  {
    id: "facilities-management",
    label: "ניהול מבנים",
    defaultOpen: true,
    items: [
      { title: "קריאות שירות", href: "/tickets", icon: AlertTriangle },
      { title: "תחזוקה מונעת", href: "/maintenance", icon: Wrench },
      { title: "ניהול אנרגיה (EV)", href: "/ev-management", icon: Zap },
      { title: "דיירים", href: "/tenants", icon: Users },
      { title: "Holden מרכז פיקוד", href: "/holden", icon: Building2 },
      { title: "Holden ERP", href: "/marker-ofek/holden-erp", icon: Database },
    ],
  },
  {
    id: "system-office",
    label: "נתוני אב ומערכת",
    defaultOpen: false,
    items: [
      { title: "מרכז מאסטר דאטה", href: "/marker-ofek/master-data", icon: Database },
      { title: "הגדרות חברה", href: "/marker-ofek/settings", icon: Wrench },
      { title: "כספת מסמכים (DMS)", href: "/marker-ofek/dms", icon: FileStack },
      { title: "ניהול ישויות", href: "/marker-ofek/entities", icon: Building2 },
      { title: "מפת מערכת", href: "/marker-ofek/system-map", icon: Map },
      { title: "מפת דרכים", href: "/marker-ofek/roadmap", icon: Milestone },
      { title: "מערכת בריאות", href: "/marker-ofek/system/health", icon: Shield },
    ],
  },
]
