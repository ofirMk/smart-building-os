"use client"

/**
 * Open Orders Aging Report — Phase 9.3
 *
 * Route: /marker-ofek/procurement/reports/aging
 *
 * Surfaces outstanding purchase orders bucketed by age (days since created):
 *   0-30   — fresh / within SLA (green)
 *   31-60  — approaching attention (yellow)
 *   61-90  — overdue (orange)
 *   90+    — escalation required (red)
 *
 * Shows:
 *   • 4 KPI cards with bucket summary
 *   • Bar chart of bucket exposure (₪)
 *   • Expandable table of individual PO rows sorted by age desc
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
import { AlertOctagon, Clock } from "lucide-react"

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
  usePeriod,
} from "@/components/marker-ofek/procurement/reports/report-shell"
import type { AgingReportDto, AgingRow } from "@/app/api/procurement/reports/aging/route"

// ─────────────────────────────────────────────────────────────────────────────

const BUCKET_META: Record<string, { label: string; color: string; badge: "default" | "secondary" | "outline" | "destructive" }> = {
  "0-30":  { label: "0–30 ימים",  color: "#22c55e", badge: "outline" },
  "31-60": { label: "31–60 ימים", color: "#eab308", badge: "secondary" },
  "61-90": { label: "61–90 ימים", color: "#f97316", badge: "secondary" },
  "90+":   { label: "91+ ימים",   color: "#ef4444", badge: "destructive" },
}

const BUCKET_KEYS: Array<keyof AgingReportDto["buckets"]> = ["0-30", "31-60", "61-90", "90+"]

async function fetchAging(): Promise<AgingReportDto> {
  const res = await fetch(`/api/procurement/reports/aging`, { cache: "no-store" })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? "שגיאה בטעינת נתוני גיל הזמנות")
  }
  const json = await res.json() as { data: AgingReportDto }
  return json.data
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AgingReportPage() {
  const { from, to, apply } = usePeriod()
  const [data, setData] = React.useState<AgingReportDto | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [expandedBucket, setExpandedBucket] = React.useState<string | null>(null)

  React.useEffect(() => {
    setLoading(true)
    setError(null)
    fetchAging()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [from, to]) // re-fetch when period applied (note: API uses current state, period shown for context)

  return (
    <ReportShell
      title="דו״ח גיל הזמנות פתוחות"
      subtitle="מציג את כל ה-POs הפתוחים ממוינים לפי ותק · עדכני נכון לעכשיו"
      icon={<Clock className="size-5" />}
      from={from}
      to={to}
      onApplyPeriod={apply}
      loading={loading}
    >
      {error ? (
        <ReportErrorState message={error} />
      ) : !data ? (
        <ReportEmptyState />
      ) : data.totalOpenCount === 0 ? (
        <ReportEmptyState message="אין הזמנות פתוחות כרגע 🎉" />
      ) : (
        <AgingContent
          data={data}
          expandedBucket={expandedBucket}
          onToggle={(bucket) =>
            setExpandedBucket((prev) => (prev === bucket ? null : bucket))
          }
        />
      )}
    </ReportShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function AgingContent({
  data,
  expandedBucket,
  onToggle,
}: {
  data: AgingReportDto
  expandedBucket: string | null
  onToggle: (bucket: string) => void
}) {
  const bucketsArray = BUCKET_KEYS.map((k) => ({ key: k, ...data.buckets[k] }))

  const chartData = bucketsArray.map((b) => ({
    label: BUCKET_META[b.key]?.label ?? b.key,
    exposure: b.totalExposure,
    fill: BUCKET_META[b.key]?.color ?? "#94a3b8",
  }))

  // Rows for expanded bucket
  const expandedRows: AgingRow[] =
    expandedBucket !== null
      ? (data.buckets[expandedBucket as keyof AgingReportDto["buckets"]]?.rows ?? [])
      : []

  return (
    <div className="space-y-6">
      {/* ── Escalation banner for 90+ ───────────────────────────────────── */}
      {data.buckets["90+"].count > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-rose-300 bg-rose-50 p-4 dark:border-rose-700 dark:bg-rose-950/30">
          <AlertOctagon className="mt-0.5 size-5 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
              {data.buckets["90+"].count} הזמנות ממתינות מעל 90 יום —
              נדרשת הסלמה
            </p>
            <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-300">
              הגיל הגבוה ביותר: {data.oldestAgeDays} ימים ·{" "}
              חשיפה כוללת:{" "}
              {formatNis(data.buckets["90+"].totalExposure)}
            </p>
          </div>
        </div>
      )}

      {/* ── KPI cards ───────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {bucketsArray.map((bucket) => {
          const meta = BUCKET_META[bucket.key]
          return (
            <button
              key={bucket.key}
              type="button"
              onClick={() => onToggle(bucket.key)}
              className={`group relative rounded-xl border p-4 text-right transition-colors hover:bg-accent focus:outline-none ${
                expandedBucket === bucket.key ? "ring-2 ring-primary" : ""
              }`}
              style={{ borderColor: meta?.color ?? undefined }}
            >
              <p className="text-xs font-medium text-muted-foreground">
                {meta?.label ?? bucket.key}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: meta?.color }}>
                {bucket.count}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatNis(bucket.totalExposure, { compact: true })}
              </p>
              {expandedBucket === bucket.key && (
                <span className="absolute left-2 top-2 text-[10px] text-primary">▼</span>
              )}
            </button>
          )
        })}
      </section>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <ReportKpiCard
          title="סה״כ הזמנות פתוחות"
          value={data.totalOpenCount.toLocaleString("he-IL")}
          tone="neutral"
        />
        <ReportKpiCard
          title="חשיפה כספית פתוחה"
          value={formatNis(data.totalExposure, { compact: true })}
          tone="info"
        />
        <ReportKpiCard
          title="ותק ההזמנה הישנה ביותר"
          value={`${data.oldestAgeDays} ימים`}
          tone={data.oldestAgeDays > 90 ? "danger" : data.oldestAgeDays > 60 ? "warning" : "neutral"}
        />
      </div>

      {/* ── Exposure bar chart ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">חשיפה כספית לפי דלי גיל</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis
                tickFormatter={(v: number) => formatNis(v, { compact: true })}
                tick={{ fontSize: 11 }}
                width={70}
              />
              <Tooltip formatter={(((v: number) => [formatNis(v), "חשיפה"]) as unknown as (v: number) => [string, string]) as never} />
              <Bar dataKey="exposure" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Expanded bucket table ───────────────────────────────────────── */}
      {expandedBucket !== null && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              הזמנות פתוחות —{" "}
              <span style={{ color: BUCKET_META[expandedBucket]?.color }}>
                {BUCKET_META[expandedBucket]?.label ?? expandedBucket}
              </span>
              {" "}({expandedRows.length} רשומות)
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {expandedRows.length === 0 ? (
              <ReportEmptyState message="אין הזמנות בדלי זה" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מספר PO</TableHead>
                    <TableHead className="text-right">ספק</TableHead>
                    <TableHead className="text-right">פרויקט</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                    <TableHead className="text-right">גיל (ימים)</TableHead>
                    <TableHead className="text-right">סכום</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expandedRows.map((row) => {
                    const bucketMeta = BUCKET_META[expandedBucket]
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs">{row.poNumber}</TableCell>
                        <TableCell>{row.supplierName}</TableCell>
                        <TableCell className="text-muted-foreground">{row.projectName ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[11px]">{row.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <span
                            className="font-semibold tabular-nums"
                            style={{ color: bucketMeta?.color }}
                          >
                            {row.ageDays}
                          </span>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatNis(row.totalAmount)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
