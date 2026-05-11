"use client"

/**
 * Sprint A.5 — Cost Control Cockpit (client island).
 *
 * Renders the "Planning vs Actual" screen per MedaTech §6.4:
 *   • Action toolbar: open new period, run cost collection, close period.
 *   • WBS hierarchical grid (Chapter → Subchapter) with 6 money columns
 *     (Original Budget, Current Budget, Committed, Actual, EAC, Variance)
 *     and a progress bar visualising actual/current.
 *   • Drill-down: clicking a subchapter row expands to show per-resource rows.
 *   • Edit forecast: clicking the "צפי" cell opens inline input to update
 *     the forecast-to-completion via `upsertForecast`.
 */

import * as React from "react"
import {
  AlertCircle,
  CheckCircle2,
  Lock,
  Pencil,
  Play,
  Plus,
  Save,
  X,
} from "lucide-react"

import {
  closeControlPeriod,
  openControlPeriod,
  runCostCollection,
  upsertForecast,
} from "@/app/actions/project-cost-control"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

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

type Props = {
  projectId: string
  period: {
    id: string
    controlMonth: string
    status: "OPEN" | "COLLECTED" | "CLOSED"
    periodEndDate: string
  }
  chapters: ChapterRow[]
  subchapters: SubchapterRow[]
  resources: ResourceRow[]
  subjects: SubjectRow[]
  snapshots: SnapshotRow[]
  forecasts: ForecastRow[]
  rollup: {
    originalBudget: number
    currentBudget: number
    committed: number
    actual: number
    forecast: number
    eac: number
    variance: number
  }
}

