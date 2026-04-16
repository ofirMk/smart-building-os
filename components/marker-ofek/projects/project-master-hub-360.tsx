"use client"

import Link from "next/link"
import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  BarChart3,
  CalendarClock,
  CloudSun,
  FileUp,
  Gauge,
  Package,
  ShoppingCart,
  Sparkles,
  Truck,
  Zap,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
        <span className="text-lg font-bold tabular-nums text-slate-900">
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
        "rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm ring-1 ring-slate-900/[0.04]",
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

  React.useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

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

  return (
    <motion.div
      dir="rtl"
      className="w-full bg-gradient-to-b from-white via-slate-50/80 to-slate-50 pb-10"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={item} className="border-b border-slate-200/80 bg-white/90 px-3 py-3 md:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <Link
              href="/marker-ofek/projects"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-emerald-700"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              כל הפרויקטים
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-balance text-xl font-bold tracking-tight text-slate-900 md:text-2xl">
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
            <p className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900">מנהל אתר: </span>
              {mock.siteManager}
            </p>
          </div>

          <div className="flex w-full shrink-0 flex-col gap-2 sm:flex-row sm:items-stretch lg:w-auto lg:min-w-[280px]">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white px-3 py-2 shadow-sm">
              <motion.span
                className="flex size-9 items-center justify-center rounded-lg bg-white text-sky-600 shadow-sm ring-1 ring-sky-100"
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
                <p className="text-sm font-semibold text-slate-900">
                  {mock.weather.tempC}°C · {mock.weather.condition}
                </p>
                <p className="text-[11px] leading-snug text-slate-600">
                  {mock.weather.wind} · לחות {mock.weather.humidityPct}%
                </p>
              </div>
            </div>
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/90 to-white px-3 py-2 shadow-sm">
              <span className="flex size-9 items-center justify-center rounded-lg bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-100">
                <CalendarClock className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 text-start">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                  שעון מקומי (אתר)
                </p>
                <p className="font-currency-mono text-sm font-bold tabular-nums text-slate-900">
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
              <div className="flex items-center gap-1.5 text-slate-800">
                <Gauge className="size-4 text-amber-600" aria-hidden />
                <p className="text-sm font-bold">Financial Pulse</p>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-600">
                ניצול תקציב מול התקדמות ביצוע (Earned Value). פערים מסומנים
                לבקרה שבועית.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                <div className="rounded-lg bg-slate-50 px-2 py-1.5 ring-1 ring-slate-100">
                  <p className="text-slate-500">מחויב מצטבר</p>
                  <p className="font-semibold tabular-nums text-slate-900">
                    {ils.format(mock.financial.committedNis)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 px-2 py-1.5 ring-1 ring-slate-100">
                  <p className="text-slate-500">ערך עבודה מזוכה</p>
                  <p className="font-semibold tabular-nums text-emerald-800">
                    {ils.format(mock.financial.earnedValueNis)}
                  </p>
                </div>
              </div>
            </div>
          </HubCard>

          <HubCard>
            <div className="flex items-center gap-1.5 text-slate-800">
              <Package className="size-4 text-indigo-600" aria-hidden />
              <p className="text-sm font-bold">סיכום רכש</p>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums text-slate-900">
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
                    className="rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5"
                  >
                    <p className="text-xs font-semibold text-slate-900">
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
                  className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700"
                >
                  {s}
                </span>
              ))}
            </div>
          </HubCard>

          <HubCard>
            <div className="flex items-center gap-1.5 text-slate-800">
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
                    <p className="text-xs font-semibold leading-snug text-slate-900">
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
                  <p className="text-sm font-bold text-slate-900">
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
                          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                            <span className="text-[10px] font-bold">DL</span>
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900">
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
                                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700"
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
                              <p className="text-sm font-semibold text-slate-900">
                                {row.title}
                              </p>
                              <Badge className="h-5 border border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-900">
                                מאושר לתשלום
                              </Badge>
                            </div>
                            <p className="mt-0.5 text-[12px] text-slate-600">
                              {row.detail} · {row.supplier}
                            </p>
                            <p className="mt-1 font-currency-mono text-sm font-bold tabular-nums text-slate-900">
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
                  <p className="text-sm font-bold text-slate-900">תרשימי גאנט</p>
                </div>
                <ul className="space-y-2">
                  {ganttCharts.map((g) => (
                    <li key={g.id}>
                      <Link
                        href={`/marker-ofek/projects/gantt/${g.id}`}
                        className="block rounded-lg border border-slate-200 bg-gradient-to-l from-white to-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:border-indigo-300 hover:from-indigo-50/60"
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
                    className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900"
                  >
                    כל הגאנטים בארגון ←
                  </Link>
                </div>
              </HubCard>
            ) : null}

            <HubCard className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="size-4 text-amber-500" aria-hidden />
                <p className="text-sm font-bold text-slate-900">
                  פעולות מהירות
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                <Link href="/marker-ofek/procurement/purchase-orders/new">
                  <motion.div
                    whileHover={reduce ? undefined : { scale: 1.02 }}
                    whileTap={reduce ? undefined : { scale: 0.99 }}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-gradient-to-l from-white to-slate-50 px-3 py-3 shadow-sm transition-colors hover:border-emerald-300 hover:from-emerald-50/50"
                  >
                    <span className="flex size-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 shadow-inner">
                      <ShoppingCart className="size-6" aria-hidden />
                    </span>
                    <div className="min-w-0 text-start">
                      <p className="text-sm font-bold text-slate-900">
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
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-gradient-to-l from-white to-slate-50 px-3 py-3 shadow-sm transition-colors hover:border-amber-300 hover:from-amber-50/40"
                  >
                    <span className="flex size-12 items-center justify-center rounded-xl bg-amber-100 text-amber-900 shadow-inner">
                      <AlertCircle className="size-6" aria-hidden />
                    </span>
                    <div className="min-w-0 text-start">
                      <p className="text-sm font-bold text-slate-900">
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
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-gradient-to-l from-white to-slate-50 px-3 py-3 shadow-sm transition-colors hover:border-sky-300 hover:from-sky-50/50"
                  >
                    <span className="flex size-12 items-center justify-center rounded-xl bg-sky-100 text-sky-900 shadow-inner">
                      <FileUp className="size-6" aria-hidden />
                    </span>
                    <div className="min-w-0 text-start">
                      <p className="text-sm font-bold text-slate-900">
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
                  className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
                >
                  גאנט מלא
                </Link>
                <Link
                  href={`/projects/${projectId}/wall`}
                  className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
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
