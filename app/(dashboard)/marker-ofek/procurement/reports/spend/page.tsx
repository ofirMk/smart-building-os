"use client"

/**
 * Spend Analysis Cube — Phase 9.2
 *
 * Route: /marker-ofek/procurement/reports/spend
 *
 * Visualises procurement spend across dimensions:
 *   • By supplier  — horizontal bar chart (top 10)
 *   • By project   — horizontal bar chart
 *   • Monthly trend — area chart (12-month rolling)
 *   • Top categories (budget_sub_chapter) — donut chart
 *   • Maverick buying alert panel
 */

import * as React from "react"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
} from "recharts"
import { AlertTriangle, BarChart2, Building2, TrendingUp, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  formatNis,
  ReportEmptyState,
  ReportErrorState,
  ReportKpiCard,
  ReportShell,
  TAILWIND_COLORS,
  usePeriod,
} from "@/components/marker-ofek/procurement/reports/report-shell"
import type { SpendAnalysisDto } from "@/app/api/procurement/reports/spend/route"

async function fetchSpend(from: string, to: string): Promise<SpendAnalysisDto> {
  const res = await fetch(`/api/procurement/reports/spend?from=${from}&to=${to}`, {
    cache: "no-store",
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? "שגיאה בטעינת נתוני הוצאות")
  }
  const json = await res.json() as { data: SpendAnalysisDto }
  return json.data
}

export default function SpendAnalysisPage() {
  const { from, to, apply } = usePeriod()
  const [data, setData] = React.useState<SpendAnalysisDto | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setLoading(true)
    setError(null)
    fetchSpend(from, to)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [from, to])

  return (
    <ReportShell
      title="ניתוח הוצאות רכש"
      subtitle="פירוט לפי ספק, פרויקט וקטגוריה · זיהוי רכש ספוראדי"
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
        <SpendContent data={data} />
      )}
    </ReportShell>
  )
}

function SpendContent({ data }: { data: SpendAnalysisDto }) {
  const top10Suppliers = data.bySupplier.slice(0, 10)
  const top10Projects = data.byProject.slice(0, 10)
  const maverickPct =
    data.totalSpend > 0
      ? ((data.maverick.totalSpend / data.totalSpend) * 100).toFixed(1)
      : "0.0"
  const maverickSeverity =
    data.maverick.pctOfTotal >= 30 ? "destructive"
    : data.maverick.pctOfTotal >= 15 ? "secondary"
    : "outline"

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ReportKpiCard
          title="סה״כ הוצאות"
          value={formatNis(data.totalSpend, { compact: true })}
          sub={`${data.periodFrom} – ${data.periodTo}`}
          tone="info"
        />
        <ReportKpiCard
          title="ספקים פעילים"
          value={data.bySupplier.length.toLocaleString("he-IL")}
          sub="עם הזמנות מאושרות"
          tone="neutral"
        />
        <ReportKpiCard
          title="פרויקטים"
          value={data.byProject.length.toLocaleString("he-IL")}
          tone="neutral"
        />
        <ReportKpiCard
          title="רכש ספוראדי"
          value={`${maverickPct}%`}
          sub={`${formatNis(data.maverick.totalSpend, { compact: true })} ללא חוזה`}
          tone={data.maverick.pctOfTotal >= 30 ? "danger" : data.maverick.pctOfTotal >= 15 ? "warning" : "success"}
          trend={data.maverick.pctOfTotal > 0 ? "down" : "flat"}
        />
      </section>

      {/* Maverick alert */}
      {data.maverick.count > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              זוהה רכש ספוראדי ({data.maverick.count} הזמנות ·{" "}
              <Badge variant={maverickSeverity as "destructive" | "secondary" | "outline"} className="text-[11px]">
                {maverickPct}% מסה״כ
              </Badge>
              )
            </p>
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
              הזמנות אלו בוצעו ללא חוזה מסגרת. שקלו לאחד ספקים ראשיים לחוזה מסגרת לחיסכון.
            </p>
            {data.maverick.topSuppliers.length > 0 && (
              <p className="mt-1 text-xs text-amber-700">
                ספקים עיקריים:{" "}
                {data.maverick.topSuppliers
                  .slice(0, 3)
                  .map((s) => `${s.supplierName} (${formatNis(s.spend, { compact: true })})`)
                  .join(" · ")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Charts grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Monthly trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="size-4 text-muted-foreground" />
              מגמת הוצאות חודשית
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.monthly.length === 0 ? (
              <ReportEmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart
                  data={data.monthly}
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={TAILWIND_COLORS[0]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={TAILWIND_COLORS[0]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis
                    tickFormatter={(v: number) => formatNis(v, { compact: true })}
                    tick={{ fontSize: 11 }}
                    width={70}
                  />
                  <Tooltip
                    formatter={((v: number, ...rest: unknown[]) => [formatNis(v), "הוצאות"] as [string, string]) as never}
                    labelFormatter={((l: string) => `חודש: ${l}`) as never}
                  />
                  <Area
                    type="monotone"
                    dataKey="spend"
                    stroke={TAILWIND_COLORS[0]}
                    fill="url(#spendGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top suppliers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="size-4 text-muted-foreground" />
              הוצאות לפי ספק (עשרת הגדולים)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {top10Suppliers.length === 0 ? (
              <ReportEmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={top10Suppliers}
                  layout="vertical"
                  margin={{ right: 20, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v: number) => formatNis(v, { compact: true })}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    width={110}
                  />
                  <Tooltip formatter={(((v: number) => [formatNis(v), "הוצאות"]) as unknown as (v: number) => [string, string]) as never} />
                  <Bar dataKey="totalSpend" radius={[0, 4, 4, 0]}>
                    {top10Suppliers.map((_, i) => (
                      <Cell key={i} fill={TAILWIND_COLORS[i % TAILWIND_COLORS.length]!} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top projects */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Building2 className="size-4 text-muted-foreground" />
              הוצאות לפי פרויקט
            </CardTitle>
          </CardHeader>
          <CardContent>
            {top10Projects.length === 0 ? (
              <ReportEmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={top10Projects}
                  layout="vertical"
                  margin={{ right: 20, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v: number) => formatNis(v, { compact: true })}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    width={110}
                  />
                  <Tooltip formatter={(((v: number) => [formatNis(v), "הוצאות"]) as unknown as (v: number) => [string, string]) as never} />
                  <Bar dataKey="totalSpend" radius={[0, 4, 4, 0]} fill={TAILWIND_COLORS[4]!} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top categories table */}
      {data.topCategories.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">10 קטגוריות תקציב מובילות</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">קטגוריה</TableHead>
                  <TableHead className="text-right">הוצאות</TableHead>
                  <TableHead className="text-right">שורות PO</TableHead>
                  <TableHead className="text-right">% מסה״כ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topCategories.map((cat) => (
                  <TableRow key={cat.category}>
                    <TableCell className="font-medium">{cat.category}</TableCell>
                    <TableCell className="tabular-nums">{formatNis(cat.spend)}</TableCell>
                    <TableCell>{cat.poCount}</TableCell>
                    <TableCell>
                      {data.totalSpend > 0
                        ? `${((cat.spend / data.totalSpend) * 100).toFixed(1)}%`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
