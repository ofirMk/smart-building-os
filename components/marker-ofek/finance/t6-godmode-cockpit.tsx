"use client"

/**
 * Sprint T6 (God Mode) — Finance Cockpit (top strip).
 *
 * Mounted ABOVE the existing `mo_invoices` table on `/marker-ofek/finance`.
 * Fully additive — does not modify the existing rendering. Pulls live data
 * from the new `erp_finance_t6_kpis` + `erp_cash_flow_forecast_13_weeks`
 * RPCs via `t6-godmode-cockpit-actions.ts`.
 *
 * Surfaces:
 *   - 3 KPI tiles: Total AR Open / Total AP Open / Net Cash
 *   - 13-week area chart (Recharts) — AR vs AP weekly flows + closing balance
 *
 * Design: minimal RTL Tailwind; uses brand greens/reds/blues already used
 * across the cockpit so the new strip blends in.
 */

import * as React from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Activity,
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  Loader2,
  RefreshCcw,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  fetchT6ForecastAction,
  fetchT6KpiTotalsAction,
  type T6ForecastWeek,
  type T6KpiTotals,
} from "@/lib/marker-ofek/finance/t6-godmode-cockpit-actions"
import { cn } from "@/lib/utils"

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

const ILS_COMPACT = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  notation: "compact",
  maximumFractionDigits: 1,
})

const HE_DATE = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
})

type ChartDatum = {
  label: string
  ar: number
  ap: number
  net: number
  closing: number
}

