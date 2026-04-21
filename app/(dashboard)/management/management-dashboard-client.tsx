"use client"

import * as React from "react"
import { motion } from "framer-motion"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useOrganizationBranding } from "@/components/organization-branding-context"
import { cn } from "@/lib/utils"
import { Building2, Sparkles } from "lucide-react"

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

const motionContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
}

const motionItem = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] as const },
  },
}

const KPI_PULSE = [
  {
    label: "חוב לקבלני משנה",
    value: ils.format(4_180_000),
    trendLabel: "+2.4% מהחודש שעבר",
    trendPositive: false,
  },
  {
    label: "חשבונות פתוחים לתשלום",
    value: ils.format(2_940_000),
    trendLabel: "−1.1% מהחודש שעבר",
    trendPositive: true,
  },
  {
    label: "רווחיות גולמית",
    value: "18.6%",
    trendLabel: "+0.6% מהחודש שעבר",
    trendPositive: true,
  },
  {
    label: "חריגות תקציב",
    value: ils.format(1_050_000),
    trendLabel: "+3.2% מהחודש שעבר",
    trendPositive: false,
  },
] as const

type ProjectStatus = "on_track" | "at_risk" | "delayed"

const PROJECTS: {
  name: string
  actual: number
  planned: number
  status: ProjectStatus
}[] = [
  { name: "עיר היין - אשקלון", actual: 62, planned: 58, status: "on_track" },
  { name: "פרויקט נחלים - יפו", actual: 44, planned: 52, status: "at_risk" },
  { name: "ריינבו - שדה דב", actual: 28, planned: 35, status: "delayed" },
]

const AI_ALERTS: { text: string; action: string }[] = [
  {
    text: "זוהתה חריגת כמויות בחשבון קבלן חשמל בבניין 3",
    action: "דחה חשבון",
  },
  {
    text: "עיכוב מסירת קומה מונע כניסת קבלן גבס",
    action: "שלח הודעה למנהל עבודה",
  },
  {
    text: "סטייה של 6% בתקציב איטום ביחס ל-WBS מאושר",
    action: "פתח דוח השוואה",
  },
]

const CASHFLOW_MONTHS = [
  { month: "אפר׳ 26", income: 4_200_000, subcontractor: 2_750_000 },
  { month: "מאי 26", income: 4_550_000, subcontractor: 2_980_000 },
  { month: "יוני 26", income: 4_880_000, subcontractor: 3_120_000 },
  { month: "יולי 26", income: 5_100_000, subcontractor: 3_400_000 },
  { month: "אוג׳ 26", income: 4_920_000, subcontractor: 3_280_000 },
  { month: "ספט׳ 26", income: 5_350_000, subcontractor: 3_510_000 },
]

function StatusBadge({ status }: { status: ProjectStatus }) {
  const cfg = {
    on_track: {
      label: "במסלול",
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
    },
    at_risk: {
      label: "בסיכון",
      className:
        "border-amber-200 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100",
    },
    delayed: {
      label: "בפיגור",
      className:
        "border-red-200 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-100",
    },
  }[status]
  return (
    <Badge variant="outline" className={cn("font-medium", cfg.className)}>
      {cfg.label}
    </Badge>
  )
}

function ActualVsPlannedBar({
  actual,
  planned,
}: {
  actual: number
  planned: number
}) {
  const a = Math.min(100, Math.max(0, actual))
  const p = Math.min(100, Math.max(0, planned))
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>בפועל {a}%</span>
        <span>מתוכנן {p}%</span>
      </div>
      {/* מסלול LTR לפס התקדמות — סטנדרט ויזואלי לאחוז התקדמות */}
      <div
        className="relative w-full"
        dir="ltr"
        role="img"
        aria-label={`התקדמות בפועל ${a} אחוז; מתוכנן ${p} אחוז`}
      >
        <Progress value={a} className="h-2.5 bg-slate-200/90 dark:bg-slate-700" />
        <div
          className="pointer-events-none absolute top-0 z-[2] h-2.5 w-px bg-amber-500 shadow-sm"
          style={{ left: `${p}%`, transform: "translateX(-50%)" }}
          aria-hidden
        />
      </div>
    </div>
  )
}

