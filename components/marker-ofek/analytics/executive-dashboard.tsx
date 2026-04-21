"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { z } from "zod"
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  ChevronDown,
  Download,
  LineChart,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { HighRiskApprovalsWidget } from "@/components/marker-ofek/analytics/high-risk-approvals-widget"
import {
  EXECUTIVE_MOCK_CASH_FLOW_FORECAST_3M,
  EXECUTIVE_MOCK_CEO_ALERTS,
  EXECUTIVE_MOCK_EXPECTED_CASHFLOW_NEXT_MONTH,
  EXECUTIVE_MOCK_PROJECTS,
  categoryBudgetUtilizationPercent,
  computeExecutiveCompanyKpis,
  grossMarginPercentOnBilled,
  type ExecutiveCeoAlert,
  type ExecutiveProjectCostCategory,
  type ExecutiveProjectSnapshot,
} from "@/lib/marker-ofek/executive-analytics-mock-data"
import { MD_QUERY } from "@/lib/marker-ofek/master-detail-nav"
import { apiGet } from "@/lib/utils/api-client"
import { cn } from "@/lib/utils"

const ExecutiveCashFlowChart = dynamic(
  () =>
    import("./executive-cash-flow-chart").then((m) => ({
      default: m.ExecutiveCashFlowChart,
    })),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-[280px] animate-pulse rounded-lg bg-background"
        aria-hidden
      />
    ),
  }
)

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

const pct = new Intl.NumberFormat("he-IL", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
})

const CHART_IN = "expectedIn"
const CHART_OUT = "expectedOut"

const weeklyArchiveResponseSchema = z.object({
  rows: z.array(
    z.object({
      id: z.string(),
      generatedAt: z.string(),
      topProjectName: z.string(),
      topProjectOffsetVelocityDays: z.coerce.number(),
      summary: z.object({
        totalProjects: z.coerce.number(),
        totalRevenue: z.coerce.number(),
        averageMarginPct: z.coerce.number(),
        highVarianceCount: z.coerce.number(),
        healthyProjects: z.coerce.number(),
        attentionProjects: z.coerce.number(),
        forecastingAccuracyIndex: z.coerce.number(),
        offsetVelocityDays: z.coerce.number(),
        projectHealthScore: z.coerce.number(),
      }),
      pmAccuracyRanking: z.array(
        z.object({
          managerName: z.string(),
          forecastingAccuracyPct: z.coerce.number(),
          rank: z.coerce.number(),
          sampleCount: z.coerce.number(),
        })
      ),
      riskAlerts: z.array(
        z.object({
          projectId: z.string(),
          projectName: z.string(),
          healthScore: z.coerce.number(),
          pdfUrl: z.string(),
        })
      ),
      emailSent: z.boolean(),
      whatsappSent: z.boolean(),
    })
  ),
})

type WeeklyArchiveResponse = z.infer<typeof weeklyArchiveResponseSchema>

function notifySuccess(title: string, description?: string) {
  toast.success(title, { description })
}

