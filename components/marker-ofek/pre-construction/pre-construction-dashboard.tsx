"use client"

import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import {
  Activity,
  ArrowLeft,
  CircleDollarSign,
  Inbox,
  LayoutDashboard,
  Send,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ROLLUP_LABEL_HE,
  type PreConstructionDashboardData,
  type TenderRollupStatus,
} from "@/lib/marker-ofek/pre-construction-dashboard-types"
import { cn } from "@/lib/utils"

const CHART_FILL: Record<TenderRollupStatus, string> = {
  to_execution: "var(--chart-1)",
  for_tender: "var(--chart-2)",
  for_review: "var(--chart-3)",
  ai_failed: "var(--chart-4)",
  no_docs: "var(--chart-5)",
}

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

type PreConstructionDashboardProps = {
  data: PreConstructionDashboardData
}

function KpiCard({
  title,
  value,
  description,
  icon: Icon,
  className,
}: {
  title: string
  value: string
  description?: string
  icon: LucideIcon
  className?: string
}) {
  return (
    <Card
      className={cn(
        "border-border/70 shadow-sm transition-shadow hover:shadow-md",
        className
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div className="space-y-1 text-start">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {value}
          </p>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="rounded-xl bg-muted/80 p-2.5 text-muted-foreground">
          <Icon className="size-5" aria-hidden />
        </div>
      </CardHeader>
    </Card>
  )
}

export function PreConstructionDashboard({ data }: PreConstructionDashboardProps) {
  const {
    totalTenders,
    pipelineValue,
    activeTenders,
    pendingRfps,
    submittedTenders,
    statusChart,
    recentTenders,
    loadError,
    boqLoadWarning,
  } = data

  const barData = statusChart.map((d) => ({
    name: d.label,
    count: d.count,
    status: d.status,
  }))

  return (
    <div dir="rtl" lang="he" className="mx-auto w-full max-w-7xl space-y-8 pb-10 pt-2">
      <Link
        href="/marker-ofek"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 rotate-180" aria-hidden />
        חזרה למרכז המודולים
      </Link>

      <header className="space-y-2 text-start">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-border/60">
            <LayoutDashboard className="size-6" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              סעיף 1.5 · קדם ביצוע
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              מרכז שליטה - קדם ביצוע
            </h1>
          </div>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-[15px]">
          תמונת מצב של מכרזים, שווי צנרת מתמחור כתב כמויות (BoQ), והתקדמות לפי סטטוס
          מסמכים — ניהול אחוד לפני יציאה לביצוע.
        </p>
      </header>

      {loadError ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {loadError}
        </div>
      ) : null}

      {boqLoadWarning ? (
        <p className="text-start text-xs text-amber-700">
          לא ניתן לחשב שווי צנרת מלא: {boqLoadWarning}
        </p>
      ) : null}

      <section aria-label="מדדי ביצועים" className="space-y-3">
        <h2 className="text-start text-sm font-semibold text-foreground">
          מדדים עיקריים
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="מכרזים פעילים"
            value={activeTenders.toLocaleString("he-IL")}
            description="מסמכים במצב „למכרז”"
            icon={Activity}
          />
          <KpiCard
            title="שווי צנרת פוטנציאלי"
            value={currencyFormatter.format(pipelineValue)}
            description="סכום (מחיר סופי × כמות) מכל שורות BoQ"
            icon={CircleDollarSign}
          />
          <KpiCard
            title="הצעות חברות ביצוע ממתינות"
            value={pendingRfps.toLocaleString("he-IL")}
            description="בבדיקה, ללא מסמכים, או כשל AI"
            icon={Inbox}
          />
          <KpiCard
            title="מכרזים שהוגשו"
            value={submittedTenders.toLocaleString("he-IL")}
            description="מסמכים במצב „להוצאה לפועל”"
            icon={Send}
          />
        </div>
        <p className="text-start text-xs text-muted-foreground">
          סה״כ מכרזים במערכת:{" "}
          <span className="font-medium text-foreground">
            {totalTenders.toLocaleString("he-IL")}
          </span>
        </p>
      </section>

      <section
        aria-label="תרשים ומכרזים אחרונים"
        className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start"
      >
        <Card className="overflow-hidden border-border/70 shadow-sm lg:order-1">
          <CardHeader className="border-b border-border/50 pb-3 text-start">
            <CardTitle className="text-base font-semibold">
              מכרזים לפי סטטוס מסמכים
            </CardTitle>
            <CardDescription>
              לכל מכרז נבחר הסטטוס המתקדם ביותר מתוך כל המסמכים המצורפים
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {barData.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                אין עדיין מכרזים להצגה
              </p>
            ) : (
              <div className="h-[300px] w-full min-h-[280px]" dir="ltr">
                <ResponsiveContainer width="100%" height="100%" minHeight={280}>
                  <BarChart
                    data={barData}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border/60"
                      horizontal={false}
                    />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
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
                      formatter={(value) => [
                        `${Number(value).toLocaleString("he-IL")} מכרזים`,
                        "כמות",
                      ]}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={32}>
                      {barData.map((entry) => (
                        <Cell
                          key={entry.status}
                          fill={CHART_FILL[entry.status] ?? "var(--chart-5)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm lg:order-2">
          <CardHeader className="border-b border-border/50 text-start">
            <CardTitle className="text-base font-semibold">
              מכרזים אחרונים
            </CardTitle>
            <CardDescription>
              חמשת המכרזים שנוצרו לאחרונה
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {recentTenders.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                אין מכרזים ברשימה
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {recentTenders.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 text-start">
                      <p className="truncate font-medium text-foreground">
                        {t.project_name_from_ai?.trim() || "ללא שם פרויקט"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ROLLUP_LABEL_HE[t.rollup]} ·{" "}
                        {new Date(t.created_at).toLocaleString("he-IL", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <Link
                      href={`/marker-ofek/pre-construction/tender-pricing?tender=${encodeURIComponent(t.id)}`}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "shrink-0 gap-1"
                      )}
                    >
                      תמחור
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border/50 pt-4">
              <Link
                href="/marker-ofek/pre-construction/tender-intake"
                className={cn(
                  buttonVariants({ variant: "secondary", size: "sm" })
                )}
              >
                קליטת מכרז
              </Link>
              <Link
                href="/marker-ofek/pre-construction/tender-pricing"
                className={cn(
                  buttonVariants({ variant: "secondary", size: "sm" })
                )}
              >
                כל התמחור
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
