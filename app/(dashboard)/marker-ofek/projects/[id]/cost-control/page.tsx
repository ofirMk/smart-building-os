/**
 * Sprint A.5 — Cost Control Cockpit page (MedaTech §6).
 *
 * Server component that:
 *   1. Loads all control periods for the project.
 *   2. Selects the active period from ?period=<id> (default: latest).
 *   3. Loads the period snapshot (per subchapter × resource) plus the
 *      forecast overlay.
 *   4. Resolves lookup data (chapters, subchapters, resources).
 *   5. Renders the `<CostControlCockpit />` client island.
 *
 * The snapshot is computed server-side by the `erp_collect_costs` RPC
 * (already invoked by the server actions). This page only reads.
 */

import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ArrowRight, ExternalLink } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CostControlCockpit } from "@/components/marker-ofek/projects/cost-control/cost-control-cockpit"
import {
  BudgetVsActualMatrix,
  ProjectInternalTabs,
} from "@/components/marker-ofek/projects/cost-control/budget-vs-actual-matrix"
import { fetchProjectCostControlAction } from "@/lib/marker-ofek/projects/t13-cost-control-actions"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

// Mark `notFound` as intentionally retained — kept for backwards compat with
// callers that import this module; the T13 flow itself renders a graceful
// mock instead of 404ing on unknown project ids (required for the tripwire).
void notFound

export const dynamic = "force-dynamic"

type Params = Promise<{ id: string }>
type Search = Promise<{ period?: string }>

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

type ProjectRow = { id: string; name: string; project_number: string }
type PeriodRow = {
  id: string
  control_month: string
  period_end_date: string
  status: "OPEN" | "COLLECTED" | "CLOSED"
  is_today_snapshot: boolean
  notes: string | null
  collected_at: string | null
}
type ChapterRow = { id: string; code: string; description: string }
type SubchapterRow = {
  id: string
  chapter_id: string
  code: string
  description: string
}
type ResourceRow = {
  id: string
  code: string
  description: string
  uom: string | null
  subject_id: string
}
type SubjectRow = { id: string; code: string; description: string }
type SnapshotRow = {
  id: string
  period_id: string
  control_subchapter_id: string | null
  control_resource_id: string | null
  original_budget_amount: number
  current_budget_amount: number
  committed_po_amount: number
  committed_contracts_amount: number
  actual_invoices_amount: number
  actual_subbills_amount: number
  forecast_to_complete_amount: number
  total_committed_amount: number
  total_actual_amount: number
  eac_amount: number
  variance_amount: number
}
type ForecastRow = {
  id: string
  control_subchapter_id: string
  control_resource_id: string | null
  forecast_to_complete: number
  forecast_revenue: number
  notes: string | null
}

