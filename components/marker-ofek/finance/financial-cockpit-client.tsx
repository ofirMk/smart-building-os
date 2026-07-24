"use client"

/**
 * FinancialCockpitClient — the Sprint T8 executive financial cockpit.
 *
 * Renders 4 KPI cards (AR Open, AR Overdue, AP Open, Cash on Hand), a wide
 * composed cash-flow chart (90/30/180-day range), a Top Debtors table, and
 * an Aging buckets bar chart.
 *
 * Two modes:
 *   - Full (default)        — used on /marker-ofek/finance/dashboard.
 *   - compact={true}        — KPI cards + cash-flow chart only. Used by the
 *                             pitch lobby investor command-center.
 *
 * Real data flows in via initial props (server-rendered) + a re-fetch on
 * range change via the t8 server actions (RSC-safe).
 */

import * as React from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Download,
  Loader2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react"
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  getCashFlowSeriesAction,
  type AgingBuckets,
  type CashFlowPoint,
  type CockpitKpis,
  type TopDebtorRow,
} from "@/lib/marker-ofek/finance/t8-cockpit-actions"

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

const ILS_PRECISE = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
})

const DATE_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
})

function formatDateHe(iso: string): string {
  try {
    return DATE_FMT.format(new Date(`${iso}T00:00:00`))
  } catch {
    return iso
  }
}

export interface FinancialCockpitClientProps {
  companyId: string
  initialKpis: CockpitKpis | null
  initialSeries: CashFlowPoint[]
  debtors: TopDebtorRow[]
  aging: AgingBuckets
  compact?: boolean
}

const RANGE_OPTIONS = [
  { value: 30, label: "30 ימים" },
  { value: 90, label: "90 ימים" },
  { value: 180, label: "180 ימים" },
] as const