export function ManagementDashboardClient() {
  const branding = useOrganizationBranding()
  const [chartReady, setChartReady] = React.useState(false)

  React.useEffect(() => {
    setChartReady(true)
  }, [])

  return (
    <motion.div
      className="flex min-h-0 flex-1 flex-col gap-8 md:gap-10"
      variants={motionContainer}
      initial="hidden"
      animate="show"
    >
      <motion.header
        variants={motionItem}
        className="pharmacy-hero-card rounded-xl border border-slate-100 bg-card p-6 shadow-sm md:p-8 dark:border-slate-800 dark:bg-slate-950"
      >
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-card shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {branding.brandLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.brandLogoUrl}
                alt=""
                className="size-full object-contain p-1.5"
              />
            ) : (
              <Building2 className="size-6 text-indigo-900 dark:text-indigo-200" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-700 dark:text-indigo-300">
              {branding.organizationName}
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-indigo-950 md:text-3xl dark:text-slate-50">
              לוח ניהול בכיר — Holden Group
            </h1>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              {branding.slogan}
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              תמונת מצב מרוכזת לניהול: דופק פיננסי, בריאות פרויקטים, סיכונים
              מזוהים ב-AI, ותזרים מול הכרה בהכנסה — בגירסת V1.0.
            </p>
          </div>
        </div>
      </motion.header>

      {/* 1. The Pulse */}
      <motion.section variants={motionItem} className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          הדופק
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {KPI_PULSE.map((k) => (
            <Card
              key={k.label}
              className="h-full border-slate-100 bg-card shadow-sm dark:border-slate-800 dark:bg-slate-950"
            >
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs font-medium text-slate-500">
                    {k.label}
                  </CardDescription>
                  <CardTitle className="font-currency-mono text-2xl font-semibold tabular-nums text-indigo-950 dark:text-slate-50">
                    {k.value}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p
                    className={cn(
                      "text-xs font-medium",
                      k.trendPositive
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    )}
                  >
                    {k.trendLabel}
                  </p>
                </CardContent>
              </Card>
          ))}
        </div>
      </motion.section>

      {/* 2. Middle: Project matrix + AI radar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <motion.section
          variants={motionItem}
          className="space-y-3 lg:col-span-2"
        >
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            מטריצת בריאות פרויקטים
          </h2>
          <Card className="overflow-hidden border-slate-100 shadow-sm dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 bg-background/50 dark:border-slate-800 dark:bg-slate-900/50">
              <CardTitle className="text-base text-indigo-950 dark:text-slate-50">
                פרויקטים פעילים
              </CardTitle>
              <CardDescription>
                השוואת התקדמות בפועל מול תכנון — לפי אחוז השלמה
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-slate-100 p-0 dark:divide-slate-800">
              {PROJECTS.map((proj) => (
                <div
                  key={proj.name}
                  className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium text-indigo-950 dark:text-slate-50">
                      {proj.name}
                    </p>
                    <div className="max-w-md">
                      <ActualVsPlannedBar
                        actual={proj.actual}
                        planned={proj.planned}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 self-start sm:self-center">
                    <StatusBadge status={proj.status} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.section>

        <motion.section variants={motionItem} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            מרכז פיקוד
          </h2>
          <Card className="flex h-full min-h-[280px] flex-col border-indigo-100 bg-gradient-to-b from-indigo-50/40 to-white shadow-sm dark:border-indigo-900/50 dark:from-indigo-950/30 dark:to-slate-950">
            <CardHeader className="flex flex-row items-center gap-2 border-b border-indigo-100/80 pb-3 dark:border-indigo-900/60">
              <Sparkles className="size-5 text-indigo-600 dark:text-indigo-400" aria-hidden />
              <div>
                <CardTitle className="text-base text-indigo-950 dark:text-slate-50">
                  התראות סוכן AI
                </CardTitle>
                <CardDescription className="text-xs">
                  ניתוח בזמן אמת — דוגמה להדגמה
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3 pt-2">
              {AI_ALERTS.map((a, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-indigo-100/80 bg-card/80 p-3 shadow-sm dark:border-indigo-900/60 dark:bg-slate-900/60"
                >
                  <p className="text-sm leading-relaxed text-indigo-950 dark:text-slate-100">
                    {a.text}
                  </p>
                  <div className="mt-3 flex justify-end">
                    <Button size="sm" variant="secondary" type="button">
                      {a.action}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.section>
      </div>

      {/* 3. Cashflow chart */}
      <motion.section variants={motionItem} className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          תזרים והכרה
        </h2>
        <Card className="overflow-hidden border-slate-100 shadow-sm dark:border-slate-800">
          <CardHeader className="border-b border-slate-100 pb-3 dark:border-slate-800">
            <CardTitle className="text-base font-semibold text-indigo-950 dark:text-slate-50">
              תזרים והכרה בהכנסה (6 חודשים קדימה)
            </CardTitle>
            <CardDescription>
              הכרה בהכנסה (קו) מול הוצאות קבלני משנה (עמודות) — בשקלים חדשים
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {!chartReady ? (
              <div className="h-[320px] animate-pulse rounded-xl bg-muted/25" />
            ) : (
              <div className="h-[320px] w-full min-h-[300px]" dir="ltr">
                <ResponsiveContainer width="100%" height={320} minHeight={300}>
                  <ComposedChart
                    data={[...CASHFLOW_MONTHS]}
                    margin={{ top: 8, right: 12, left: 4, bottom: 8 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border/60"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      interval={0}
                      height={36}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      width={56}
                      tickFormatter={(v) =>
                        typeof v === "number"
                          ? v.toLocaleString("he-IL", {
                              maximumFractionDigits: 0,
                              notation: v >= 1_000_000 ? "compact" : "standard",
                            })
                          : String(v)
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        direction: "rtl",
                        textAlign: "right",
                        borderRadius: "0.5rem",
                        border: "1px solid hsl(var(--border))",
                        background: "hsl(var(--popover))",
                        color: "hsl(var(--popover-foreground))",
                      }}
                      formatter={(value, name) => {
                        const n =
                          typeof value === "number"
                            ? value
                            : Number(value ?? 0)
                        const label =
                          name === "income"
                            ? "הכרה בהכנסה"
                            : name === "subcontractor"
                              ? "הוצאות קבלנים"
                              : String(name)
                        return [ils.format(n), label]
                      }}
                    />
                    <Legend
                      wrapperStyle={{ direction: "rtl", fontSize: 12 }}
                      formatter={(value) =>
                        value === "income"
                          ? "הכרה בהכנסה"
                          : value === "subcontractor"
                            ? "הוצאות קבלני משנה"
                            : value
                      }
                    />
                    <Bar
                      dataKey="subcontractor"
                      fill="#cbd5e1"
                      name="subcontractor"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                    <Line
                      type="monotone"
                      dataKey="income"
                      name="income"
                      stroke="#475569"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#475569" }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.section>

    </motion.div>
  )
}
