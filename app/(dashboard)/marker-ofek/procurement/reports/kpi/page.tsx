"use client"

/**
 * Procurement KPI Dashboard — Phase 9.1
 *
 * Route: /marker-ofek/procurement/reports/kpi
 *
 * Four headline KPIs (top row, prominent):
 *   1. Avg PO approval time (median days)
 *   2. % POs on budget
 *   3. Cost savings vs list price
 *   4. % orders delivered on time
 *
 * Supporting charts:
 *   • PO status distribution (donut)
 *   • Framework vs. maverick spend (horizontal bar)
 *
 * Supplementary stat strip:
 *   • Total POs / Spend / Avg PO value / Draft backlog
 */

import * as React from "react"
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts"
import {
  BadgeCheck,
  BarChart2,
  Clock,
  PackageCheck,
  PiggyBank,
  ShoppingCart,
  Target,
  TrendingDown,
  Wallet,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  formatNis,
  ReportEmptyState,
  ReportErrorState,
  ReportShell,
  TAILWIND_COLORS,
  usePeriod,
} from "@/components/marker-ofek/procurement/reports/report-shell"
import type { ProcurementKpiDto } from "@/app/api/procurement/reports/kpi/route"

// ─────────────────────────────────────────────────────────────────────────────
// Data fetcher
// ─────────────────────────────────────────────────────────────────────────────

