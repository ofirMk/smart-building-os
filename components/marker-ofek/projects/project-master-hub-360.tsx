"use client"

import Link from "next/link"
import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { z } from "zod"
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  BarChart3,
  CalendarClock,
  CloudSun,
  FileUp,
  Gauge,
  Loader2,
  Package,
  ShoppingCart,
  Sparkles,
  Truck,
  Zap,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { apiGet } from "@/lib/utils/api-client"
import { cn } from "@/lib/utils"
import type { ProjectMasterHubMock } from "@/lib/marker-ofek/project-master-hub-mock"
import type { GanttRecord } from "@/types/gantt"
import type { MoProjectStatus } from "@/types/marker-ofek"

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

const ilsFull = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
})

const profitabilitySnapshotSchema = z.object({
  netProfitability: z.coerce.number(),
  currentMarginPct: z.coerce.number(),
  totalApprovedClientAmount: z.coerce.number(),
  totalSubcontractorBills: z.coerce.number(),
  directMaterialCosts: z.coerce.number(),
  totalOffsetsAndCommissions: z.coerce.number(),
  offsetExposure: z.coerce.number(),
  profitMarginHeatmap: z.array(
    z.object({
      subChapter: z.string(),
      expectedRevenue: z.coerce.number(),
      expectedCost: z.coerce.number(),
      marginPct: z.coerce.number(),
      risk: z.enum(["LOW", "MEDIUM", "HIGH"]),
    })
  ),
  billingVariance: z.array(
    z.object({
      label: z.string(),
      period: z.string().nullable(),
      submittedTotal: z.coerce.number(),
      approvedTotal: z.coerce.number(),
    })
  ),
  cashFlowForecast: z.object({
    averageApprovalLagDays: z.coerce.number(),
    haircutFactor: z.coerce.number(),
    lookaheadDays: z.coerce.number(),
    totals: z.object({
      confirmedInflow: z.coerce.number(),
      expectedInflow: z.coerce.number(),
      totalInflow: z.coerce.number(),
    }),
    timeline: z.array(
      z.object({
        billId: z.string(),
        billNumber: z.string(),
        contractId: z.string(),
        forecastType: z.enum(["CONFIRMED", "EXPECTED"]),
        amount: z.coerce.number(),
        approvalDate: z.string().nullable(),
        cashArrivalDate: z.string(),
        paymentTermsDays: z.coerce.number(),
      })
    ),
  }),
})

function statusLabelHe(s: MoProjectStatus): string {
  switch (s) {
    case "active":
      return "בביצוע פעיל"
    case "planning":
      return "בתכנון"
    case "on_hold":
      return "מוקפא"
    case "completed":
      return "הושלם"
    case "cancelled":
      return "בוטל"
    default:
      return String(s)
  }
}

function formatHeTime(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d)
}

function formatRelativeCountdown(target: Date, now: Date) {
  const ms = target.getTime() - now.getTime()
  if (ms <= 0) return "היום"
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d >= 1) return `בעוד ${d} ימים · ${h} ש׳`
  if (h >= 1) return `בעוד ${h} ש׳ ${m} דק׳`
  return `בעוד ${m} דק׳`
}