export function FinancialCockpitClient({
  companyId,
  initialKpis,
  initialSeries,
  debtors,
  aging,
  compact = false,
}: FinancialCockpitClientProps) {
  const [days, setDays] = React.useState<30 | 90 | 180>(90)
  const [series, setSeries] = React.useState<CashFlowPoint[]>(initialSeries)
  const [loadingSeries, setLoadingSeries] = React.useState(false)

  React.useEffect(() => {
    if (days === 90) {
      setSeries(initialSeries)
      return
    }
    let cancelled = false
    setLoadingSeries(true)
    getCashFlowSeriesAction({ companyId, days })
      .then((res) => {
        if (cancelled) return
        if (res.ok) setSeries(res.data)
      })
      .finally(() => {
        if (!cancelled) setLoadingSeries(false)
      })
    return () => {
      cancelled = true
    }
  }, [days, companyId, initialSeries])

  const kpis = initialKpis
  const hasAnyData =
    !!kpis &&
    (kpis.arOpenTotal > 0 ||
      kpis.apOpenTotal > 0 ||
      kpis.arInvoiceCount > 0 ||
      series.some((p) => p.inflow > 0 || p.outflow > 0))

  // -------------------------------------------------------------------------
  // CSV export
  // -------------------------------------------------------------------------
  function exportCsv() {
    const lines = ["date,inflow,outflow,net,cumulative"]
    for (const p of series) {
      lines.push(`${p.date},${p.inflow},${p.outflow},${p.net},${p.cumulative}`)
    }
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `cash-flow-${days}d-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div dir="rtl" className="space-y-6">
      {/* Row 1 — KPI cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          tone="rose"
          icon={<TrendingUp className="size-5" />}
          label="חובות לקוחות פתוחים (AR)"
          value={ILS.format(kpis?.arOpenTotal ?? 0)}
          hint={
            kpis
              ? `${kpis.arInvoiceCount} חשבוניות פתוחות`
              : "טוען…"
          }
        />
        <KpiCard
          tone="amber"
          icon={<AlertTriangle className="size-5" />}
          label="חובות בפיגור"
          value={ILS.format(kpis?.arOverdueTotal ?? 0)}
          hint={
            kpis && kpis.arOpenTotal > 0
              ? `${Math.round(
                  (kpis.arOverdueTotal / kpis.arOpenTotal) * 100,
                )}% מסך החוב`
              : "אין פיגורים"
          }
        />
        <KpiCard
          tone="sky"
          icon={<TrendingDown className="size-5" />}
          label="זכאים פתוחים (AP)"
          value={ILS.format(kpis?.apOpenTotal ?? 0)}
          hint={
            kpis
              ? `${kpis.apBillCount} ${
                  kpis.apSource === "PURCHASE_ORDERS_FALLBACK"
                    ? "הזמנות פתוחות (Fallback)"
                    : "חשבוניות ספקים"
                }`
              : "טוען…"
          }
        />
        <KpiCard
          tone="emerald"
          icon={<Wallet className="size-5" />}
          label="מזומן ביד (YTD)"
          value={ILS.format(kpis?.cashOnHand ?? 0)}
          hint="תקבולים − תשלומים מתחילת השנה"
          glow={(kpis?.cashOnHand ?? 0) > 0}
        />
      </div>

      {/* Row 2 — Cash-flow chart */}
      <Card className="space-y-3 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground">
              תזרים מזומנים — {days} ימים אחרונים
            </h2>
            <p className="text-xs text-muted-foreground">
              תקבולים מ-AR Receipts מול תשלומים ל-AP Payments, יתרה
              מצטברת על-פני הזמן.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-border bg-background p-0.5">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDays(opt.value)}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium transition",
                    days === opt.value
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-muted-foreground hover:bg-slate-100",
                  )}
                  aria-pressed={days === opt.value}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {kpis ? (
              <Badge
                variant="outline"
                className="border-indigo-300 bg-indigo-50 font-mono text-indigo-800"
                title="Days Sales Outstanding"
              >
                DSO {kpis.dso} ימים
              </Badge>
            ) : null}
            {!compact ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={exportCsv}
                disabled={series.length === 0}
              >
                <Download className="size-3.5" aria-hidden />
                CSV
              </Button>
            ) : null}
          </div>
        </div>

        <div
          className="relative h-[300px] w-full md:h-[380px]"
          role="img"
          aria-label={`גרף תזרים מזומנים ל-${days} הימים האחרונים`}
        >
          {loadingSeries ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/60">
              <Loader2 className="size-5 animate-spin text-indigo-600" aria-hidden />
            </div>
          ) : null}
          {series.length === 0 ? (
            <EmptyCashFlow />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={series}
                margin={{ top: 12, right: 16, bottom: 6, left: 8 }}
              >
                <defs>
                  <linearGradient id="t8CumGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#475569" }}
                  tickFormatter={formatDateHe}
                  minTickGap={24}
                  reversed
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#475569" }}
                  width={70}
                  tickFormatter={(v: number) =>
                    Math.abs(v) >= 1000
                      ? `${Math.round(v / 1000)}K`
                      : String(Math.round(v))
                  }
                  orientation="right"
                />
                <Tooltip
                  content={<CashFlowTooltip />}
                  wrapperStyle={{ direction: "rtl" }}
                />
                <Legend
                  formatter={(v: string) => LEGEND_LABEL[v] ?? v}
                  wrapperStyle={{ fontSize: 12, direction: "rtl" }}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  fill="url(#t8CumGrad)"
                  name="cumulative"
                />
                <Bar dataKey="inflow" name="inflow" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="outflow" name="outflow" fill="#f43f5e" radius={[3, 3, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Row 3 — Top debtors + Aging (full mode only) */}
      {!compact ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="space-y-3 p-4 md:p-5">
            <div>
              <h2 className="text-base font-bold text-foreground">
                לקוחות עם החוב הגבוה ביותר
              </h2>
              <p className="text-xs text-muted-foreground">
                Top 5 לקוחות חייבים — לפי סך חוב פתוח על חשבוניות מס סגורות.
              </p>
            </div>
            {debtors.length === 0 ? (
              <EmptyState message="אין חובות פתוחים כרגע — מצוין!" />
            ) : (
              <TopDebtorsTable debtors={debtors} />
            )}
          </Card>

          <Card className="space-y-3 p-4 md:p-5">
            <div>
              <h2 className="text-base font-bold text-foreground">
                גיול חובות (Aging)
              </h2>
              <p className="text-xs text-muted-foreground">
                פילוח חוב פתוח לפי תקופות פיגור מתאריך הפירעון.
              </p>
            </div>
            <AgingBucketsChart aging={aging} />
          </Card>
        </div>
      ) : null}

      {/* Row 4 — actions */}
      {!compact ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            הנתונים נטענים מ-Supabase בזמן אמת. לרענון הקש F5 או החלף טווח.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              render={
                <Link href="/marker-ofek/finance/tax-invoices">חשבוניות מס</Link>
              }
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              render={<a href="/marker-ofek/finance/receipts">תקבולים</a>}
            />
            <Button
              type="button"
              size="sm"
              render={<a href="/marker-ofek/pitch">הצג בלובי משקיעים</a>}
            />
          </div>
        </div>
      ) : null}

      {!hasAnyData && !compact ? (
        <Card className="border-dashed bg-slate-50 p-6 text-center">
          <p className="text-sm font-semibold text-slate-800">
            עדיין אין מספיק נתונים פיננסיים להצגה.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            הפק חשבונית מס ראשונה כדי להתחיל לצבור AR ולראות את הדשבורד מתעורר לחיים.
          </p>
          <div className="mt-3 flex justify-center">
            <Button
              size="sm"
              render={
                <Link href="/marker-ofek/finance/tax-invoices/new">
                  הפק חשבונית מס חדשה
                </Link>
              }
            />
          </div>
        </Card>
      ) : null}
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

const TONE_CLASS = {
  rose: "from-rose-500/10 to-transparent ring-rose-200",
  amber: "from-amber-500/10 to-transparent ring-amber-200",
  sky: "from-sky-500/10 to-transparent ring-sky-200",
  emerald: "from-emerald-500/15 to-transparent ring-emerald-300",
  indigo: "from-indigo-500/10 to-transparent ring-indigo-200",
} as const

const TONE_TEXT = {
  rose: "text-rose-700",
  amber: "text-amber-700",
  sky: "text-sky-700",
  emerald: "text-emerald-700",
  indigo: "text-indigo-700",
} as const

function KpiCard({
  tone,
  icon,
  label,
  value,
  hint,
  glow = false,
}: {
  tone: keyof typeof TONE_CLASS
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  glow?: boolean
}) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden border-0 bg-gradient-to-br p-4 shadow-sm ring-1",
        TONE_CLASS[tone],
        "bg-card",
      )}
    >
      {glow ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-pulse bg-emerald-400/10"
        />
      ) : null}
      <div className="relative space-y-1.5">
        <div className={cn("flex items-center gap-2", TONE_TEXT[tone])}>
          <span aria-hidden>{icon}</span>
          <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
        </div>
        <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
          {value}
        </p>
        {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
    </Card>
  )
}

const LEGEND_LABEL: Record<string, string> = {
  cumulative: "יתרה מצטברת",
  inflow: "תקבולים",
  outflow: "תשלומים",
}

interface RechartsTooltipProps {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number; color: string }>
  label?: string
}

function CashFlowTooltip({ active, payload, label }: RechartsTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div
      dir="rtl"
      className="rounded-md border border-border bg-card/95 px-3 py-2 text-xs shadow-md backdrop-blur"
    >
      <p className="mb-1.5 font-mono text-[11px] text-muted-foreground">
        {label ? formatDateHe(label) : ""}
      </p>
      <div className="space-y-0.5">
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center gap-2 font-mono">
            <span
              aria-hidden
              className="size-2 rounded-sm"
              style={{ backgroundColor: p.color }}
            />
            <span className="min-w-[80px] text-foreground">
              {LEGEND_LABEL[p.dataKey] ?? p.dataKey}
            </span>
            <span className="tabular-nums font-semibold">
              {ILS_PRECISE.format(p.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyCashFlow() {
  return (
    <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border bg-slate-50 text-center text-xs text-muted-foreground">
      <div className="px-6">
        <p className="font-semibold text-slate-700">אין תנועות תזרים בטווח שנבחר.</p>
        <p className="mt-1">קלוט תקבול מלקוח או הרץ Payment Run כדי להזין נתונים.</p>
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-slate-50 p-6 text-center text-xs text-muted-foreground">
      {message}
    </div>
  )
}

function TopDebtorsTable({ debtors }: { debtors: TopDebtorRow[] }) {
  const max = Math.max(...debtors.map((d) => d.openAmount), 1)
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-start font-semibold">לקוח</th>
            <th className="px-3 py-2 text-end font-semibold">חוב פתוח</th>
            <th className="hidden px-3 py-2 text-end font-semibold sm:table-cell">
              בפיגור
            </th>
            <th className="px-3 py-2 text-end font-semibold">#חשבוניות</th>
          </tr>
        </thead>
        <tbody>
          {debtors.map((d) => {
            const pct = Math.round((d.openAmount / max) * 100)
            return (
              <tr
                key={(d.customerId ?? d.name) + d.invoiceCount}
                className="border-t border-border align-middle"
              >
                <td className="px-3 py-2">
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">{d.name}</p>
                    <div
                      className="h-1.5 w-full overflow-hidden rounded bg-slate-100"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full bg-gradient-to-r from-rose-500 to-rose-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-end font-mono tabular-nums font-semibold text-rose-700">
                  {ILS.format(d.openAmount)}
                </td>
                <td className="hidden px-3 py-2 text-end font-mono tabular-nums text-amber-700 sm:table-cell">
                  {d.overdueAmount > 0 ? ILS.format(d.overdueAmount) : "—"}
                </td>
                <td className="px-3 py-2 text-end font-mono tabular-nums text-muted-foreground">
                  {d.invoiceCount}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AgingBucketsChart({ aging }: { aging: AgingBuckets }) {
  const rows = [
    { key: "current", label: "שוטף", value: aging.current, color: "#10b981" },
    { key: "d1_30", label: "1-30 ימים", value: aging.d1_30, color: "#facc15" },
    { key: "d31_60", label: "31-60 ימים", value: aging.d31_60, color: "#f97316" },
    { key: "d61_90", label: "61-90 ימים", value: aging.d61_90, color: "#ef4444" },
    { key: "d90plus", label: "+90 ימים", value: aging.d90plus, color: "#991b1b" },
  ]
  const total = rows.reduce((s, r) => s + r.value, 0)
  if (total <= 0) {
    return <EmptyState message="אין חוב פתוח לפי תאריך פירעון." />
  }
  return (
    <div className="space-y-3">
      {/* Stacked bar */}
      <div
        className="flex h-6 w-full overflow-hidden rounded-md ring-1 ring-border"
        role="img"
        aria-label="גיול חובות חזותי"
      >
        {rows.map((r) =>
          r.value > 0 ? (
            <div
              key={r.key}
              className="flex items-center justify-center text-[10px] font-bold text-white"
              style={{
                width: `${(r.value / total) * 100}%`,
                backgroundColor: r.color,
              }}
              title={`${r.label}: ${ILS.format(r.value)}`}
            >
              {(r.value / total) * 100 >= 8
                ? `${Math.round((r.value / total) * 100)}%`
                : ""}
            </div>
          ) : null,
        )}
      </div>

      {/* Legend table */}
      <table className="w-full text-xs">
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border last:border-0">
              <td className="py-1.5">
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-3 rounded-sm"
                    style={{ backgroundColor: r.color }}
                  />
                  <span className="font-medium text-foreground">{r.label}</span>
                </span>
              </td>
              <td className="py-1.5 text-end font-mono tabular-nums text-foreground">
                {ILS.format(r.value)}
              </td>
              <td className="py-1.5 text-end font-mono tabular-nums text-muted-foreground">
                {total > 0 ? `${Math.round((r.value / total) * 100)}%` : "—"}
              </td>
            </tr>
          ))}
          <tr className="bg-slate-50 font-semibold">
            <td className="py-2">סך הכל</td>
            <td className="py-2 text-end font-mono tabular-nums">
              {ILS.format(total)}
            </td>
            <td className="py-2 text-end font-mono tabular-nums">100%</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