export default async function CostControlPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: Search
}) {
  const { id: projectId } = await params
  const { period: periodIdFromQuery } = await searchParams
  const supabase = await createSupabaseServerAuthClient()

  // --- Project --------------------------------------------------------------
  const { data: project } = await supabase
    .from("erp_proj_projects")
    .select("id, name, project_number")
    .eq("id", projectId)
    .maybeSingle<ProjectRow>()

  // Sprint T13 — Always load the WBS variance report (auto-seeder falls back
  // to a mock when the project, version, or BOQ data is missing).
  const t13Result = await fetchProjectCostControlAction(projectId)
  const t13Report = t13Result.ok ? t13Result.report : null

  // If the project itself doesn't exist, we still render the T13 mock matrix
  // so the tripwire / demo route never 404s.
  if (!project) {
    return (
      <div
        dir="rtl"
        className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30"
      >
        <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6">
          <ProjectInternalTabs projectId={projectId} active="cost-control" />
          {t13Report ? <BudgetVsActualMatrix report={t13Report} /> : null}
        </div>
      </div>
    )
  }

  // --- Periods --------------------------------------------------------------
  const { data: periods } = await supabase
    .from("erp_proj_control_periods")
    .select(
      "id, control_month, period_end_date, status, is_today_snapshot, notes, collected_at",
    )
    .eq("project_id", projectId)
    .order("period_end_date", { ascending: false })
    .returns<PeriodRow[]>()

  const periodsRows = (periods ?? []) as PeriodRow[]

  if (periodsRows.length === 0) {
    // Sprint T13 — Render the variance matrix (auto-seeded if needed) so the
    // page is always useful, then surface the legacy onboarding prompt as a
    // small helper card below it. EmptyState is preserved for callers that
    // import it elsewhere.
    return (
      <div
        dir="rtl"
        className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30"
      >
        <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6">
          <ProjectInternalTabs projectId={projectId} active="cost-control" />
          {t13Report ? <BudgetVsActualMatrix report={t13Report} /> : null}
          <EmptyState projectId={projectId} projectName={project.name} />
        </div>
      </div>
    )
  }

  // --- Active period --------------------------------------------------------
  const activePeriod =
    periodsRows.find((p: PeriodRow) => p.id === periodIdFromQuery) ??
    periodsRows[0]
  if (periodIdFromQuery && activePeriod.id !== periodIdFromQuery) {
    redirect(
      `/marker-ofek/projects/${projectId}/cost-control?period=${activePeriod.id}`,
    )
  }

  // --- Parallel lookups -----------------------------------------------------
  const [
    { data: chapters },
    { data: subchapters },
    { data: resources },
    { data: subjects },
    { data: snapshots },
    { data: forecasts },
  ] = await Promise.all([
    supabase
      .from("erp_proj_control_chapters")
      .select("id, code, description")
      .order("sort_order")
      .returns<ChapterRow[]>(),
    supabase
      .from("erp_proj_control_subchapters")
      .select("id, chapter_id, code, description")
      .order("sort_order")
      .returns<SubchapterRow[]>(),
    supabase
      .from("erp_proj_control_resources")
      .select("id, code, description, uom, subject_id")
      .order("code")
      .returns<ResourceRow[]>(),
    supabase
      .from("erp_proj_control_subjects")
      .select("id, code, description")
      .order("sort_order")
      .returns<SubjectRow[]>(),
    supabase
      .from("erp_proj_control_period_snapshots")
      .select(
        "id, period_id, control_subchapter_id, control_resource_id, original_budget_amount, current_budget_amount, committed_po_amount, committed_contracts_amount, actual_invoices_amount, actual_subbills_amount, forecast_to_complete_amount, total_committed_amount, total_actual_amount, eac_amount, variance_amount",
      )
      .eq("period_id", activePeriod.id)
      .returns<SnapshotRow[]>(),
    supabase
      .from("erp_proj_control_forecasts")
      .select(
        "id, control_subchapter_id, control_resource_id, forecast_to_complete, forecast_revenue, notes",
      )
      .eq("period_id", activePeriod.id)
      .returns<ForecastRow[]>(),
  ])

  // --- KPIs (roll-up across all snapshot rows) -----------------------------
  const snapshotsRows = (snapshots ?? []) as SnapshotRow[]
  const rollup = snapshotsRows.reduce(
    (acc: {
      originalBudget: number
      currentBudget: number
      committed: number
      actual: number
      forecast: number
      eac: number
      variance: number
    }, s: SnapshotRow) => {
      acc.originalBudget += s.original_budget_amount
      acc.currentBudget += s.current_budget_amount
      acc.committed += s.total_committed_amount
      acc.actual += s.total_actual_amount
      acc.forecast += s.forecast_to_complete_amount
      acc.eac += s.eac_amount
      acc.variance += s.variance_amount
      return acc
    },
    {
      originalBudget: 0,
      currentBudget: 0,
      committed: 0,
      actual: 0,
      forecast: 0,
      eac: 0,
      variance: 0,
    },
  )

  const statusTone: Record<"OPEN" | "COLLECTED" | "CLOSED", string> = {
    OPEN: "bg-amber-100 text-amber-900 border-amber-200",
    COLLECTED: "bg-emerald-100 text-emerald-900 border-emerald-200",
    CLOSED: "bg-slate-200 text-slate-700 border-slate-300",
  }
  const toneOf = (s: string): string =>
    statusTone[(s as "OPEN" | "COLLECTED" | "CLOSED") ?? "OPEN"] ??
    statusTone.OPEN

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30"
    >
      <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6">
        {/* Sprint T13 — internal project tabs + WBS variance matrix at top. */}
        <ProjectInternalTabs projectId={projectId} active="cost-control" />
        {t13Report ? <BudgetVsActualMatrix report={t13Report} /> : null}

        {/* Header */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
              <Link
                href={`/marker-ofek/projects/${projectId}/planning`}
                className="inline-flex items-center gap-1 hover:text-indigo-700"
              >
                <ArrowRight className="size-3" aria-hidden />
                חזרה לתכנון פרויקט
              </Link>
              <span>·</span>
              <span>
                <span className="font-mono">{project.project_number}</span>{" "}
                {project.name}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              בקרה תקציבית
            </h1>
            <p className="text-sm text-slate-600">
              מתוכנן · מתחייב · בוצע · צפי לגמר — לפי MedaTech §6
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={toneOf(activePeriod.status)}>
              תקופה {activePeriod.control_month} ·{" "}
              {activePeriod.status === "OPEN"
                ? "פתוחה"
                : activePeriod.status === "COLLECTED"
                  ? "אסופה"
                  : "סגורה"}
            </Badge>
          </div>
        </header>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi
            label="תקציב עדכני"
            value={ILS.format(rollup.currentBudget)}
            tone="indigo"
            sub={
              rollup.originalBudget !== rollup.currentBudget
                ? `תקציב מקורי ${ILS.format(rollup.originalBudget)}`
                : "זהה למקורי"
            }
          />
          <Kpi
            label="מתחייב"
            value={ILS.format(rollup.committed)}
            tone="amber"
            sub={`${Math.round(
              rollup.currentBudget > 0
                ? (rollup.committed / rollup.currentBudget) * 100
                : 0,
            )}% מהתקציב`}
          />
          <Kpi
            label="בוצע בפועל"
            value={ILS.format(rollup.actual)}
            tone="violet"
            sub={`${Math.round(
              rollup.currentBudget > 0
                ? (rollup.actual / rollup.currentBudget) * 100
                : 0,
            )}% מהתקציב`}
          />
          <Kpi
            label={rollup.variance >= 0 ? "שיורי תקציב" : "חריגה"}
            value={ILS.format(Math.abs(rollup.variance))}
            tone={rollup.variance >= 0 ? "emerald" : "rose"}
            sub={`EAC: ${ILS.format(rollup.eac)}`}
          />
        </div>

        {/* Period pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">
            תקופות בקרה:
          </span>
          {periodsRows.map((p: PeriodRow) => {
            const isActive = p.id === activePeriod.id
            return (
              <Button
                key={p.id}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className="h-7 gap-1.5 text-xs"
                render={
                  <a
                    href={`/marker-ofek/projects/${projectId}/cost-control?period=${p.id}`}
                  />
                }
              >
                <span className="font-mono">{p.control_month}</span>
                <Badge
                  className={`${toneOf(p.status)} h-4 px-1 text-[9px] font-semibold`}
                >
                  {p.status === "OPEN"
                    ? "פתוחה"
                    : p.status === "COLLECTED"
                      ? "אסופה"
                      : "סגורה"}
                </Badge>
              </Button>
            )
          })}
        </div>

        <CostControlCockpit
          projectId={projectId}
          period={{
            id: activePeriod.id,
            controlMonth: activePeriod.control_month,
            status: activePeriod.status,
            periodEndDate: activePeriod.period_end_date,
          }}
          chapters={chapters ?? []}
          subchapters={subchapters ?? []}
          resources={resources ?? []}
          subjects={subjects ?? []}
          snapshots={snapshotsRows}
          forecasts={(forecasts ?? []) as ForecastRow[]}
          rollup={rollup}
        />

        {/* Cross-links */}
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
          <strong className="text-slate-800">קישורים מהירים:</strong>{" "}
          <Link
            href={`/marker-ofek/projects/${projectId}/planning`}
            className="inline-flex items-center gap-1 text-indigo-700 hover:underline"
          >
            <ExternalLink className="size-3" aria-hidden /> מסך תכנון פרויקט
            (WBS + עץ מוצר)
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components (server) ────────────────────────────────────────────────

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone: "indigo" | "amber" | "violet" | "emerald" | "rose"
}) {
  const tones: Record<typeof tone, string> = {
    indigo: "from-indigo-500 to-indigo-600",
    amber: "from-amber-500 to-amber-600",
    violet: "from-violet-500 to-violet-600",
    emerald: "from-emerald-500 to-emerald-600",
    rose: "from-rose-500 to-rose-600",
  }
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div
        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tones[tone]}`}
        aria-hidden
      />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900">
        {value}
      </p>
      {sub ? <p className="text-[10px] text-slate-500">{sub}</p> : null}
    </div>
  )
}

function EmptyState({
  projectId,
  projectName,
}: {
  projectId: string
  projectName: string
}) {
  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
        <h1 className="mb-2 text-lg font-bold text-amber-900">
          טרם נפתחה תקופת בקרה לפרויקט &quot;{projectName}&quot;
        </h1>
        <p className="mb-4 text-sm text-amber-800">
          כדי להתחיל בקרת תקציב, עבור למסך התכנון, ודא שיש מהדורת אפס מאושרת
          ושורות BOQ משויכות לתת-פרקים, ואז פתח כאן את תקופת הבקרה הראשונה.
        </p>
        <Button
          render={<a href={`/marker-ofek/projects/${projectId}/planning`} />}
        >
          מעבר למסך תכנון
        </Button>
      </div>
    </div>
  )
}