function DualProgressRings({
  budgetPct,
  workPct,
}: {
  budgetPct: number
  workPct: number
}) {
  const reduce = useReducedMotion()
  const rOuter = 44
  const rInner = 32
  const c = 50
  const outerCirc = 2 * Math.PI * rOuter
  const innerCirc = 2 * Math.PI * rInner
  const outerDash = (Math.min(100, Math.max(0, budgetPct)) / 100) * outerCirc
  const innerDash = (Math.min(100, Math.max(0, workPct)) / 100) * innerCirc

  return (
    <div className="relative flex size-[9.5rem] shrink-0 items-center justify-center">
      <svg
        viewBox="0 0 100 100"
        className="size-full drop-shadow-sm"
        aria-hidden
      >
        <circle
          cx={c}
          cy={c}
          r={rOuter}
          fill="none"
          stroke="rgb(241 245 249)"
          strokeWidth="8"
        />
        <motion.circle
          cx={c}
          cy={c}
          r={rOuter}
          fill="none"
          stroke="url(#gradBudget)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${outerDash} ${outerCirc}`}
          transform={`rotate(-90 ${c} ${c})`}
          initial={reduce ? false : { strokeDasharray: `0 ${outerCirc}` }}
          animate={{ strokeDasharray: `${outerDash} ${outerCirc}` }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
        <circle
          cx={c}
          cy={c}
          r={rInner}
          fill="none"
          stroke="rgb(241 245 249)"
          strokeWidth="7"
        />
        <motion.circle
          cx={c}
          cy={c}
          r={rInner}
          fill="none"
          stroke="url(#gradWork)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${innerDash} ${innerCirc}`}
          transform={`rotate(-90 ${c} ${c})`}
          initial={reduce ? false : { strokeDasharray: `0 ${innerCirc}` }}
          animate={{ strokeDasharray: `${innerDash} ${innerCirc}` }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
        />
        <defs>
          <linearGradient id="gradBudget" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(245 158 11)" />
            <stop offset="100%" stopColor="rgb(234 88 12)" />
          </linearGradient>
          <linearGradient id="gradWork" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgb(16 185 129)" />
            <stop offset="100%" stopColor="rgb(20 184 166)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          תקציב / עבודה
        </span>
        <span className="text-lg font-bold tabular-nums text-foreground">
          {budgetPct}% / {workPct}%
        </span>
      </div>
    </div>
  )
}

const liftHover = {
  rest: { scale: 1, y: 0, rotateX: 0 },
  hover: {
    scale: 1.02,
    y: -4,
    rotateX: 1,
    transition: { type: "spring" as const, stiffness: 420, damping: 28 },
  },
}

function HubCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial="rest"
      whileHover={reduce ? undefined : "hover"}
      animate="rest"
      variants={liftHover}
      className={cn(
        "rounded-xl border border-border bg-card p-2.5 shadow-sm ring-1 ring-border/40",
        "will-change-transform [transform-style:preserve-3d]",
        className
      )}
    >
      {children}
    </motion.div>
  )
}