export function ExecutiveDashboard() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [expandedProjectId, setExpandedProjectId] = React.useState<string | null>(
    null
  )
  const [weeklyArchive, setWeeklyArchive] = React.useState<WeeklyArchiveResponse["rows"]>([])
  const [weeklyArchiveLoading, setWeeklyArchiveLoading] = React.useState(false)
  const [weeklyArchiveError, setWeeklyArchiveError] = React.useState<string | null>(null)

  const expandedProjectIdRef = React.useRef<string | null>(null)
  React.useLayoutEffect(() => {
    expandedProjectIdRef.current = expandedProjectId
  }, [expandedProjectId])

  React.useEffect(() => {
    const pid = searchParams.get(MD_QUERY.entity)?.trim()
    if (pid && EXECUTIVE_MOCK_PROJECTS.some((p) => p.id === pid)) {
      setExpandedProjectId(pid)
    }
  }, [searchParams])

  React.useEffect(() => {
    let isCurrentRequest = true
    const controller = new AbortController()
    const loadArchive = async () => {
      setWeeklyArchiveLoading(true)
      setWeeklyArchiveError(null)
      try {
        const response = await apiGet<WeeklyArchiveResponse>(
          "/api/erp/analytics/weekly-reports-archive?limit=16",
          {
            schema: weeklyArchiveResponseSchema,
            signal: controller.signal,
          }
        )
        if (!controller.signal.aborted && isCurrentRequest) {
          setWeeklyArchive(response.rows)
        }
      } catch (error) {
        if (controller.signal.aborted) return
        if (isCurrentRequest) {
          setWeeklyArchive([])
          setWeeklyArchiveError(error instanceof Error ? error.message : "טעינת ארכיון נכשלה")
        }
      } finally {
        if (!controller.signal.aborted && isCurrentRequest) {
          setWeeklyArchiveLoading(false)
        }
      }
    }
    void loadArchive()
    return () => {
      isCurrentRequest = false
      controller.abort()
    }
  }, [])

  const toggleProjectExpansion = React.useCallback(
    (id: string) => {
      const cur = expandedProjectIdRef.current
      const next = cur === id ? null : id
      expandedProjectIdRef.current = next
      setExpandedProjectId(next)
      const params = new URLSearchParams(searchParams.toString())
      if (next) params.set(MD_QUERY.entity, next)
      else params.delete(MD_QUERY.entity)
      const q = params.toString()
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  const kpis = React.useMemo(
    () =>
      computeExecutiveCompanyKpis(
        EXECUTIVE_MOCK_PROJECTS,
        EXECUTIVE_MOCK_EXPECTED_CASHFLOW_NEXT_MONTH
      ),
    []
  )

  const cashFlowChartData = React.useMemo(
    () =>
      EXECUTIVE_MOCK_CASH_FLOW_FORECAST_3M.map((m) => ({
        name: m.labelHe,
        [CHART_IN]: m.expectedIn,
        [CHART_OUT]: m.expectedOut,
      })),
    []
  )
  const hasCashFlowData = cashFlowChartData.length > 0
  const hasProjects = EXECUTIVE_MOCK_PROJECTS.length > 0
  const hasAlerts = EXECUTIVE_MOCK_CEO_ALERTS.length > 0

  return (
    <div
      dir="rtl"
      lang="he"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 bg-card p-3 text-foreground md:p-4 [color-scheme:light]"
    >
      {/* Action ribbon */}
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-background">
              <BarChart3 className="size-4 text-slate-700" aria-hidden />
            </span>
            <h1 className="text-base font-bold tracking-tight text-foreground md:text-lg">
              אנליטיקה ודוחות הנהלה (BI)
            </h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            מבט חוצה־פרויקטים — רווחיות, תזרים, פירוח עלויות והתחייבויות (דמה
            Phase 9.3)
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-2 border-slate-300"
          onClick={() =>
            notifySuccess("ייצוא דוח חודשי הושלם", "הופק קובץ הדגמה מקומי.")
          }
        >
          <Download className="size-4" aria-hidden />
          ייצא דוח חודשי כולל
        </Button>
      </header>

      {/* Company-wide KPI row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MassKpiCard
          icon={LineChart}
          label='סה״כ הכנסות'
          value={ils.format(kpis.totalRevenueBilled)}
          sub="מחויב לתאריך — כל הפרויקטים הפעילים"
          accent="text-emerald-700"
        />
        <MassKpiCard
          icon={TrendingDown}
          label="סה״כ הוצאות"
          value={ils.format(kpis.totalCosts)}
          sub="עלויות ביצוע ורכש מצטברות"
          accent="text-foreground"
        />
        <MassKpiCard
          icon={Banknote}
          label="תזרים צפוי לחודש הקרוב"
          value={ils.format(kpis.expectedCashflowNextMonth)}
          sub="הערכת נזילות — דמה"
          accent="text-sky-700"
        />
        <MassKpiCard
          icon={AlertTriangle}
          label="ליקויים קריטיים פתוחים — חברה"
          value={String(kpis.totalCriticalQaOpen)}
          sub="סה״כ מכלל הפרויקטים"
          accent="font-semibold text-red-600"
        />
      </div>

      {/* Cash flow forecast — full width */}
      <section className="flex flex-col rounded-lg border border-slate-200 bg-card shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-foreground">
            תחזית תזרים מזומנים (3 חודשים קדימה)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            צפי הכנסות (ירוק) מול צפי הוצאות (אדום) — דמה הנהלתי
          </p>
        </div>
        <div className="p-3 md:p-4">
          {hasCashFlowData ? (
            <ExecutiveCashFlowChart data={cashFlowChartData} />
          ) : (
            <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-background text-sm text-slate-500">
              אין נתוני תחזית תזרים להצגה.
            </div>
          )}
        </div>
      </section>

      {/* Split: RTL — טבלת פרויקטים + התראות */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        <section className="flex min-h-[320px] flex-col rounded-lg border border-slate-200 bg-card shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-bold text-foreground">
              סטטוס פיננסי לפי פרויקט
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              לחיצה על שורה לפירוח עלויות מול תקציב קטגוריאלי — חומרים, קבלני משנה,
              כוח אדם
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            <Table dir="rtl">
              <TableHeader>
                <TableRow className="border-slate-200 hover:bg-transparent">
                  <TableHead className="w-8 p-2" aria-hidden />
                  <TableHead className="text-right font-semibold text-slate-800">
                    פרויקט
                  </TableHead>
                  <TableHead className="text-left font-semibold text-slate-800">
                    תקציב בסיס
                  </TableHead>
                  <TableHead className="text-left font-semibold text-slate-800">
                    הכנסה צפויה
                  </TableHead>
                  <TableHead className="text-left font-semibold text-slate-800">
                    חויב לתאריך
                  </TableHead>
                  <TableHead className="text-left font-semibold text-slate-800">
                    עלות מצטברת
                  </TableHead>
                  <TableHead className="text-left font-semibold text-slate-800">
                    מרווח גולמי %
                  </TableHead>
                  <TableHead className="text-left font-semibold text-slate-800">
                    QA קריטי
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!hasProjects ? (
                  <TableRow className="border-slate-100">
                    <TableCell
                      colSpan={8}
                      className="px-3 py-6 text-center text-xs text-slate-500"
                    >
                      אין פרויקטים פעילים להצגה.
                    </TableCell>
                  </TableRow>
                ) : null}
                {EXECUTIVE_MOCK_PROJECTS.map((p) => (
                  <ProjectFinancialRow
                    key={p.id}
                    project={p}
                    expanded={expandedProjectId === p.id}
                    onToggleProject={toggleProjectExpansion}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="flex min-h-[320px] flex-col rounded-lg border border-slate-200 bg-card shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-bold text-foreground">התראות מנכ״ל</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              חמש התראות מובילות — איחורי תשלום, לו״ז, תזרים וליקויים
            </p>
          </div>
          <ul className="flex flex-1 flex-col gap-2 overflow-auto p-3">
            {!hasAlerts ? (
              <li className="rounded-md border border-dashed border-slate-200 bg-background px-3 py-4 text-xs text-slate-500">
                אין התראות פעילות כרגע.
              </li>
            ) : null}
            {EXECUTIVE_MOCK_CEO_ALERTS.map((a) => (
              <CeoAlertRow key={a.id} alert={a} />
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-card shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-foreground">Weekly Reports Archive</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            דוחות שבועיים היסטוריים: Green Corner, דירוג PM ופרויקטי סיכון עם קישורי PDF.
          </p>
        </div>
        <div className="overflow-auto p-2">
          <Table dir="rtl">
            <TableHeader>
              <TableRow className="border-slate-200 hover:bg-transparent">
                <TableHead className="text-right">תאריך הפקה</TableHead>
                <TableHead className="text-right">Top Project (Offset)</TableHead>
                <TableHead className="text-left">Health ממוצע</TableHead>
                <TableHead className="text-left">Forecast Accuracy</TableHead>
                <TableHead className="text-left">Risk Alerts</TableHead>
                <TableHead className="text-left">Dispatch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {weeklyArchiveLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-xs text-slate-500">
                    טוען ארכיון שבועי...
                  </TableCell>
                </TableRow>
              ) : weeklyArchiveError ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-xs text-red-600">
                    {weeklyArchiveError}
                  </TableCell>
                </TableRow>
              ) : weeklyArchive.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-xs text-slate-500">
                    אין דוחות שבועיים בארכיון.
                  </TableCell>
                </TableRow>
              ) : (
                weeklyArchive.map((row) => (
                  <TableRow key={row.id} className="border-slate-100">
                    <TableCell className="text-xs text-slate-700">
                      {new Date(row.generatedAt).toLocaleString("he-IL")}
                    </TableCell>
                    <TableCell className="text-xs text-slate-800">
                      {row.topProjectName || "—"}
                      <div className="font-mono text-[11px] text-slate-500">
                        {row.topProjectOffsetVelocityDays > 0
                          ? `${row.topProjectOffsetVelocityDays.toFixed(2)}d`
                          : "n/a"}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.summary.projectHealthScore.toFixed(1)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {(row.summary.forecastingAccuracyIndex * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.riskAlerts.length === 0 ? (
                        <span className="text-slate-500">—</span>
                      ) : (
                        <div className="space-y-1">
                          {row.riskAlerts.slice(0, 2).map((risk) => (
                            <a
                              key={`${row.id}-${risk.projectId}`}
                              href={risk.pdfUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block text-blue-700 underline"
                            >
                              {risk.projectName} ({risk.healthScore.toFixed(1)})
                            </a>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span
                        className={cn(
                          "inline-flex rounded px-2 py-0.5 font-medium",
                          row.whatsappSent ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        )}
                      >
                        WA {row.whatsappSent ? "sent" : "failed"}
                      </span>
                      <span
                        className={cn(
                          "ms-1 inline-flex rounded px-2 py-0.5 font-medium",
                          row.emailSent ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        )}
                      >
                        Mail {row.emailSent ? "sent" : "failed"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* High-Risk Approvals — Bento red-flags widget fed by the
          /api/erp/dashboard/high-variance-overrides endpoint. */}
      <HighRiskApprovalsWidget />
    </div>
  )
}

const ProjectFinancialRow = React.memo(function ProjectFinancialRow({
  project: p,
  expanded,
  onToggleProject,
}: {
  project: ExecutiveProjectSnapshot
  expanded: boolean
  onToggleProject: (id: string) => void
}) {
  const margin = grossMarginPercentOnBilled(p.billedToDate, p.costsToDate)

  const activate = React.useCallback(() => {
    onToggleProject(p.id)
  }, [onToggleProject, p.id])

  return (
    <React.Fragment>
      <TableRow
        className={cn(
          "cursor-pointer border-slate-100 transition-colors",
          expanded ? "bg-background" : "hover:bg-background/80"
        )}
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            activate()
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={expanded}
        aria-label={`${p.name} — ${expanded ? "סגור פירוט" : "פתח פירוט עלויות"}`}
      >
        <TableCell className="w-8 p-2 align-middle">
          <ChevronDown
            className={cn(
              "size-4 text-slate-500 transition-transform",
              expanded ? "rotate-180" : "rotate-[-90deg]"
            )}
            aria-hidden
          />
        </TableCell>
        <TableCell className="max-w-[140px] text-right font-medium text-foreground">
          {p.name}
        </TableCell>
        <TableCell className="whitespace-nowrap text-left tabular-nums text-slate-800">
          {ils.format(p.baselineBudget)}
        </TableCell>
        <TableCell className="whitespace-nowrap text-left tabular-nums text-slate-800">
          {ils.format(p.totalExpectedRevenue)}
        </TableCell>
        <TableCell className="whitespace-nowrap text-left tabular-nums text-slate-800">
          {ils.format(p.billedToDate)}
        </TableCell>
        <TableCell className="whitespace-nowrap text-left tabular-nums text-slate-800">
          {ils.format(p.costsToDate)}
        </TableCell>
        <TableCell className="text-left">
          {margin == null ? (
            <span className="text-xs text-slate-400">—</span>
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-1 tabular-nums text-sm font-semibold",
                margin >= 12
                  ? "text-emerald-700"
                  : margin >= 6
                    ? "text-amber-700"
                    : "text-red-700"
              )}
            >
              {margin >= 0 ? (
                <TrendingUp className="size-3.5 shrink-0" aria-hidden />
              ) : (
                <TrendingDown className="size-3.5 shrink-0" aria-hidden />
              )}
              {pct.format(margin)}%
            </span>
          )}
        </TableCell>
        <TableCell className="text-left">
          <span
            className={cn(
              "tabular-nums text-sm font-medium",
              p.openQA_Critical > 0 ? "text-red-600" : "text-slate-600"
            )}
          >
            {p.openQA_Critical}
          </span>
        </TableCell>
      </TableRow>
      {expanded ? (
        <TableRow className="border-slate-100 bg-background/90 hover:bg-background/90">
          <TableCell colSpan={8} className="p-0">
            <ProjectCostDrillDown
              projectName={p.name}
              baselineBudget={p.baselineBudget}
              categories={p.costBreakdown}
            />
          </TableCell>
        </TableRow>
      ) : null}
    </React.Fragment>
  )
})

function ProjectCostDrillDown({
  projectName,
  baselineBudget,
  categories,
}: {
  projectName: string
  baselineBudget: number
  categories: ExecutiveProjectCostCategory[]
}) {
  const actualTotal = React.useMemo(
    () => categories.reduce((sum, c) => sum + c.actualCost, 0),
    [categories]
  )
  const totalUtilization =
    baselineBudget > 0 ? (actualTotal / baselineBudget) * 100 : null
  const totalOverBudget = baselineBudget > 0 && actualTotal > baselineBudget

  return (
    <div className="border-t border-slate-200 px-3 py-3 md:px-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        פירוח עלויות — {projectName}
      </p>
      <div className="mb-2 grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-card p-2 text-[11px] sm:grid-cols-3">
        <div className="text-slate-600">
          תקציב בסיס פרויקט:{" "}
          <span className="font-semibold text-foreground">
            {ils.format(baselineBudget)}
          </span>
        </div>
        <div className="text-slate-600">
          עלות מצטברת בפירוח:{" "}
          <span
            className={cn(
              "font-semibold",
              totalOverBudget ? "text-red-600" : "text-foreground"
            )}
          >
            {ils.format(actualTotal)}
          </span>
        </div>
        <div className="text-slate-600">
          ניצול כולל:{" "}
          <span
            className={cn(
              "font-semibold",
              totalUtilization != null && totalUtilization > 100
                ? "text-red-600"
                : "text-foreground"
            )}
          >
            {totalUtilization == null ? "—" : `${pct.format(totalUtilization)}%`}
          </span>
        </div>
      </div>
      <Table dir="rtl" className="text-xs">
        <TableHeader>
          <TableRow className="border-slate-200 hover:bg-transparent">
            <TableHead className="h-8 py-1 text-right font-semibold text-slate-800">
              קטגוריה
            </TableHead>
            <TableHead className="h-8 py-1 text-left font-semibold text-slate-800">
              תקציב
            </TableHead>
            <TableHead className="h-8 py-1 text-left font-semibold text-slate-800">
              בפועל
            </TableHead>
            <TableHead className="h-8 py-1 text-left font-semibold text-slate-800">
              ניצול
            </TableHead>
            <TableHead className="h-8 py-1 text-left font-semibold text-slate-800">
              נתח מתקציב בסיס
            </TableHead>
            <TableHead className="h-8 min-w-[120px] py-1 text-left font-semibold text-slate-800">
              מול יעד
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((c) => (
            <CategoryBudgetRow
              key={c.key}
              cat={c}
              baselineBudget={baselineBudget}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function CategoryBudgetRow({
  cat,
  baselineBudget,
}: {
  cat: ExecutiveProjectCostCategory
  baselineBudget: number
}) {
  const over = cat.actualCost > cat.budgetAllocated
  const util = categoryBudgetUtilizationPercent(
    cat.actualCost,
    cat.budgetAllocated
  )
  const baselineSlicePct =
    baselineBudget > 0 ? (cat.budgetAllocated / baselineBudget) * 100 : null
  const barPct =
    cat.budgetAllocated > 0
      ? Math.min(100, (cat.actualCost / cat.budgetAllocated) * 100)
      : 0

  return (
    <TableRow className="border-slate-100">
      <TableCell className="py-2 text-right font-medium text-foreground">
        {cat.labelHe}
      </TableCell>
      <TableCell className="py-2 text-left tabular-nums text-slate-700">
        {ils.format(cat.budgetAllocated)}
      </TableCell>
      <TableCell
        className={cn(
          "py-2 text-left tabular-nums font-semibold",
          over ? "text-red-600" : "text-foreground"
        )}
      >
        {ils.format(cat.actualCost)}
        {over ? (
          <span className="ms-1 text-[10px] font-bold text-red-600">
            חריגה
          </span>
        ) : null}
      </TableCell>
      <TableCell className="py-2 text-left tabular-nums text-slate-700">
        {util == null ? "—" : `${pct.format(util)}%`}
      </TableCell>
      <TableCell className="py-2 text-left tabular-nums text-slate-700">
        {baselineSlicePct == null ? "—" : `${pct.format(baselineSlicePct)}%`}
      </TableCell>
      <TableCell className="py-2">
        <div className="flex min-w-[120px] flex-col gap-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                over ? "bg-red-500" : "bg-emerald-600"
              )}
              style={{ width: `${Math.min(100, barPct)}%` }}
            />
          </div>
          {over ? (
            <p className="text-[10px] font-medium text-red-600">
              מעל היעד — ניצול {pct.format(util ?? 0)}%
            </p>
          ) : (
            <p className="text-[10px] text-slate-500">
              ניצול {util == null ? "—" : `${pct.format(util)}%`} מההקצאה
            </p>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

function MassKpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  label: string
  value: string
  sub: string
  accent?: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-slate-600">
        <Icon className="size-5 shrink-0 opacity-85" aria-hidden />
        <span className="text-[11px] font-semibold leading-snug">{label}</span>
      </div>
      <p
        className={cn(
          "font-currency-mono text-2xl font-bold tabular-nums tracking-tight md:text-3xl",
          accent ?? "text-foreground"
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{sub}</p>
    </div>
  )
}

function CeoAlertRow({ alert }: { alert: ExecutiveCeoAlert }) {
  const bar =
    alert.severity === "critical"
      ? "bg-red-600"
      : alert.severity === "high"
        ? "bg-amber-500"
        : "bg-slate-300"
  return (
    <li className="flex gap-3 rounded-md border border-slate-100 bg-background/80 px-3 py-2.5">
      <span
        className={cn("mt-1.5 h-8 w-1 shrink-0 rounded-full", bar)}
        aria-hidden
      />
      <div className="min-w-0 flex-1 text-start">
        <p className="text-sm font-semibold text-foreground">{alert.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
          {alert.detail}
        </p>
      </div>
    </li>
  )
}
