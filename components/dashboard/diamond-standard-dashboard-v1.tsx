"use client"

import * as React from "react"
import Link from "next/link"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Briefcase,
  FileSearch,
  Gavel,
  Landmark,
  Truck,
  Wallet,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useModuleVisibilityOptional } from "@/components/marker-ofek/marker-ofek-dashboard-context"
import { cn } from "@/lib/utils"
import { formatNisHe } from "@/lib/format-nis"
import { playDiamondDashboardEntrySwoosh } from "@/lib/marker-ofek/diamond-ui-audio"
import { isPillarVisible } from "@/lib/marker-ofek/module-registry"
import {
  MARKER_OFEK_PILLARS,
  type MarkerOfekPillar,
} from "@/lib/marker-ofek/pillar-registry"

const COMMAND_CENTER_PILLAR_IDS = [
  "procurement",
  "tenders",
  "field-execution",
  "contracts-billing",
  "finance",
] as const

const PILLAR_ICONS: Record<(typeof COMMAND_CENTER_PILLAR_IDS)[number], LucideIcon> = {
  procurement: Truck,
  tenders: FileSearch,
  "field-execution": Briefcase,
  "contracts-billing": Landmark,
  finance: Wallet,
}

/** נתוני הדגמה — פרויקטים עיר היין (מגורים) ושוסטר (מסחר) */
const PULSE_MOCK = {
  subcontractorDebt: 2_684_500,
  openReceipts: 23,
  grossProfitPct: 19.4,
  budgetDeviationPct: -2.8,
}

const INCOME_EXPENSES_MOCK = [
  { month: "אפר׳ 26", income: 4_820_000, expenses: 3_910_000 },
  { month: "מאי 26", income: 5_100_000, expenses: 4_050_000 },
  { month: "יוני 26", income: 4_650_000, expenses: 3_780_000 },
  { month: "יולי 26", income: 5_420_000, expenses: 4_200_000 },
  { month: "אוג׳ 26", income: 5_050_000, expenses: 4_010_000 },
  { month: "ספט׳ 26", income: 4_890_000, expenses: 3_920_000 },
]

const OPEN_TASKS_MOCK = {
  total: 47,
  rows: [
    {
      label: "עיר היין — אישור ועדת מכרז (שלב גמר)",
      count: 3,
      href: "/marker-ofek/tenders",
      hot: true,
    },
    {
      label: "שוסטר — התאמת חשבונית ספק למכסה תקציבית",
      count: 2,
      href: "/marker-ofek/procurement/reconciliation",
      hot: true,
    },
    {
      label: "עיר היין — חתימת נספח רכש (אלומיניום)",
      count: 1,
      href: "/marker-ofek/procurement/orders",
      hot: false,
    },
    {
      label: "שוסטר — תסקיר לחץ קומות מסחר",
      count: 1,
      href: "/marker-ofek/execution/daily-logs",
      hot: false,
    },
    {
      label: "עיר היין — חשבונית חלקית מס׳ 4 — להפקה",
      count: 1,
      href: "/marker-ofek/finance/partials",
      hot: false,
    },
    {
      label: "שוסטר — עדכון סטיית תקציב בבקרה",
      count: 2,
      href: "/marker-ofek/budget",
      hot: false,
    },
  ],
}