async function fetchKpi(from: string, to: string): Promise<ProcurementKpiDto> {
  const res = await fetch(
    `/api/procurement/reports/kpi?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { cache: "no-store" },
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? "שגיאה בטעינת KPI")
  }
  const json = await res.json() as { data: ProcurementKpiDto }
  return json.data
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ProcurementKpiPage() {
  const { from, to, apply } = usePeriod()
  const [data, setData] = React.useState<ProcurementKpiDto | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setLoading(true)
    setError(null)
    fetchKpi(from, to)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [from, to])

  return (
    <ReportShell
      title="לוח מדדי KPI — רכש"
      subtitle={`תקופה: ${from} – ${to}`}
      icon={<BarChart2 className="size-5" />}
      from={from}
      to={to}
      onApplyPeriod={apply}
      loading={loading}
    >
      {error ? (
        <ReportErrorState message={error} />
      ) : !data ? (
        <ReportEmptyState />
      ) : (
        <KpiContent data={data} />
      )}
    </ReportShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Headline KPI card — larger, with gauge ring
// ─────────────────────────────────────────────────────────────────────────────

type HeadlineTone = "success" | "warning" | "danger" | "neutral" | "info"

function headlineToneClasses(tone: HeadlineTone) {
  return {
    success: {
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      border: "border-emerald-200 dark:border-emerald-800",
      icon: "text-emerald-600 dark:text-emerald-400",
      value: "text-emerald-700 dark:text-emerald-300",
      badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
    },
    warning: {
      bg: "bg-amber-50 dark:bg-amber-950/30",
      border: "border-amber-200 dark:border-amber-800",
      icon: "text-amber-600 dark:text-amber-400",
      value: "text-amber-700 dark:text-amber-300",
      badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    },
    danger: {
      bg: "bg-rose-50 dark:bg-rose-950/30",
      border: "border-rose-200 dark:border-rose-800",
      icon: "text-rose-600 dark:text-rose-400",
      value: "text-rose-700 dark:text-rose-300",
      badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
    },
    neutral: {
      bg: "bg-slate-50 dark:bg-slate-900/30",
      border: "border-slate-200 dark:border-slate-700",
      icon: "text-slate-500 dark:text-slate-400",
      value: "text-slate-800 dark:text-slate-100",
      badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    },
    info: {
      bg: "bg-sky-50 dark:bg-sky-950/30",
      border: "border-sky-200 dark:border-sky-800",
      icon: "text-sky-600 dark:text-sky-400",
      value: "text-sky-700 dark:text-sky-300",
      badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
    },
  }[tone]
}

function HeadlineKpiCard({
  icon,
  title,
  value,
  description,
  badge,
  tone,
  pctFill,        // optional 0-100 for radial gauge
}: {
  icon: React.ReactNode
  title: string
  value: string
  description: string
  badge?: string
  tone: HeadlineTone
  pctFill?: number | null
}) {
  const cls = headlineToneClasses(tone)
  const gaugeData = [{ value: pctFill ?? 0, fill: GAUGE_FILL[tone] }]

  return (
    <Card className={cn("relative overflow-hidden border", cls.bg, cls.border)}>
      <CardContent className="flex items-start gap-4 p-5">
        {/* Left — gauge or icon block */}
        <div className="shrink-0">
          {pctFill !== undefined && pctFill !== null ? (
            <div className="relative size-[72px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  innerRadius="70%"
                  outerRadius="100%"
                  data={gaugeData}
                  startAngle={220}
                  endAngle={-40}
                  barSize={8}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar dataKey="value" background={{ fill: "hsl(var(--muted))" }} cornerRadius={4} />
                </RadialBarChart>
              </ResponsiveContainer>
              <span className={cn("absolute inset-0 flex items-center justify-center text-xs font-bold", cls.value)}>
                {Math.round(pctFill)}%
              </span>
            </div>
          ) : (
            <div className={cn("flex size-[72px] items-center justify-center rounded-xl border", cls.border, cls.bg)}>
              <span className={cn("size-7", cls.icon)}>{icon}</span>
            </div>
          )}
        </div>

        {/* Right — text */}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className={cn("mt-1 text-3xl font-bold tabular-nums leading-none", cls.value)}>
            {value}
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">{description}</p>
          {badge && (
            <span className={cn("mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", cls.badge)}>
              {badge}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

const GAUGE_FILL: Record<HeadlineTone, string> = {
  success: "#10b981",
  warning: "#f59e0b",
  danger:  "#ef4444",
  neutral: "#94a3b8",
  info:    "#0ea5e9",
}

// ─────────────────────────────────────────────────────────────────────────────
// KpiContent
// ─────────────────────────────────────────────────────────────────────────────

function KpiContent({ data }: { data: ProcurementKpiDto }) {
  // ── Derived values ────────────────────────────────────────────────────────
  const approvalTone: HeadlineTone =
    data.avgApprovalTimeDays === null ? "neutral"
    : data.avgApprovalTimeDays <= 3 ? "success"
    : data.avgApprovalTimeDays <= 7 ? "warning"
    : "danger"

  const budgetTone: HeadlineTone =
    data.pctPosOnBudget === null ? "neutral"
    : data.pctPosOnBudget >= 90 ? "success"
    : data.pctPosOnBudget >= 75 ? "warning"
    : "danger"

  const onTimeTone: HeadlineTone =
    data.pctDeliveredOnTime === null ? "neutral"
    : data.pctDeliveredOnTime >= 90 ? "success"
    : data.pctDeliveredOnTime >= 75 ? "warning"
    : "danger"

  // Status donut — filter zero slices, show a fallback for empty period
  const statusChartData = [
    { name: "טיוטה",        value: data.draftCount,     fill: TAILWIND_COLORS[6]! },
    { name: "ממתין לאישור", value: data.pendingCount,   fill: TAILWIND_COLORS[2]! },
    { name: "אושר / הונפק", value: Math.max(0, data.approvedCount - data.closedCount), fill: TAILWIND_COLORS[0]! },
    { name: "נסגר",         value: data.closedCount,    fill: TAILWIND_COLORS[1]! },
    { name: "בוטל",         value: data.cancelledCount, fill: TAILWIND_COLORS[3]! },
  ].filter((d) => d.value > 0)

  // Framework vs. maverick spend
  const contractSpend = Math.max(0, data.totalSpend - data.maverickSpend)
  const spendBreakdown = [
    { name: "מסגרת / שיחרורי", value: contractSpend,      fill: TAILWIND_COLORS[1]! },
    { name: "ספוראדי",          value: data.maverickSpend, fill: TAILWIND_COLORS[3]! },
  ]
  const maverickPct =
    data.totalSpend > 0
      ? ((data.maverickSpend / data.totalSpend) * 100).toFixed(1)
      : null

  return (
    <div className="space-y-6">

      {/* ═══════════════════════════════════════════════════════════════════
          Section 1 — Four Headline KPIs
          ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          מדדי מפתח
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">

          {/* KPI 1 — Avg approval time */}
          <HeadlineKpiCard
            icon={<Clock className="size-7" />}
            title="זמן אישור חציוני"
            value={data.avgApprovalTimeDays !== null ? `${data.avgApprovalTimeDays}` : "—"}
            description={
              data.avgApprovalTimeDays !== null
                ? `ימים מיצירה לאישור ראשון (חציון על ${data.approvedCount} הזמנות)`
                : "אין הזמנות שהגיעו לאישור בתקופה"
            }
            badge={
              data.avgApprovalTimeDays !== null
                ? approvalTone === "success" ? "מהיר ✓"
                : approvalTone === "warning" ? "סביר"
                : "איטי"
                : undefined
            }
            tone={approvalTone}
          />

          {/* KPI 2 — % on budget */}
          <HeadlineKpiCard
            icon={<Target className="size-7" />}
            title="הזמנות בתקציב"
            value={data.pctPosOnBudget !== null ? `${data.pctPosOnBudget}%` : "—"}
            description={`ללא חריגת סף מחיר. דוגם ${(data.approvedCount ?? 0)} הזמנות אושרו/נסגרו`}
            badge={
              data.pctPosOnBudget !== null
                ? budgetTone === "success" ? "מצוין ✓"
                : budgetTone === "warning" ? "לשיפור"
                : "דורש טיפול"
                : undefined
            }
            tone={budgetTone}
            pctFill={data.pctPosOnBudget}
          />

          {/* KPI 3 — Cost savings */}
          <HeadlineKpiCard
            icon={<PiggyBank className="size-7" />}
            title="חיסכון עלות מחיר שוק"
            value={formatNis(data.costSavingsAmount, { compact: true })}
            description="סכום השורות שנרכשו מתחת למחיר הרשימה (סטיית מחיר שלילית)"
            badge={data.costSavingsAmount > 0 ? "חיסכון ✓" : undefined}
            tone={data.costSavingsAmount > 0 ? "success" : "neutral"}
          />

          {/* KPI 4 — On-time delivery */}
          <HeadlineKpiCard
            icon={<PackageCheck className="size-7" />}
            title="אספקה בזמן"
            value={data.pctDeliveredOnTime !== null ? `${data.pctDeliveredOnTime}%` : "—"}
            description={
              data.pctDeliveredOnTime !== null
                ? "אחוז ה-POs שהתקבלו עד תאריך האספקה המבוקש"
                : "אין הזמנות נסגרות עם תאריך אספקה בתקופה"
            }
            badge={
              data.pctDeliveredOnTime !== null
                ? onTimeTone === "success" ? "בזמן ✓"
                : onTimeTone === "warning" ? "לשיפור"
                : "עיכובים"
                : undefined
            }
            tone={onTimeTone}
            pctFill={data.pctDeliveredOnTime}
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          Section 2 — Volume summary strip
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatMiniCard
          icon={<ShoppingCart className="size-3.5" />}
          label="סה״כ הזמנות"
          value={data.totalPOs.toLocaleString("he-IL")}
          sub={`מתוכן ${data.releaseOrderCount} שיחרורי מסגרת`}
        />
        <StatMiniCard
          icon={<Wallet className="size-3.5" />}
          label="סה״כ הוצאות מחויבות"
          value={formatNis(data.totalSpend, { compact: true })}
          sub={`ממוצע PO: ${data.avgPoValue !== null ? formatNis(data.avgPoValue, { compact: true }) : "—"}`}
        />
        <StatMiniCard
          icon={<TrendingDown className="size-3.5 text-amber-500" />}
          label="רכש ספוראדי"
          value={`${data.maverickCount} POs`}
          sub={maverickPct !== null ? `${maverickPct}% מסה״כ הוצאות` : "אין נתון"}
          subClassName={maverickPct !== null && Number(maverickPct) > 30 ? "text-amber-600" : undefined}
        />
        <StatMiniCard
          icon={<BadgeCheck className="size-3.5 text-emerald-500" />}
          label="טיוטות פתוחות"
          value={data.draftCount.toLocaleString("he-IL")}
          sub={`${data.cancelledCount} בוטלו בתקופה`}
        />
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          Section 3 — Charts
          ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          ניתוח גרפי
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">

          {/* Chart A — Status donut */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <ShoppingCart className="size-4 text-muted-foreground" />
                התפלגות סטטוס הזמנות
              </CardTitle>
              <CardDescription className="text-[11px]">
                {data.totalPOs} הזמנות סה״כ בתקופה
              </CardDescription>
            </CardHeader>
            <CardContent>
              {statusChartData.length === 0 ? (
                <ReportEmptyState message="אין הזמנות בתקופה הנבחרת" />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="46%"
                      innerRadius={72}
                      outerRadius={115}
                      paddingAngle={2}
                      dataKey="value"
                      label={(({ name, percent }: { name: string; percent: number }) =>
                        percent > 0.06 ? `${(percent * 100).toFixed(0)}%` : "") as never}
                      labelLine={false}
                    >
                      {statusChartData.map((entry, i) => (
                        <Cell
                          key={entry.name}
                          fill={entry.fill ?? TAILWIND_COLORS[i % TAILWIND_COLORS.length]!}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={((val: number) => [
                        `${val.toLocaleString("he-IL")} הזמנות`,
                      ]) as never}
                    />
                    <Legend
                      iconSize={10}
                      formatter={(value: string) => (
                        <span className="text-[11px] text-foreground">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Chart B — Framework vs. maverick spend */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Wallet className="size-4 text-muted-foreground" />
                הוצאות: מסגרת חוזה vs. ספוראדי
              </CardTitle>
              <CardDescription className="text-[11px]">
                {maverickPct !== null
                  ? `${maverickPct}% מהוצאות ללא מסגרת — יעד: מתחת ל-20%`
                  : "אין נתון הוצאות לתקופה"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={spendBreakdown}
                  layout="vertical"
                  margin={{ top: 10, right: 40, left: 10, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis
                    type="number"
                    tickFormatter={(v: number) => formatNis(v, { compact: true })}
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    width={130}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={((val: number) => [
                      formatNis(val),
                      "הוצאות",
                    ]) as never}
                    cursor={{ fill: "hsl(var(--muted))" }}
                  />
                  <Bar dataKey="value" radius={[0, 5, 5, 0]} maxBarSize={52}>
                    {spendBreakdown.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// StatMiniCard — compact supporting stat
// ─────────────────────────────────────────────────────────────────────────────

function StatMiniCard({
  icon,
  label,
  value,
  sub,
  subClassName,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  subClassName?: string
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1.5 text-2xl font-bold tabular-nums">{value}</p>
      {sub && (
        <p className={cn("mt-0.5 text-[11px] text-muted-foreground", subClassName)}>{sub}</p>
      )}
    </Card>
  )
}
