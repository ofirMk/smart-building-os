"use client"

/**
 * Sprint T10 — Multi-Project Executive Portfolio Cockpit (UI).
 *
 * Renders the CEO God-View on `/marker-ofek/portfolio`:
 *   1. Top KPI strip — Portfolio Value / Revenue / Costs / Gross Margin %
 *      / Active Projects.
 *   2. Bar chart — revenue vs costs per project (Recharts).
 *   3. Health Grid — sortable-feeling table with progress bar + RAG badge
 *      + drill-down link to the project workspace.
 *
 * RTL, additive, no mocks. All data comes from the server action.
 */

import * as React from "react"
import Link from "next/link"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  ArrowUpRight,
  Briefcase,
  CircleDollarSign,
  Layers3,
  PercentCircle,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  PortfolioOverview,
  PortfolioProjectRow,
  ProjectHealth,
} from "@/lib/marker-ofek/portfolio/t10-portfolio-actions"
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

const PCT = new Intl.NumberFormat("he-IL", {
  style: "percent",
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
})

// ---------------------------------------------------------------------------
// Health badge
// ---------------------------------------------------------------------------

const HEALTH_META: Record<
  ProjectHealth,
  { label: string; tone: string; dot: string }
> = {
  GREEN: {
    label: "תקין",
    tone: "border-emerald-300 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
  },
  YELLOW: {
    label: "סיכון",
    tone: "border-amber-300 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
  },
  RED: {
    label: "חירום",
    tone: "border-rose-300 bg-rose-50 text-rose-800",
    dot: "bg-rose-500",
  },
  NEUTRAL: {
    label: "אין נתונים",
    tone: "border-slate-200 bg-slate-50 text-slate-700",
    dot: "bg-slate-400",
  },
}