export function T6GodModeCockpit({ companyId }: { companyId: string }) {
  const [totals, setTotals] = React.useState<T6KpiTotals | null>(null)
  const [forecast, setForecast] = React.useState<T6ForecastWeek[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const loadAll = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [kpiRes, fcRes] = await Promise.all([
        fetchT6KpiTotalsAction(companyId),
        fetchT6ForecastAction(companyId),
      ])
      if (!kpiRes.ok) {
        setError(kpiRes.error)
        return
      }
      if (!fcRes.ok) {
        setError(fcRes.error)
        return
      }
      setTotals(kpiRes.totals)
      setForecast(fcRes.rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה לא צפויה")
    } finally {
      setLoading(false)
    }
  }, [companyId])

  React.useEffect(() => {
    void loadAll()
  }, [loadAll])

  const chartData = React.useMemo<ChartDatum[]>(() => {
    return forecast.map((row) => {
      const start = row.weekStart ? new Date(row.weekStart) : null
      return {
        label:
          start && !Number.isNaN(start.getTime())
            ? `W${row.weekIndex + 1} · ${HE_DATE.format(start)}`
            : `W${row.weekIndex + 1}`,
        ar: row.arInflowPlanned,
        ap: -Math.abs(row.apOutflowPlanned), // negate so the bar pulls below zero visually
        net: row.netFlow,
        closing: row.closingBalance,
      }
    })
  }, [forecast])

  return (
    <section
      dir="rtl"
      className="space-y-4"
      data-testid="t6-godmode-cockpit"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            Sprint T6 · MedaTech §8 Finance Engine
          </p>
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            קוקפיט תזרים — AR/AP חי + תחזית 13 שבועות
          </h2>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadAll()}
          disabled={loading}
          className="gap-2"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCcw className="size-4" aria-hidden />
          )}
          רענן
        </Button>
      </header>

      {error ? (
        <Card className="flex items-center gap-2 border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          טעינה נכשלה: {error}
        </Card>
      ) : null}

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <KpiTile
          icon={<ArrowUpCircle className="size-5" aria-hidden />}
          tone="emerald"
          label="חובות פתוחים מלקוחות"
          subLabel="Total AR Open"
          value={totals?.totalArOpen ?? null}
          loading={loading}
        />
        <KpiTile
          icon={<ArrowDownCircle className="size-5" aria-hidden />}
          tone="rose"
          label="התחייבויות פתוחות לספקים"
          subLabel="Total AP Open"
          value={totals?.totalApOpen ?? null}
          loading={loading}
        />
        <KpiTile
          icon={<Banknote className="size-5" aria-hidden />}
          tone={totals && totals.netCash >= 0 ? "sky" : "amber"}
          label="יתרת תזרים נטו"
          subLabel="Net Cash (AR − AP)"
          value={totals?.netCash ?? null}
          loading={loading}
        />
      </div>

      {/* Forecast chart */}
      <Card className="border-border/70 p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="size-5 text-violet-600" aria-hidden />
            <h3 className="text-sm font-semibold text-foreground">
              תחזית תזרים שבועי — 13 שבועות
            </h3>
          </div>
          <span className="rounded-md bg-violet-50 px-2 py-1 text-[10px] font-mono uppercase text-violet-700">
            erp_cash_flow_forecast_13_weeks
          </span>
        </div>

        <div className="h-[280px] w-full">
          {loading && chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              טוען נתוני תחזית…
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              אין נתוני תחזית זמינים. אשרו חשבונות מזמין/קבלן כדי לזרוע את ה-AR/AP.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="t6-ar-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="t6-ap-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.05} />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.6} />
                  </linearGradient>
                  <linearGradient id="t6-closing-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(226 232 240)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => ILS_COMPACT.format(v)}
                  width={70}
                />
                <Tooltip
                  formatter={(value, name) => [
                    ILS.format(Math.abs(Number(value ?? 0))),
                    String(name ?? ""),
                  ]}
                  labelClassName="text-xs"
                  contentStyle={{
                    direction: "rtl",
                    fontSize: 12,
                    borderRadius: 8,
                    border: "1px solid rgb(226 232 240)",
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={28}
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Area
                  type="monotone"
                  dataKey="ar"
                  name="AR צפוי"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#t6-ar-grad)"
                />
                <Area
                  type="monotone"
                  dataKey="ap"
                  name="AP צפוי"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  fill="url(#t6-ap-grad)"
                />
                <Area
                  type="monotone"
                  dataKey="closing"
                  name="יתרה צוברת"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  fill="url(#t6-closing-grad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------------------
// KPI tile
// ---------------------------------------------------------------------------

const TONE_CLASSES: Record<
  "emerald" | "rose" | "sky" | "amber",
  { tile: string; iconWrap: string; subLabel: string; value: string }
> = {
  emerald: {
    tile: "border-emerald-200 bg-emerald-50/60",
    iconWrap: "bg-emerald-600 text-white",
    subLabel: "text-emerald-800/80",
    value: "text-emerald-900",
  },
  rose: {
    tile: "border-rose-200 bg-rose-50/60",
    iconWrap: "bg-rose-600 text-white",
    subLabel: "text-rose-800/80",
    value: "text-rose-900",
  },
  sky: {
    tile: "border-sky-200 bg-sky-50/60",
    iconWrap: "bg-sky-600 text-white",
    subLabel: "text-sky-800/80",
    value: "text-sky-900",
  },
  amber: {
    tile: "border-amber-200 bg-amber-50/60",
    iconWrap: "bg-amber-600 text-white",
    subLabel: "text-amber-800/80",
    value: "text-amber-900",
  },
}

function KpiTile({
  icon,
  tone,
  label,
  subLabel,
  value,
  loading,
}: {
  icon: React.ReactNode
  tone: "emerald" | "rose" | "sky" | "amber"
  label: string
  subLabel: string
  value: number | null
  loading: boolean
}) {
  const t = TONE_CLASSES[tone]
  return (
    <Card
      className={cn(
        "flex items-center gap-3 border p-4 shadow-sm",
        t.tile,
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          t.iconWrap,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-foreground/90">
          {label}
        </p>
        <p className={cn("font-mono text-[10px] uppercase", t.subLabel)}>
          {subLabel}
        </p>
        <p
          className={cn(
            "mt-0.5 font-mono text-xl font-bold tabular-nums",
            t.value,
          )}
        >
          {loading && value === null ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            ILS.format(value ?? 0)
          )}
        </p>
      </div>
    </Card>
  )
}