export function CostControlCockpit(props: Props) {
  const {
    projectId,
    period,
    chapters,
    subchapters,
    resources,
    snapshots,
  } = props

  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const [expandedSub, setExpandedSub] = React.useState<Set<string>>(new Set())
  const [forecastEditFor, setForecastEditFor] = React.useState<{
    subchapterId: string
    resourceId: string | null
    current: number
  } | null>(null)
  const [forecastValue, setForecastValue] = React.useState("")
  const [showNewPeriod, setShowNewPeriod] = React.useState(false)
  const [newPeriodMonth, setNewPeriodMonth] = React.useState(() => {
    const d = new Date()
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(
      d.getFullYear() % 100,
    ).padStart(2, "0")}`
  })

  const subchapterById = React.useMemo(
    () => new Map(subchapters.map((s) => [s.id, s])),
    [subchapters],
  )
  const chapterById = React.useMemo(
    () => new Map(chapters.map((c) => [c.id, c])),
    [chapters],
  )
  const resourceById = React.useMemo(
    () => new Map(resources.map((r) => [r.id, r])),
    [resources],
  )

  // Group snapshots by subchapter (null subchapter is dropped — those are
  // project-level rollups the RPC might produce in future).
  const snapshotsBySubchapter = React.useMemo(() => {
    const map = new Map<string, SnapshotRow[]>()
    for (const s of snapshots) {
      if (!s.control_subchapter_id) continue
      const arr = map.get(s.control_subchapter_id) ?? []
      arr.push(s)
      map.set(s.control_subchapter_id, arr)
    }
    return map
  }, [snapshots])

  // Chapter → Subchapter tree, only showing chapters that have snapshots.
  const tree = React.useMemo(() => {
    const out = new Map<ChapterRow, SubchapterRow[]>()
    for (const sc of subchapters) {
      if (!snapshotsBySubchapter.has(sc.id)) continue
      const chap = chapterById.get(sc.chapter_id)
      if (!chap) continue
      const arr = out.get(chap) ?? []
      arr.push(sc)
      out.set(chap, arr)
    }
    return out
  }, [subchapters, chapterById, snapshotsBySubchapter])

  function handleRunCollection() {
    setError(null)
    startTransition(async () => {
      const res = await runCostCollection({
        projectId,
        controlMonth: period.controlMonth,
      })
      if (!res.ok) setError(res.error)
    })
  }

  function handleClose() {
    setError(null)
    startTransition(async () => {
      const res = await closeControlPeriod({
        projectId,
        periodId: period.id,
      })
      if (!res.ok) setError(res.error)
    })
  }

  function handleOpenNewPeriod() {
    setError(null)
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(newPeriodMonth)) {
      setError("פורמט חודש חייב להיות MM/YY (למשל 04/26)")
      return
    }
    startTransition(async () => {
      const res = await openControlPeriod({
        projectId,
        controlMonth: newPeriodMonth,
      })
      if (!res.ok) setError(res.error)
      else setShowNewPeriod(false)
    })
  }

  function handleSaveForecast() {
    if (!forecastEditFor) return
    const n = Number(forecastValue)
    if (!Number.isFinite(n) || n < 0) {
      setError("צפי לגמר חייב להיות מספר ≥ 0")
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await upsertForecast({
        projectId,
        periodId: period.id,
        subchapterId: forecastEditFor.subchapterId,
        resourceId: forecastEditFor.resourceId,
        forecastToComplete: n,
        forecastRevenue: 0,
      })
      if (!res.ok) setError(res.error)
      else {
        setForecastEditFor(null)
        setForecastValue("")
        // Re-run collection to refresh EAC/variance immediately
        await runCostCollection({
          projectId,
          controlMonth: period.controlMonth,
        })
      }
    })
  }

  function toggleExpand(subId: string) {
    setExpandedSub((prev) => {
      const next = new Set(prev)
      if (next.has(subId)) next.delete(subId)
      else next.add(subId)
      return next
    })
  }

  // Aggregates a list of snapshot rows into a single subchapter-level row.
  function rollupSnapshots(rows: SnapshotRow[]) {
    return rows.reduce(
      (acc, r) => {
        acc.original += r.original_budget_amount
        acc.current += r.current_budget_amount
        acc.committed += r.total_committed_amount
        acc.actual += r.total_actual_amount
        acc.forecast += r.forecast_to_complete_amount
        acc.eac += r.eac_amount
        acc.variance += r.variance_amount
        return acc
      },
      {
        original: 0,
        current: 0,
        committed: 0,
        actual: 0,
        forecast: 0,
        eac: 0,
        variance: 0,
      },
    )
  }

  const isLocked = period.status === "CLOSED"

  return (
    <Card className="overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h3 className="text-sm font-bold tracking-tight">
          חיתוך תקציב לפי תת-פרק ומשאב ·{" "}
          <span className="font-mono text-slate-600">
            {period.controlMonth}
          </span>
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {!isLocked ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={handleRunCollection}
              className="h-7 gap-1.5 text-xs"
            >
              <Play className="size-3" aria-hidden />
              הרץ איסוף עלויות
            </Button>
          ) : null}
          {period.status === "COLLECTED" ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={handleClose}
              className="h-7 gap-1.5 border-slate-400 text-xs text-slate-700"
            >
              <Lock className="size-3" aria-hidden />
              סגור תקופה
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setShowNewPeriod((v) => !v)}
            className="h-7 gap-1.5 border-indigo-300 bg-indigo-50 text-xs text-indigo-800 hover:bg-indigo-100"
          >
            <Plus className="size-3" aria-hidden />
            תקופה חדשה
          </Button>
        </div>
      </div>

      {showNewPeriod ? (
        <div className="flex items-center gap-2 border-b border-indigo-200 bg-indigo-50/50 px-3 py-2">
          <label className="text-xs font-semibold text-indigo-900">
            חודש בקרה חדש (MM/YY):
          </label>
          <Input
            value={newPeriodMonth}
            onChange={(e) => setNewPeriodMonth(e.target.value)}
            className="h-7 w-24 font-mono text-xs"
            placeholder="04/26"
            disabled={pending}
          />
          <Button
            size="sm"
            onClick={handleOpenNewPeriod}
            disabled={pending}
            className="h-7 text-xs"
          >
            {pending ? "יוצר…" : "פתח תקופה"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowNewPeriod(false)}
            className="h-7 text-xs"
          >
            <X className="size-3" aria-hidden />
          </Button>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          <AlertCircle className="size-3.5" aria-hidden />
          {error}
        </div>
      ) : null}

      {snapshots.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">
          <p className="mb-2">אין נתונים לתקופה זו.</p>
          {period.status === "OPEN" ? (
            <p className="text-xs text-slate-400">
              לחץ על &quot;הרץ איסוף עלויות&quot; כדי לאגר את הנתונים מכל
              המסמכים.
            </p>
          ) : (
            <p className="text-xs text-slate-400">
              אף שורת BOQ עדיין לא שויכה לתת-פרק לבקרה.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="w-[28%] px-2 py-2 text-start">פרק / תת-פרק / משאב</th>
                <th className="px-2 py-2 text-end">תקציב מקורי</th>
                <th className="px-2 py-2 text-end">תקציב עדכני</th>
                <th className="px-2 py-2 text-end">מתחייב</th>
                <th className="px-2 py-2 text-end">בוצע</th>
                <th className="px-2 py-2 text-end">צפי לגמר</th>
                <th className="px-2 py-2 text-end">EAC</th>
                <th className="px-2 py-2 text-end">סטייה</th>
                <th className="w-[80px] px-2 py-2 text-center">ביצוע</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(tree.entries()).map(([chapter, subs]) => (
                <React.Fragment key={chapter.id}>
                  <tr className="bg-indigo-50/60">
                    <td
                      colSpan={9}
                      className="px-2 py-1 text-[11px] font-bold tracking-tight text-indigo-900"
                    >
                      פרק {chapter.code} — {chapter.description}
                    </td>
                  </tr>
                  {subs.map((sub) => {
                    const rows = snapshotsBySubchapter.get(sub.id) ?? []
                    const agg = rollupSnapshots(rows)
                    const isExpanded = expandedSub.has(sub.id)
                    const pctActual =
                      agg.current > 0
                        ? Math.min(100, (agg.actual / agg.current) * 100)
                        : 0
                    const pctCommitted =
                      agg.current > 0
                        ? Math.min(100, (agg.committed / agg.current) * 100)
                        : 0
                    return (
                      <React.Fragment key={sub.id}>
                        <tr
                          className="cursor-pointer border-t border-slate-100 transition-colors hover:bg-amber-50/60"
                          onClick={() => toggleExpand(sub.id)}
                        >
                          <td className="px-2 py-1.5 ps-6">
                            <span className="font-mono text-slate-500">
                              {chapter.code}.{sub.code}
                            </span>{" "}
                            <span className="font-semibold">
                              {sub.description}
                            </span>{" "}
                            <span className="text-[10px] text-slate-400">
                              ({rows.length} משאבים)
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-end font-mono text-slate-600">
                            {ILS.format(agg.original)}
                          </td>
                          <td className="px-2 py-1.5 text-end font-mono font-semibold">
                            {ILS.format(agg.current)}
                          </td>
                          <td className="px-2 py-1.5 text-end font-mono text-amber-800">
                            {ILS.format(agg.committed)}
                          </td>
                          <td className="px-2 py-1.5 text-end font-mono text-violet-800">
                            {ILS.format(agg.actual)}
                          </td>
                          <td className="px-2 py-1.5 text-end font-mono text-slate-500">
                            {ILS.format(agg.forecast)}
                          </td>
                          <td className="px-2 py-1.5 text-end font-mono font-semibold">
                            {ILS.format(agg.eac)}
                          </td>
                          <td
                            className={`px-2 py-1.5 text-end font-mono font-bold ${
                              agg.variance >= 0
                                ? "text-emerald-700"
                                : "text-rose-700"
                            }`}
                          >
                            {ILS.format(agg.variance)}
                          </td>
                          <td className="px-2 py-1.5">
                            <ProgressBar
                              committed={pctCommitted}
                              actual={pctActual}
                            />
                          </td>
                        </tr>
                        {isExpanded
                          ? rows.map((r) => {
                              const res = r.control_resource_id
                                ? resourceById.get(r.control_resource_id)
                                : null
                              const showForecast =
                                forecastEditFor?.subchapterId === sub.id &&
                                forecastEditFor.resourceId ===
                                  r.control_resource_id
                              return (
                                <tr
                                  key={r.id}
                                  className="border-t border-slate-50 bg-slate-50/40 text-[11px]"
                                >
                                  <td className="px-2 py-1 ps-14 text-slate-600">
                                    {res ? (
                                      <>
                                        <span className="font-mono text-slate-400">
                                          {res.code}
                                        </span>{" "}
                                        {res.description}{" "}
                                        {res.uom ? (
                                          <span className="text-[10px] text-slate-400">
                                            ({res.uom})
                                          </span>
                                        ) : null}
                                      </>
                                    ) : (
                                      <span className="italic text-slate-400">
                                        ללא משאב
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1 text-end font-mono text-slate-500">
                                    {ILS.format(r.original_budget_amount)}
                                  </td>
                                  <td className="px-2 py-1 text-end font-mono">
                                    {ILS.format(r.current_budget_amount)}
                                  </td>
                                  <td className="px-2 py-1 text-end font-mono text-amber-700">
                                    {ILS.format(r.total_committed_amount)}
                                  </td>
                                  <td className="px-2 py-1 text-end font-mono text-violet-700">
                                    {ILS.format(r.total_actual_amount)}
                                  </td>
                                  <td
                                    className="cursor-pointer px-2 py-1 text-end font-mono text-slate-500 hover:bg-white"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (isLocked) return
                                      setForecastEditFor({
                                        subchapterId: sub.id,
                                        resourceId: r.control_resource_id,
                                        current: r.forecast_to_complete_amount,
                                      })
                                      setForecastValue(
                                        String(r.forecast_to_complete_amount),
                                      )
                                    }}
                                  >
                                    {showForecast ? (
                                      <span
                                        className="inline-flex items-center gap-1"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Input
                                          type="number"
                                          value={forecastValue}
                                          onChange={(e) =>
                                            setForecastValue(e.target.value)
                                          }
                                          className="h-5 w-20 text-end font-mono text-[10px]"
                                          disabled={pending}
                                          autoFocus
                                        />
                                        <Button
                                          size="sm"
                                          className="h-5 w-5 p-0"
                                          onClick={handleSaveForecast}
                                          disabled={pending}
                                        >
                                          <Save
                                            className="size-2.5"
                                            aria-hidden
                                          />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-5 w-5 p-0"
                                          onClick={() =>
                                            setForecastEditFor(null)
                                          }
                                        >
                                          <X
                                            className="size-2.5"
                                            aria-hidden
                                          />
                                        </Button>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1">
                                        {ILS.format(
                                          r.forecast_to_complete_amount,
                                        )}
                                        {!isLocked ? (
                                          <Pencil
                                            className="size-2.5 text-slate-300"
                                            aria-hidden
                                          />
                                        ) : null}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1 text-end font-mono">
                                    {ILS.format(r.eac_amount)}
                                  </td>
                                  <td
                                    className={`px-2 py-1 text-end font-mono ${
                                      r.variance_amount >= 0
                                        ? "text-emerald-700"
                                        : "text-rose-700"
                                    }`}
                                  >
                                    {ILS.format(r.variance_amount)}
                                  </td>
                                  <td></td>
                                </tr>
                              )
                            })
                          : null}
                      </React.Fragment>
                    )
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {period.status === "COLLECTED" ? (
        <div className="flex items-center gap-2 border-t border-emerald-200 bg-emerald-50/60 px-3 py-1.5 text-[11px] text-emerald-900">
          <CheckCircle2 className="size-3" aria-hidden />
          איסוף הושלם · ניתן לסגור את התקופה לצורך שמירת snapshot היסטורי
        </div>
      ) : null}
    </Card>
  )
}

function ProgressBar({
  committed,
  actual,
}: {
  committed: number
  actual: number
}) {
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className="absolute inset-y-0 start-0 bg-amber-400/60"
        style={{ width: `${committed}%` }}
        aria-hidden
      />
      <div
        className="absolute inset-y-0 start-0 bg-violet-600"
        style={{ width: `${actual}%` }}
        aria-hidden
      />
    </div>
  )
}