function HealthBadge({ health }: { health: ProjectHealth }) {
  const m = HEALTH_META[health]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        m.tone,
      )}
    >
      <span className={cn("size-1.5 rounded-full", m.dot)} aria-hidden />
      {m.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function ProgressBar({
  pct,
  health,
}: {
  pct: number
  health: ProjectHealth
}) {
  const clamped = Math.max(0, Math.min(100, pct))
  const fill =
    health === "RED"
      ? "bg-rose-500"
      : health === "YELLOW"
        ? "bg-amber-500"
        : health === "GREEN"
          ? "bg-emerald-500"
          : "bg-slate-400"
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full transition-all", fill)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-foreground/80">
        {clamped.toFixed(1)}%
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// KPI tile
// ---------------------------------------------------------------------------

function KpiTile({
  icon,
  label,
  subLabel,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  subLabel: string
  value: string
  tone: "indigo" | "emerald" | "rose" | "violet" | "sky"
}) {
  const tones: Record<typeof tone, { bg: string; iconBg: string; ring: string }> = {
    indigo: {
      bg: "border-indigo-200 bg-indigo-50/60",
      iconBg: "bg-indigo-600",
      ring: "text-indigo-900",
    },
    emerald: {
      bg: "border-emerald-200 bg-emerald-50/60",
      iconBg: "bg-emerald-600",
      ring: "text-emerald-900",
    },
    rose: {
      bg: "border-rose-200 bg-rose-50/60",
      iconBg: "bg-rose-600",
      ring: "text-rose-900",
    },
    violet: {
      bg: "border-violet-200 bg-violet-50/60",
      iconBg: "bg-violet-600",
      ring: "text-violet-900",
    },
    sky: {
      bg: "border-sky-200 bg-sky-50/60",
      iconBg: "bg-sky-600",
      ring: "text-sky-900",
    },
  }
  const t = tones[tone]
  return (
    <Card className={cn("flex items-center gap-3 border p-4 shadow-sm", t.bg)}>
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl text-white",
          t.iconBg,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-foreground/90">{label}</p>
        <p className={cn("font-mono text-[10px] uppercase opacity-80", t.ring)}>
          {subLabel}
        </p>
        <p className={cn("mt-0.5 truncate font-mono text-xl font-bold tabular-nums", t.ring)}>
          {value}
        </p>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main cockpit
// ---------------------------------------------------------------------------

export function PortfolioCockpit({
  overview,
}: {
  overview: PortfolioOverview
}) {
  const { kpis, projects } = overview

  const chartData = React.useMemo(
    () =>
      projects
        .filter((p) => p.contractValue > 0 || p.revenueApproved > 0 || p.costsApproved > 0)
        .map((p) => ({
          name:
            p.projectName.length > 18
              ? p.projectName.slice(0, 17) + "…"
              : p.projectName,
          fullName: p.projectName,
          revenue: p.revenueApproved,
          costs: p.costsApproved,
          health: p.health,
        })),
    [projects],
  )

  const marginPctDisplay =
    kpis.totalRevenueApproved > 0
      ? PCT.format(kpis.totalGrossMargin / kpis.totalRevenueApproved)
      : "—"

  return (
    <div dir="rtl" className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            Sprint T10 · Executive Portfolio Command Center
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            פורטפוליו פרויקטים — מבט מנכ״ל
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            תמונת God-View חיה: שווי חוזים, הכנסות מאושרות, עלויות קבלני משנה,
            רווחיות ובריאות לכל הפרויקטים — בזמן אמת ממסד הנתונים.
          </p>
        </div>
        <Link
          href="/marker-ofek/finance/dashboard"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          דשבורד פיננסי <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      </header>

      {/* KPI strip */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile
          icon={<Briefcase className="size-5" aria-hidden />}
          tone="indigo"
          label="סך שווי פורטפוליו"
          subLabel="Total Portfolio Value"
          value={ILS.format(kpis.totalPortfolioValue)}
        />
        <KpiTile
          icon={<TrendingUp className="size-5" aria-hidden />}
          tone="emerald"
          label="הכנסות מאושרות"
          subLabel="Revenue Approved"
          value={ILS.format(kpis.totalRevenueApproved)}
        />
        <KpiTile
          icon={<TrendingDown className="size-5" aria-hidden />}
          tone="rose"
          label="עלויות מאושרות"
          subLabel="Costs Approved"
          value={ILS.format(kpis.totalCostsApproved)}
        />
        <KpiTile
          icon={<PercentCircle className="size-5" aria-hidden />}
          tone="violet"
          label="רווחיות גולמית"
          subLabel="Gross Margin %"
          value={marginPctDisplay}
        />
        <KpiTile
          icon={<Layers3 className="size-5" aria-hidden />}
          tone="sky"
          label="פרויקטים פעילים"
          subLabel="Active Projects"
          value={String(kpis.activeProjectsCount)}
        />
      </section>

      {/* Chart */}
      <Card className="border-border/70 p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="size-5 text-indigo-600" aria-hidden />
            <h2 className="text-sm font-semibold text-foreground">
              הכנסות מול עלויות לפי פרויקט
            </h2>
          </div>
          <span className="text-[10px] font-mono uppercase text-muted-foreground">
            APPROVED bills only
          </span>
        </div>

        <div className="h-[320px] w-full">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              אין עדיין נתוני חוזים/חשבונות מאושרים. אשרו חשבון לקוח או חשבון
              קבלן כדי לאכלס את הקוקפיט.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(226 232 240)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={64}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => ILS_COMPACT.format(v)}
                  width={70}
                />
                <Tooltip
                  formatter={(value, name) => [
                    ILS.format(Number(value ?? 0)),
                    String(name ?? ""),
                  ]}
                  labelFormatter={(_label, payload) => {
                    const item = payload?.[0]?.payload as
                      | { fullName?: string }
                      | undefined
                    return item?.fullName ?? ""
                  }}
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
                <Bar
                  dataKey="revenue"
                  name="הכנסות"
                  fill="#10b981"
                  radius={[6, 6, 0, 0]}
                >
                  {chartData.map((_d, i) => (
                    <Cell key={`rev-${i}`} fill="#10b981" />
                  ))}
                </Bar>
                <Bar
                  dataKey="costs"
                  name="עלויות"
                  fill="#f43f5e"
                  radius={[6, 6, 0, 0]}
                >
                  {chartData.map((_d, i) => (
                    <Cell key={`cost-${i}`} fill="#f43f5e" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Health Grid */}
      <Card className="border-border/70">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-foreground">
            רשת בריאות פרויקטים (RAG)
          </h2>
          <span className="text-[11px] text-muted-foreground">
            {projects.length} פרויקטים בסך הכל
          </span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="whitespace-nowrap">פרויקט</TableHead>
                <TableHead className="text-end whitespace-nowrap">שווי חוזה</TableHead>
                <TableHead className="text-end whitespace-nowrap">הכנסות</TableHead>
                <TableHead className="text-end whitespace-nowrap">עלויות</TableHead>
                <TableHead className="text-end whitespace-nowrap">רווח גולמי</TableHead>
                <TableHead className="text-end whitespace-nowrap">% רווח</TableHead>
                <TableHead className="whitespace-nowrap">התקדמות</TableHead>
                <TableHead className="whitespace-nowrap">בריאות</TableHead>
                <TableHead className="w-[1%] print:hidden">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                    אין פרויקטים פעילים בחברה זו.
                  </TableCell>
                </TableRow>
              ) : (
                projects.map((p) => <ProjectRow key={p.projectId} row={p} />)
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}

function ProjectRow({ row }: { row: PortfolioProjectRow }) {
  const marginToneClass =
    row.grossMarginPct < 5
      ? "text-rose-700"
      : row.grossMarginPct < 15
        ? "text-amber-700"
        : "text-emerald-700"

  return (
    <TableRow>
      <TableCell className="max-w-[220px]">
        <div className="flex flex-col">
          <span className="truncate font-medium text-foreground">{row.projectName}</span>
          <span className="font-mono text-[10px] uppercase text-muted-foreground">
            {row.projectNumber} · {row.status}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-end font-mono tabular-nums">
        {row.contractValue > 0 ? ILS.format(row.contractValue) : "—"}
      </TableCell>
      <TableCell className="text-end font-mono tabular-nums text-emerald-800">
        {row.revenueApproved > 0 ? ILS.format(row.revenueApproved) : "—"}
      </TableCell>
      <TableCell className="text-end font-mono tabular-nums text-rose-800">
        {row.costsApproved > 0 ? ILS.format(row.costsApproved) : "—"}
      </TableCell>
      <TableCell className="text-end font-mono tabular-nums">
        {row.revenueApproved > 0 || row.costsApproved > 0 ? (
          <span className={row.grossMargin >= 0 ? "text-emerald-800" : "text-rose-800"}>
            {ILS.format(row.grossMargin)}
          </span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className={cn("text-end font-mono tabular-nums", marginToneClass)}>
        {row.revenueApproved > 0 ? `${row.grossMarginPct.toFixed(1)}%` : "—"}
      </TableCell>
      <TableCell>
        <ProgressBar pct={row.progressPct} health={row.health} />
      </TableCell>
      <TableCell>
        <HealthBadge health={row.health} />
      </TableCell>
      <TableCell className="print:hidden">
        <Link
          href={`/marker-ofek/projects/${row.projectId}`}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
        >
          פתח <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      </TableCell>
    </TableRow>
  )
}
