"use client"

/**
 * FinanceInvestorHero — investor-grade hero strip שמתפקד מעל מסך
 * הכספים הקיים. Mock-data only (אין קריאות DB) כדי שהמסך תמיד יראה מלא
 * וזמין במהלך הפיץ', אפילו על workspace ריק.
 */

import * as React from "react"
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  TrendingUp,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

const KPIs = [
  {
    label: "חשבוניות ממתינות",
    value: 14,
    sub: "סה״כ ₪412,300",
    icon: <Clock className="size-5" />,
    tone: "amber",
  },
  {
    label: "התאמות 3-Way תקינות",
    value: "92%",
    sub: "השבוע — מתוך 86 חשבוניות",
    icon: <CheckCircle2 className="size-5" />,
    tone: "emerald",
  },
  {
    label: "חיסכון מצטבר ע״י AI",
    value: ILS.format(216_000),
    sub: "מזיהוי חריגות מחיר אוטומטי",
    icon: <TrendingUp className="size-5" />,
    tone: "violet",
  },
  {
    label: "חריגות לאישור CFO",
    value: 3,
    sub: "סה״כ ₪84,500 חריגה",
    icon: <AlertCircle className="size-5" />,
    tone: "rose",
  },
] as const

const TONE = {
  amber: "from-amber-500/10 ring-amber-200 text-amber-700 dark:text-amber-300",
  emerald:
    "from-emerald-500/10 ring-emerald-300 text-emerald-700 dark:text-emerald-300",
  violet:
    "from-violet-500/10 ring-violet-200 text-violet-700 dark:text-violet-300",
  rose: "from-rose-500/10 ring-rose-200 text-rose-700 dark:text-rose-300",
}

type PendingInvoice = {
  id: string
  invoice: string
  supplier: string
  project: string
  amount: number
  status: "matched" | "variance" | "pending"
  matchPct: number
}

const PENDING_INVOICES: PendingInvoice[] = [
  {
    id: "INV-7821",
    invoice: "10481",
    supplier: "חשמל ישיר",
    project: "גינדי סביון",
    amount: 84_500,
    status: "matched",
    matchPct: 100,
  },
  {
    id: "INV-7822",
    invoice: "10487",
    supplier: "חשמל ישיר",
    project: "גינדי סביון",
    amount: 47_300,
    status: "variance",
    matchPct: 78,
  },
  {
    id: "INV-7823",
    invoice: "AC-2026/22",
    supplier: "אבן וגרניט בע״מ",
    project: "מרינה הרצליה",
    amount: 162_400,
    status: "pending",
    matchPct: 0,
  },
  {
    id: "INV-7824",
    invoice: "55104",
    supplier: "אטליר תעלות",
    project: "ב״ש נווה זאב",
    amount: 28_900,
    status: "matched",
    matchPct: 100,
  },
  {
    id: "INV-7825",
    invoice: "9921",
    supplier: "ברק אביזרי בנייה",
    project: "גינדי סביון",
    amount: 9_400,
    status: "matched",
    matchPct: 100,
  },
]

const SPEND_BARS = [
  { month: "ינואר", value: 620 },
  { month: "פברואר", value: 740 },
  { month: "מרץ", value: 880 },
  { month: "אפריל", value: 1_120 },
  { month: "מאי", value: 940 },
  { month: "יוני", value: 1_280 },
]

const STATUS_LABEL: Record<PendingInvoice["status"], string> = {
  matched: "תקינה",
  variance: "סטיית מחיר",
  pending: "ממתינה לקבלת טובין",
}

const STATUS_BADGE: Record<PendingInvoice["status"], string> = {
  matched:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  variance:
    "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  pending:
    "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300",
}

