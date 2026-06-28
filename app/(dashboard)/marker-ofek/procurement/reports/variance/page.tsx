"use client"

/**
 * Price Variance Report — Phase 9.4
 *
 * Route: /marker-ofek/procurement/reports/variance
 *
 * Identifies PO lines where the actual unit price deviates from a benchmark
 * (market price or contract locked price) by more than the selected threshold.
 *
 * Sections:
 *   • Threshold selector
 *   • Summary KPI cards
 *   • Histogram bar chart
 *   • Variance rows table — color-coded deviation, source badge
 */

import * as React from "react"
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { AlertTriangle, TrendingDown, TrendingUp, DollarSign } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  formatPct,
  ReportEmptyState,
  ReportErrorState,
  ReportKpiCard,
  ReportShell,
  TAILWIND_COLORS,
  usePeriod,
} from "@/components/marker-ofek/procurement/reports/report-shell"
import type { VarianceSummaryDto } from "@/app/api/procurement/reports/variance/route"

// ─────────────────────────────────────────────────────────────────────────────

const THRESHOLDS = [5, 10, 20]

async function fetchVariance(
  from: string,
  to: string,
  threshold: number,
): Promise<VarianceSummaryDto> {
  const res = await fetch(
    `/api/procurement/reports/variance?from=${from}&to=${to}&threshold=${threshold}`,
    { cache: "no-store" },
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? "שגיאה בטעינת דו״ח סטיות מחיר")
  }
  const json = await res.json() as { data: VarianceSummaryDto }
  return json.data
}

// ─────────────────────────────────────────────────────────────────────────────

export default function VarianceReportPage() {
  const { from, to, apply } = usePeriod()
  const [threshold, setThreshold] = React.useState(5)
  const [data, setData] = React.useState<VarianceSummaryDto | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setLoading(true)
    setError(null)
    fetchVariance(from, to, threshold)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [from, to, threshold])

  return (
    <ReportShell
      title="דו״ח סטיות מחיר"
      subtitle="שורות PO בהן המחיר החורג ממחיר שוק או ממחיר חוזה מעל לסף הנבחר"
      icon={<DollarSign className="size-5" />}
      from={from}
      to={to}
      onApplyPeriod={apply}
      loading={loading}
    >
      {/* Threshold selector — always visible */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">סף סטייה:</span>
        {THRESHOLDS.map((t) => (
          <Button
            key={t}
            variant={threshold === t ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setThreshold(t)}
          >
            {t}%+
          </Button>
        ))}
      </div>

      {error ? (
        <ReportErrorState message={error} />
      ) : !data ? (
        <ReportEmptyState />
      ) : (
        <VarianceContent data={data} />
      )}
    </ReportShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function VarianceContent({ data }: { data: VarianceSummaryDto }) {
  const { summary, histogram, rows } = data

  return (
    <div className="space-y-6">
      {/* ── KPI strip ───────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ReportKpiCard
          title="שורות חריגות"
          value={summary.totalLines.toLocaleString("he-IL")}
          sub={`סף: ${data.threshold}%`}
          tone={summary.totalLines > 0 ? "warning" : "success"}
        />
        <ReportKpiCard
          title="שורות יקרות מהשוק"
          value={summary.overpriceLines.toLocaleString("he-IL")}
          sub={formatNis(summary.totalOverVarianceAmount, { compact: true }) + " חוסר חיסכון"}
          tone={summary.overpriceLines > 0 ? "danger" : "success"}
          trend={summary.overpriceLines > 0 ? "down" : "flat"}
        />
        <ReportKpiCard
          title="שורות מתחת לשוק"
          value={summary.underpriceLines.toLocaleString("he-IL")}
          sub={formatNis(summary.totalUnderVarianceAmount, { compact: true }) + " חיסכון"} 
          tone="success"
          trend={summary.underpriceLines > 0 ? "up" : "flat"}
        />
        <ReportKpiCard
          title="סטייה גרועה ביותר"
          value={summary.worstVariancePct !== null ? formatPct(summary.worstVariancePct) : "—"}
          sub="מהמחיר הייחוסי"
          tone={
            summary.worstVariancePct === null ? "neutral"
            : Math.abs(summary.worstVariancePct) > 50 ? "danger"
            : Math.abs(summary.worstVariancePct) > 20 ? "warning"
            : "neutral"
          }
        />
      </section>

      {/* ── Histogram ───────────────────────────────────────────────────── */}
      {histogram.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">התפלגות סטיות — לפי טווח אחוז</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={histogram}
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  formatter={((v: number, name: string, ...rest: unknown[]) =>
                    name === "count" ? [v, "שורות"] : [formatNis(v), "סטייה כוללת"]
                  ) as never}
                />
                <Bar dataKey="count" name="count" radius={[4, 4, 0, 0]}>
                  {histogram.map((_, i) => (
                    <Cell key={i} fill={TAILWIND_COLORS[i % TAILWIND_COLORS.length]!} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Variance rows table ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="size-4 text-amber-500" />
            שורות חריגות ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <ReportEmptyState message="אין שורות חריגות בתקופה ובסף הנבחרים" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">PO</TableHead>
                  <TableHead className="text-right">תיאור</TableHead>
                  <TableHead className="text-right">ספק</TableHead>
                  <TableHead className="text-right">מקור</TableHead>
                  <TableHead className="text-left">מחיר בפועל</TableHead>
                  <TableHead className="text-left">מחיר ייחוס</TableHead>
                  <TableHead className="text-left">סטייה %</TableHead>
                  <TableHead className="text-left">סכום חריגה</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const isOver = row.variancePct > 0
                  const severity =
                    Math.abs(row.variancePct) > 50
                      ? "bg-rose-100 dark:bg-rose-950/40"
                      : Math.abs(row.variancePct) > 20
                        ? "bg-amber-50 dark:bg-amber-950/30"
                        : ""
                  return (
                    <TableRow key={`${row.lineId}-${row.source}`} className={severity}>
                      <TableCell className="font-mono text-xs">{row.poNumber}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs">
                        {row.description}
                      </TableCell>
                      <TableCell className="text-xs">{row.supplierName}</TableCell>
                      <TableCell>
                        <Badge
                          variant={row.source === "CONTRACT_PRICE" ? "secondary" : "outline"}
                          className="text-[10px]"
                        >
                          {row.source === "CONTRACT_PRICE" ? "חוזה" : "שוק"}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums text-left">
                        {formatNis(row.actualUnitPrice)}
                      </TableCell>
                      <TableCell className="tabular-nums text-left text-muted-foreground">
                        {formatNis(row.benchmarkUnitPrice)}
                      </TableCell>
                      <TableCell className="text-left">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold tabular-nums ${
                            isOver ? "text-rose-600" : "text-emerald-600"
                          }`}
                        >
                          {isOver ? (
                            <TrendingUp className="size-3" />
                          ) : (
                            <TrendingDown className="size-3" />
                          )}
                          {formatPct(row.variancePct)}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums text-left">
                        {formatNis(row.varianceAmount)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