function formatDateHe(d: Date): string {
  return d.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function PulseKpiCard({
  title,
  value,
  hint,
}: {
  title: string
  value: string
  hint?: string
}) {
  return (
    <Card
      size="sm"
      className="border-slate-200/80 bg-card shadow-sm"
    >
      <CardHeader className="border-b border-slate-100 pb-3">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <p className="font-currency-mono text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </p>
        {hint ? (
          <p className="mt-2 text-xs leading-relaxed text-slate-500">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function CoreModuleCard({ pillar }: { pillar: MarkerOfekPillar }) {
  const Icon = PILLAR_ICONS[pillar.id as keyof typeof PILLAR_ICONS] ?? Gavel
  const quick = pillar.quickActions.slice(0, 3)
  return (
    <Card
      className={cn(
        "group relative flex min-h-[280px] flex-col overflow-hidden border-slate-200/90 bg-card shadow-md transition-shadow duration-200",
        "hover:border-slate-300 hover:shadow-lg",
        "focus-within:ring-2 focus-within:ring-slate-900/10"
      )}
    >
      <Link
        href={pillar.href}
        className={cn(
          "flex flex-1 flex-col p-7 text-foreground outline-none",
          "focus-visible:ring-2 focus-visible:ring-slate-900/25 focus-visible:ring-offset-2"
        )}
      >
        <span className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-slate-100 bg-background text-slate-700">
          <Icon className="size-7" strokeWidth={1.35} aria-hidden />
        </span>
        <span className="text-2xl font-semibold tracking-tight">{pillar.navTitle}</span>
        <span className="mt-3 flex-1 text-sm leading-relaxed text-slate-600">
          {pillar.tagline}
        </span>
        {quick.length > 0 ? (
          <ul className="mt-6 space-y-2 border-t border-slate-100 pt-5">
            {quick.map((a) => (
              <li
                key={a.href + a.title}
                className="flex items-center gap-2 text-xs text-slate-600"
              >
                <span
                  className="size-1.5 shrink-0 rounded-full bg-slate-900/20 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden
                />
                <span className="font-currency-mono text-[13px]">{a.title}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Link>
    </Card>
  )
}

export function DiamondStandardDashboardV1() {
  const mod = useModuleVisibilityOptional()
  const modules = mod?.modules
  const [chartReady, setChartReady] = React.useState(false)

  React.useEffect(() => {
    playDiamondDashboardEntrySwoosh()
  }, [])

  React.useEffect(() => {
    setChartReady(true)
  }, [])

  const pillarsFiltered =
    modules == null
      ? MARKER_OFEK_PILLARS
      : MARKER_OFEK_PILLARS.filter((p) => isPillarVisible(p.id, modules))

  const pillarsForCore = COMMAND_CENTER_PILLAR_IDS.map((id) =>
    pillarsFiltered.find((p) => p.id === id)
  ).filter((p): p is MarkerOfekPillar => p != null)

  const dateLabel = formatDateHe(new Date())

  return (
    <div
      dir="rtl"
      lang="he"
      className="mx-auto w-full max-w-[1600px] bg-card px-4 py-8 text-foreground md:px-8 md:py-10"
    >
      {/* Header */}
      <header className="mb-10 flex flex-col gap-2 border-b border-slate-100 pb-8 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            בוקר טוב, אופיר
          </h1>
          <p className="text-sm text-slate-500">לוח בקרה — סטנדרט יהלום V1.0</p>
        </div>
        <p className="text-sm font-medium text-slate-600 md:text-base" suppressHydrationWarning>
          {dateLabel}
        </p>
      </header>

      {/* Pulse */}
      <section className="mb-12" aria-label="מדדי דופק">
        <h2 className="sr-only">שורת KPI</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PulseKpiCard
            title="חוב לקבלני משנה"
            value={formatNisHe(PULSE_MOCK.subcontractorDebt)}
            hint="מורכב מעיר היין ושוסטר — לפי שורות פתוחות באגרות."
          />
          <PulseKpiCard
            title="קבלות פתוחות"
            value={`${PULSE_MOCK.openReceipts}`}
            hint="ממתינות לאישור או לקליטה במערכת."
          />
          <PulseKpiCard
            title="רווח גולמי (מוערך)"
            value={`${PULSE_MOCK.grossProfitPct.toLocaleString("he-IL")}%`}
            hint="ממוצע משוקלל בין שני הפרויקטים המובילים."
          />
          <PulseKpiCard
            title="סטיות תקציב"
            value={`${PULSE_MOCK.budgetDeviationPct > 0 ? "+" : ""}${PULSE_MOCK.budgetDeviationPct.toLocaleString("he-IL")}%`}
            hint="שלילי = מתחת לתקציב המאושר."
          />
        </div>
      </section>

      {/* Core modules — focal point */}
      <section className="mb-14" aria-labelledby="diamond-core-heading">
        <div className="mb-8 text-center md:text-start">
          <h2
            id="diamond-core-heading"
            className="text-lg font-semibold tracking-tight text-foreground md:text-xl"
          >
            הליבה — מודולים
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            נקודת הכניסה הראשית לרכש, מכרזים, פרויקטים, חוזה וחשבונות וכספים — פרויקטי הדגמה:{" "}
            <span className="font-medium text-slate-800">עיר היין</span>,{" "}
            <span className="font-medium text-slate-800">שוסטר</span>.
          </p>
        </div>
        <div
          className="grid auto-rows-fr gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
          role="navigation"
          aria-label="מודולי ליבה"
        >
          {pillarsForCore.map((pillar) => (
            <CoreModuleCard key={pillar.id} pillar={pillar} />
          ))}
        </div>
      </section>

      {/* Executive charts */}
      <section className="mb-12" aria-labelledby="diamond-charts-heading">
        <Card className="border-slate-200/90 bg-card shadow-sm">
          <CardHeader className="border-b border-slate-100">
            <CardTitle
              id="diamond-charts-heading"
              className="text-base font-semibold text-foreground"
            >
              הכנסות מול הוצאות (6 חודשים קדימה)
            </CardTitle>
            <CardDescription className="text-pretty text-slate-600">
              תרשים הדגמה המשקף עומסי חוזה משולבים — עיר היין (מגורים) ושוסטר (מסחר).
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {!chartReady ? (
              <div className="h-[320px] animate-pulse rounded-lg bg-background" />
            ) : (
              <div className="h-[320px] w-full min-h-[300px]" dir="ltr">
                <ResponsiveContainer width="100%" height={320} minWidth={0} minHeight={300}>
                  <BarChart
                    data={INCOME_EXPENSES_MOCK}
                    margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      axisLine={{ stroke: "#e2e8f0" }}
                    />
                    <YAxis
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      tickFormatter={(v) =>
                        `${(Number(v) / 1_000_000).toLocaleString("he-IL", { maximumFractionDigits: 1 })}M`
                      }
                      axisLine={{ stroke: "#e2e8f0" }}
                    />
                    <Tooltip
                      formatter={(value, name) => {
                        const n =
                          typeof value === "number"
                            ? value
                            : Number(value) || 0
                        const label =
                          name === "income" || name === "הכנסות"
                            ? "הכנסות"
                            : "הוצאות"
                        return [formatNisHe(n), label]
                      }}
                      labelStyle={{ direction: "rtl" }}
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                      }}
                    />
                    <Legend
                      wrapperStyle={{ direction: "rtl", paddingTop: 12 }}
                      formatter={(value) =>
                        value === "income" ? "הכנסות" : "הוצאות"
                      }
                    />
                    <Bar
                      dataKey="income"
                      name="income"
                      fill="#0f172a"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={48}
                    />
                    <Bar
                      dataKey="expenses"
                      name="expenses"
                      fill="#cbd5e1"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={48}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Collapsible tasks — default closed */}
      <section aria-label="משימות פתוחות">
        <Card className="border-slate-200/90 bg-card shadow-sm">
          <CardContent className="py-2">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="open-tasks" className="border-0">
                <AccordionHeader>
                  <AccordionTrigger className="px-1 py-3 hover:no-underline">
                    <span>
                      משימות פתוחות ({OPEN_TASKS_MOCK.total})
                    </span>
                  </AccordionTrigger>
                </AccordionHeader>
                <AccordionContent className="px-1">
                  <ul className="space-y-0.5 border-t border-slate-100 py-3">
                    {OPEN_TASKS_MOCK.rows.map((a) => (
                      <li key={a.label}>
                        <Link
                          href={a.href}
                          className={cn(
                            "flex items-center justify-between gap-3 rounded-lg border border-transparent px-2 py-2.5 text-xs text-slate-700 outline-none",
                            "hover:border-slate-100 hover:bg-background",
                            "focus-visible:ring-2 focus-visible:ring-slate-900/20 focus-visible:ring-offset-2"
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className={cn(
                                "size-2 shrink-0 rounded-full",
                                a.hot ? "bg-rose-500" : "bg-slate-200"
                              )}
                              aria-hidden
                            />
                            <span>{a.label}</span>
                          </span>
                          <span className="font-currency-mono tabular-nums text-foreground">
                            {a.count}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