export function FinanceInvestorHero() {
  const maxBar = Math.max(...SPEND_BARS.map((b) => b.value))

  return (
    <section
      dir="rtl"
      className="relative mb-6 overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-6 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
      data-investor-pitch="finance-hero"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-gradient-to-br from-emerald-400/20 to-transparent blur-3xl"
      />

      <div className="relative mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1.5">
          <Badge
            variant="secondary"
            className="border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
          >
            <ClipboardCheck className="me-1 size-3" />
            Finance Command
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            תמונת מצב כספים — בזמן אמת
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            התאמות 3-Way Match אוטומטיות, זיהוי חריגות מחיר, וזרימת חיסכון
            מצטבר.
          </p>
        </div>
      </div>

      {/* KPI bento */}
      <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPIs.map((k) => (
          <Card
            key={k.label}
            className={cn(
              "relative overflow-hidden border-0 bg-gradient-to-br p-5 ring-1 shadow-sm bg-white dark:bg-slate-900",
              TONE[k.tone],
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium opacity-80">{k.label}</span>
              <span className="rounded-full bg-white p-1.5 ring-1 ring-slate-200 dark:bg-slate-950 dark:ring-slate-800">
                {k.icon}
              </span>
            </div>
            <div className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              {k.value}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {k.sub}
            </p>
          </Card>
        ))}
      </div>

      <div className="relative mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Pending invoices table */}
        <Card className="col-span-1 overflow-hidden border-slate-200 lg:col-span-2 dark:border-slate-800">
          <div className="border-b bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              חשבוניות ממתינות לאישור
            </h3>
            <p className="text-[11px] text-slate-500">
              סינון אוטומטי לפי 3-Way Match · מקור AI Reconciliation
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">חשבונית</TableHead>
                <TableHead className="text-right">ספק</TableHead>
                <TableHead className="text-right">פרויקט</TableHead>
                <TableHead className="text-right">סכום</TableHead>
                <TableHead className="text-right">התאמה</TableHead>
                <TableHead className="text-right">סטטוס</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PENDING_INVOICES.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">
                    {row.invoice}
                  </TableCell>
                  <TableCell>{row.supplier}</TableCell>
                  <TableCell className="text-slate-500">
                    {row.project}
                  </TableCell>
                  <TableCell className="font-medium">
                    {ILS.format(row.amount)}
                  </TableCell>
                  <TableCell className="w-32">
                    <div className="flex items-center gap-2">
                      <div className="relative h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-800">
                        <div
                          className={cn(
                            "absolute inset-y-0 right-0 rounded-full",
                            row.status === "matched"
                              ? "bg-emerald-500"
                              : row.status === "variance"
                                ? "bg-amber-500"
                                : "bg-slate-400",
                          )}
                          style={{ width: `${row.matchPct}%` }}
                        />
                      </div>
                      <span className="text-[11px] tabular-nums text-slate-600 dark:text-slate-400">
                        {row.matchPct}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("text-[11px]", STATUS_BADGE[row.status])}
                    >
                      {STATUS_LABEL[row.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Spend bar chart */}
        <Card className="overflow-hidden border-slate-200 dark:border-slate-800">
          <div className="border-b bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              הוצאות חודשיות
            </h3>
            <p className="text-[11px] text-slate-500">באלפי ₪ · 6 חודשים</p>
          </div>
          <div className="flex h-[280px] items-end justify-between gap-2 px-4 pb-4 pt-6">
            {SPEND_BARS.map((b) => {
              const h = Math.round((b.value / maxBar) * 100)
              return (
                <div
                  key={b.month}
                  className="group flex flex-1 flex-col items-center gap-2"
                >
                  <span className="text-[11px] font-medium tabular-nums text-slate-700 dark:text-slate-300">
                    {b.value}
                  </span>
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-emerald-500 to-cyan-400 transition-transform group-hover:scale-[1.02] dark:from-emerald-600 dark:to-cyan-500"
                    style={{ height: `${h}%`, minHeight: 12 }}
                  />
                  <span className="text-[10px] text-slate-500">{b.month}</span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </section>
  )
}