export function ProjectMasterHub360(props: {
  projectId: string
  displayName: string
  internalCode: string
  status: MoProjectStatus
  addressLine: string | null
  mock: ProjectMasterHubMock
  ganttCharts?: GanttRecord[]
}) {
  const { projectId, displayName, internalCode, status, addressLine, mock, ganttCharts } =
    props
  const reduce = useReducedMotion()
  const [now, setNow] = React.useState(() => new Date())
  const [profitability, setProfitability] = React.useState<
    z.infer<typeof profitabilitySnapshotSchema> | null
  >(null)
  const [profitabilityLoading, setProfitabilityLoading] = React.useState(false)
  const [profitabilityError, setProfitabilityError] = React.useState<string | null>(null)
  const [exportingExecutive, setExportingExecutive] = React.useState(false)

  React.useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

  React.useEffect(() => {
    let isCurrentRequest = true
    const controller = new AbortController()

    const loadProfitability = async () => {
      setProfitabilityLoading(true)
      setProfitabilityError(null)
      if (!projectId) {
        setProfitability(null)
        setProfitabilityLoading(false)
        return
      }
      try {
        const data = await apiGet(
          `/api/erp/projects/${projectId}/profitability`,
          {
            schema: profitabilitySnapshotSchema,
            signal: controller.signal,
          }
        )
        if (isCurrentRequest) {
          setProfitability(data)
        }
      } catch (error) {
        if (controller.signal.aborted) return
        if (isCurrentRequest) {
          setProfitability(null)
          setProfitabilityError(
            error instanceof Error ? error.message : "טעינת אנליטיקה נכשלה"
          )
        }
      } finally {
        if (isCurrentRequest) setProfitabilityLoading(false)
      }
    }

    void loadProfitability()
    return () => {
      isCurrentRequest = false
      controller.abort()
    }
  }, [projectId])

  const localTimeLabel = formatHeTime(now, mock.timeZone)

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: reduce
        ? { duration: 0.2 }
        : { staggerChildren: 0.055, delayChildren: 0.06 },
    },
  }

  const easeOut = [0.22, 1, 0.36, 1] as const
  const item = {
    hidden: reduce
      ? { opacity: 1 }
      : { opacity: 0, y: 14, filter: "blur(4px)" },
    show: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: 0.45, ease: easeOut },
    },
  }

  const sortedActivity = React.useMemo(() => {
    return [...mock.activity].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
    )
  }, [mock.activity])

  const exportExecutiveSummary = React.useCallback(async () => {
    if (!projectId) return
    setExportingExecutive(true)
    const controller = new AbortController()
    try {
      const snapshot =
        profitability ??
        (await apiGet(`/api/erp/projects/${projectId}/profitability`, {
          schema: profitabilitySnapshotSchema,
          signal: controller.signal,
        }))
      const { jsPDF } = await import("jspdf")
      const doc = new jsPDF({ unit: "pt", format: "a4" })
      const generatedAt = new Date().toLocaleString("en-GB")
      const formatDate = (value: string) =>
        new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
          new Date(value)
        )

      let y = 44
      doc.setFillColor(15, 23, 42)
      doc.rect(0, 0, 595, 36, "F")
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(11)
      doc.text("Holden Group", 40, 23)
      doc.setTextColor(17, 24, 39)
      doc.setFontSize(18)
      doc.text("Executive Summary", 40, y + 24)
      doc.setFontSize(11)
      doc.text(`Project: ${displayName}`, 40, y + 42)
      doc.text(`Internal code: ${internalCode}`, 40, y + 58)
      doc.text(`Generated: ${generatedAt}`, 40, y + 74)

      y += 104
      doc.setFontSize(14)
      doc.text("Dashboard Snapshot (Bento Widgets)", 40, y)
      y += 18
      doc.setFontSize(11)
      doc.text(`Net Profitability: ${ilsFull.format(snapshot.netProfitability)}`, 40, y)
      y += 14
      doc.text(`Approved Client Amount: ${ilsFull.format(snapshot.totalApprovedClientAmount)}`, 40, y)
      y += 14
      doc.text(`Offset Exposure: ${ilsFull.format(snapshot.offsetExposure)}`, 40, y)
      y += 14
      doc.text(`Current Margin: ${snapshot.currentMarginPct.toFixed(2)}%`, 40, y)
      y += 26

      doc.setFontSize(14)
      doc.text("Profitability Heatmap (Sub-chapters)", 40, y)
      y += 18
      doc.setFontSize(10)
      for (const cell of snapshot.profitMarginHeatmap.slice(0, 12)) {
        if (y > 760) {
          doc.addPage()
          y = 48
        }
        doc.text(
          `${cell.subChapter} | Margin ${cell.marginPct.toFixed(2)}% | Revenue ${ils.format(
            cell.expectedRevenue
          )} | Cost ${ils.format(cell.expectedCost)} | Risk ${cell.risk}`,
          40,
          y
        )
        y += 14
      }

      if (y > 680) {
        doc.addPage()
        y = 48
      } else {
        y += 12
      }
      doc.setFontSize(14)
      doc.text("Cash Flow Timeline (90-Day Outlook)", 40, y)
      y += 18
      doc.setFontSize(10)
      doc.text(
        `Confirmed: ${ilsFull.format(snapshot.cashFlowForecast.totals.confirmedInflow)} | Expected: ${ilsFull.format(
          snapshot.cashFlowForecast.totals.expectedInflow
        )} | Total: ${ilsFull.format(snapshot.cashFlowForecast.totals.totalInflow)}`,
        40,
        y
      )
      y += 14
      doc.text(
        `Approval lag avg: ${snapshot.cashFlowForecast.averageApprovalLagDays.toFixed(
          2
        )} days | Haircut factor: ${snapshot.cashFlowForecast.haircutFactor.toFixed(4)}`,
        40,
        y
      )
      y += 18

      for (const row of snapshot.cashFlowForecast.timeline) {
        if (y > 780) {
          doc.addPage()
          y = 48
        }
        const line = `${formatDate(row.cashArrivalDate)} | ${row.forecastType} | ${
          row.billNumber
        } | ${ils.format(row.amount)}`
        doc.text(line, 40, y)
        y += 13
      }

      doc.save(`holden-executive-summary-${projectId.slice(0, 8)}.pdf`)
    } catch (error) {
      if (controller.signal.aborted) return
      console.error("Executive PDF export failed:", error)
    } finally {
      controller.abort()
      setExportingExecutive(false)
    }
  }, [displayName, internalCode, profitability, projectId])

  return (
    <motion.div
      dir="rtl"
      className="w-full bg-gradient-to-b from-background via-muted/20 to-background pb-4"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={item} className="border-b border-border bg-card/90 px-2 py-2 md:px-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1.5">
            <Link
              href="/marker-ofek/projects"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-emerald-700"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              כל הפרויקטים
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-balance text-xl font-bold tracking-tight text-foreground md:text-2xl">
                {displayName}
              </h1>
              <Badge
                variant="secondary"
                className="border border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-900"
              >
                {statusLabelHe(status)}
              </Badge>
            </div>
            <p className="font-mono text-[11px] text-slate-500 tabular-nums">
              {internalCode}
              {addressLine ? (
                <span className="ms-2 font-sans text-slate-600">
                  · {addressLine}
                </span>
              ) : null}
            </p>
            <p className="text-sm text-foreground">
              <span className="font-semibold text-foreground">מנהל אתר: </span>
              {mock.siteManager}
            </p>
          </div>

          <div className="flex w-full shrink-0 flex-col gap-2 sm:flex-row sm:items-stretch lg:w-auto lg:min-w-[280px]">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-gradient-to-br from-card to-muted/30 px-2.5 py-2 shadow-sm">
              <motion.span
                className="flex size-9 items-center justify-center rounded-lg bg-card text-sky-600 shadow-sm ring-1 ring-sky-100"
                animate={
                  reduce
                    ? undefined
                    : { scale: [1, 1.04, 1], opacity: [1, 0.92, 1] }
                }
                transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              >
                <CloudSun className="size-5" aria-hidden />
              </motion.span>
              <div className="min-w-0 text-start">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                  Live Pulse · מזג אוויר באתר
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {mock.weather.tempC}°C · {mock.weather.condition}
                </p>
                <p className="text-[11px] leading-snug text-slate-600">
                  {mock.weather.wind} · לחות {mock.weather.humidityPct}%
                </p>
              </div>
            </div>
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-gradient-to-br from-card to-muted/30 px-2.5 py-2 shadow-sm">
              <span className="flex size-9 items-center justify-center rounded-lg bg-card text-emerald-600 shadow-sm ring-1 ring-emerald-100">
                <CalendarClock className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 text-start">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                  שעון מקומי (אתר)
                </p>
                <p className="font-currency-mono text-sm font-bold tabular-nums text-foreground">
                  {localTimeLabel}
                </p>
                <p className="text-[11px] text-slate-600">{mock.timeZone}</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="mx-auto w-full max-w-[1600px] space-y-4 px-3 pt-4 md:px-5">
        <motion.div
          variants={item}
          className="grid grid-cols-1 gap-3 lg:grid-cols-3"
        >
          <HubCard className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <DualProgressRings
              budgetPct={mock.financial.budgetExhaustedPct}
              workPct={mock.financial.workCompletedPct}
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-1.5 text-foreground">
                <Gauge className="size-4 text-amber-600" aria-hidden />
                <p className="text-sm font-bold">Financial Pulse</p>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-600">
                ניצול תקציב מול התקדמות ביצוע (Earned Value). פערים מסומנים
                לבקרה שבועית.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                <div className="rounded-lg bg-background px-2 py-1.5 ring-1 ring-slate-100">
                  <p className="text-slate-500">מחויב מצטבר</p>
                  <p className="font-semibold tabular-nums text-foreground">
                    {ils.format(mock.financial.committedNis)}
                  </p>
                </div>
                <div className="rounded-lg bg-background px-2 py-1.5 ring-1 ring-slate-100">
                  <p className="text-slate-500">ערך עבודה מזוכה</p>
                  <p className="font-semibold tabular-nums text-emerald-800">
                    {ils.format(mock.financial.earnedValueNis)}
                  </p>
                </div>
              </div>
            </div>
          </HubCard>

          <HubCard>
            <div className="flex items-center gap-1.5 text-foreground">
              <Package className="size-4 text-indigo-600" aria-hidden />
              <p className="text-sm font-bold">סיכום רכש</p>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums text-foreground">
                {mock.procurement.openPOs}
              </span>
              <span className="text-xs text-slate-600">הזמנות פתוחות</span>
            </div>
            <div className="mt-2 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                אספקות ממתינות
              </p>
              <ul className="space-y-1.5">
                {mock.procurement.pendingDeliveries.map((d) => (
                  <li
                    key={d.label}
                    className="rounded-lg border border-slate-100 bg-background/80 px-2 py-1.5"
                  >
                    <p className="text-xs font-semibold text-foreground">
                      {d.label}
                    </p>
                    <p className="text-[11px] text-slate-600">{d.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {mock.procurement.recentSuppliers.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  {s}
                </span>
              ))}
            </div>
          </HubCard>

          <HubCard>
            <div className="flex items-center gap-1.5 text-foreground">
              <Truck className="size-4 text-violet-600" aria-hidden />
              <p className="text-sm font-bold">ציר זמן — 3 אבני דרך הבאות</p>
            </div>
            <ul className="mt-2 space-y-2">
              {mock.milestones.map((m) => {
                const target = new Date(m.targetAt)
                return (
                  <li
                    key={m.id}
                    className="rounded-lg border border-violet-100 bg-violet-50/40 px-2.5 py-2"
                  >
                    <p className="text-xs font-semibold leading-snug text-foreground">
                      {m.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-600">
                      <span className="tabular-nums">
                        {new Intl.DateTimeFormat("he-IL", {
                          timeZone: mock.timeZone,
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }).format(target)}
                      </span>
                      <span className="font-semibold text-violet-800 tabular-nums">
                        {formatRelativeCountdown(target, now)}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </HubCard>
        </motion.div>

        <motion.div variants={item} className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <HubCard className="space-y-2">
            <div className="flex items-center gap-2">
              <Banknote className="size-4 text-emerald-700" aria-hidden />
              <p className="text-sm font-bold text-foreground">Net Profitability</p>
            </div>
            {profitabilityLoading ? (
              <p className="text-xs text-slate-500">טוען נתוני רווחיות...</p>
            ) : (
              <>
                <p className="font-currency-mono text-2xl font-black tabular-nums text-foreground">
                  {ilsFull.format(profitability?.netProfitability ?? 0)}
                </p>
                <p className="text-[11px] text-slate-600">
                  מאושר לקוח − חשבונות קבלן משנה − חומרים ישירים + קיזוזים/עמלות
                </p>
              </>
            )}
          </HubCard>

          <HubCard className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4 text-red-700" aria-hidden />
              <p className="text-sm font-bold text-foreground">Offset Exposure</p>
            </div>
            {profitabilityLoading ? (
              <p className="text-xs text-slate-500">טוען חשיפת קיזוז...</p>
            ) : (
              <>
                <p className="font-currency-mono text-2xl font-black tabular-nums text-red-700">
                  {ilsFull.format(profitability?.offsetExposure ?? 0)}
                </p>
                <p className="text-[11px] text-slate-600">
                  סכום שורות רכש לא מקוזזות המחוברות לקבלני משנה בפרויקט
                </p>
              </>
            )}
          </HubCard>

          <HubCard className="space-y-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4 text-primary" aria-hidden />
              <p className="text-sm font-bold text-foreground">Billing Variance</p>
            </div>
            {profitabilityLoading ? (
              <p className="text-xs text-slate-500">טוען וריאנס חיובים...</p>
            ) : profitability?.billingVariance?.length ? (
              <div className="space-y-2">
                {profitability.billingVariance.slice(-5).map((row) => {
                  const max = Math.max(row.submittedTotal, row.approvedTotal, 1)
                  const submittedPct = Math.round((row.submittedTotal / max) * 100)
                  const approvedPct = Math.round((row.approvedTotal / max) * 100)
                  return (
                    <div key={`${row.label}-${row.period ?? "na"}`} className="space-y-1">
                      <p className="truncate text-[11px] font-semibold text-foreground">
                        {row.label}
                      </p>
                      <div className="space-y-1">
                        <div className="h-2 rounded bg-muted">
                          <div
                            className="h-2 rounded bg-slate-400"
                            style={{ width: `${submittedPct}%` }}
                          />
                        </div>
                        <div className="h-2 rounded bg-emerald-100">
                          <div
                            className="h-2 rounded bg-emerald-500"
                            style={{ width: `${approvedPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500">אין נתוני חיוב להצגה.</p>
            )}
          </HubCard>
        </motion.div>
        {profitabilityError ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {profitabilityError}
          </p>
        ) : null}

        <motion.div
          variants={item}
          className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start"
        >
          {/* RTL: first in DOM = inline-start = right — wide feed on the right */}
          <section className="order-1 min-w-0 lg:col-span-8 xl:col-span-9">
            <HubCard className="p-0">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Zap className="size-4 text-amber-500" aria-hidden />
                  <p className="text-sm font-bold text-foreground">
                    פעילות ביצוע אחרונה
                  </p>
                </div>
                <span className="text-[10px] font-medium text-slate-500">
                  מיזוג יומני עבודה + חשבונות קבלני משנה מאושרים
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                <AnimatePresence initial={false}>
                  {sortedActivity.slice(0, 5).map((row, i) => (
                    <motion.li
                      key={`${row.kind}-${row.at}-${i}`}
                      initial={reduce ? false : { opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="px-4 py-3"
                    >
                      {row.kind === "daily_log" ? (
                        <div className="flex gap-3">
                          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                            <span className="text-[10px] font-bold">DL</span>
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-foreground">
                                {row.title}
                              </p>
                              <span className="text-[10px] text-slate-500 tabular-nums">
                                {formatHeTime(new Date(row.at), mock.timeZone)}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[12px] leading-relaxed text-slate-600">
                              {row.detail}
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {row.tags.map((t) => (
                                <span
                                  key={t}
                                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-3">
                          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
                            <Banknote className="size-4" aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-foreground">
                                {row.title}
                              </p>
                              <Badge className="h-5 border border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-900">
                                מאושר לתשלום
                              </Badge>
                            </div>
                            <p className="mt-0.5 text-[12px] text-slate-600">
                              {row.detail} · {row.supplier}
                            </p>
                            <p className="mt-1 font-currency-mono text-sm font-bold tabular-nums text-foreground">
                              {ilsFull.format(row.amountNis)}
                            </p>
                            <p className="text-[10px] text-slate-500 tabular-nums">
                              {formatHeTime(new Date(row.at), mock.timeZone)}
                            </p>
                          </div>
                        </div>
                      )}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </HubCard>
          </section>

          <aside className="order-2 space-y-3 lg:col-span-4 xl:col-span-3">
            {ganttCharts && ganttCharts.length > 0 ? (
              <HubCard className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <BarChart3 className="size-4 text-indigo-600" aria-hidden />
                  <p className="text-sm font-bold text-foreground">תרשימי גאנט</p>
                </div>
                <ul className="space-y-2">
                  {ganttCharts.map((g) => (
                    <li key={g.id}>
                      <Link
                        href={`/marker-ofek/projects/gantt/${g.id}`}
                        className="block rounded-lg border border-border bg-gradient-to-l from-background to-muted/40 px-3 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-all duration-200 ease-in-out hover:bg-accent hover:text-accent-foreground hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {g.name}
                        <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                          {g.status === "active" ? "פעיל" : g.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <Link
                    href="/marker-ofek/projects/gantt"
                    className="text-[11px] font-semibold text-primary transition-all duration-200 ease-in-out hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    כל הגאנטים בארגון ←
                  </Link>
                </div>
              </HubCard>
            ) : null}

            <HubCard className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="size-4 text-amber-500" aria-hidden />
                <p className="text-sm font-bold text-foreground">
                  פעולות מהירות
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mb-3 h-8 w-full justify-center border-border bg-card text-xs transition-all duration-200 ease-in-out hover:bg-accent hover:text-accent-foreground hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                disabled={profitabilityLoading || exportingExecutive}
                onClick={() => void exportExecutiveSummary()}
              >
                {exportingExecutive ? <Loader2 className="me-1 size-3.5 animate-spin" /> : null}
                Export Executive Summary
              </Button>
              <div className="grid grid-cols-1 gap-2.5">
                <Link href="/marker-ofek/procurement/purchase-orders/new">
                  <motion.div
                    whileHover={reduce ? undefined : { scale: 1.02 }}
                    whileTap={reduce ? undefined : { scale: 0.99 }}
                    className="flex items-center gap-3 rounded-xl border border-border bg-gradient-to-l from-background to-muted/40 px-3 py-3 shadow-sm transition-all duration-200 ease-in-out hover:bg-accent hover:text-accent-foreground hover:shadow-md"
                  >
                    <span className="flex size-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 shadow-inner">
                      <ShoppingCart className="size-6" aria-hidden />
                    </span>
                    <div className="min-w-0 text-start">
                      <p className="text-sm font-bold text-foreground">
                        הזמנת רכש חדשה
                      </p>
                      <p className="text-[11px] text-slate-600">
                        פתיחת PO · קישור לפרויקט פעיל
                      </p>
                    </div>
                  </motion.div>
                </Link>

                <Link href={`/marker-ofek/projects/${projectId}/daily-log`}>
                  <motion.div
                    whileHover={reduce ? undefined : { scale: 1.02 }}
                    whileTap={reduce ? undefined : { scale: 0.99 }}
                    className="flex items-center gap-3 rounded-xl border border-border bg-gradient-to-l from-background to-muted/40 px-3 py-3 shadow-sm transition-all duration-200 ease-in-out hover:bg-accent hover:text-accent-foreground hover:shadow-md"
                  >
                    <span className="flex size-12 items-center justify-center rounded-xl bg-amber-100 text-amber-900 shadow-inner">
                      <AlertCircle className="size-6" aria-hidden />
                    </span>
                    <div className="min-w-0 text-start">
                      <p className="text-sm font-bold text-foreground">
                        דיווח חריג / תקלה
                      </p>
                      <p className="text-[11px] text-slate-600">
                        יומן שטח · תיעוד מיידי
                      </p>
                    </div>
                  </motion.div>
                </Link>

                <Link href={`/marker-ofek/projects/${projectId}/contract-ai`}>
                  <motion.div
                    whileHover={reduce ? undefined : { scale: 1.02 }}
                    whileTap={reduce ? undefined : { scale: 0.99 }}
                    className="flex items-center gap-3 rounded-xl border border-border bg-gradient-to-l from-background to-muted/40 px-3 py-3 shadow-sm transition-all duration-200 ease-in-out hover:bg-accent hover:text-accent-foreground hover:shadow-md"
                  >
                    <span className="flex size-12 items-center justify-center rounded-xl bg-sky-100 text-sky-900 shadow-inner">
                      <FileUp className="size-6" aria-hidden />
                    </span>
                    <div className="min-w-0 text-start">
                      <p className="text-sm font-bold text-foreground">
                        העלאת תוכנית / מסמך
                      </p>
                      <p className="text-[11px] text-slate-600">
                        עיבוד חוזים · בסיס חשבונות
                      </p>
                    </div>
                  </motion.div>
                </Link>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <Link
                  href={`/marker-ofek/execution/gantt/${projectId}`}
                  className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground shadow-sm transition-all duration-200 ease-in-out hover:bg-accent hover:text-accent-foreground hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  גאנט מלא
                </Link>
                <Link
                  href={`/projects/${projectId}/wall`}
                  className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground shadow-sm transition-all duration-200 ease-in-out hover:bg-accent hover:text-accent-foreground hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  קיר פרויקט
                </Link>
              </div>
            </HubCard>
          </aside>
        </motion.div>
      </div>
    </motion.div>
  )
}
