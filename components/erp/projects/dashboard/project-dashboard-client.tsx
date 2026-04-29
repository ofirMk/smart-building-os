"use client"

import * as React from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { apiGet } from "@/lib/utils/api-client"
import {
  projectProfitabilitySchema,
  type ProjectProfitabilityPayload,
} from "@/lib/erp/project-profitability-schema"

function money(value: number): string {
  return Number(value || 0).toLocaleString("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

function pct(value: number): string {
  if (!Number.isFinite(value)) return "—"
  return `${value.toFixed(1)}%`
}

type LoadState = {
  data: ProjectProfitabilityPayload | null
  loading: boolean
  error: string | null
}

function useProjectMargin(projectId: string): LoadState {
  const [state, setState] = React.useState<LoadState>({
    data: null,
    loading: false,
    error: null,
  })

  React.useEffect(() => {
    if (!projectId) {
      setState({ data: null, loading: false, error: null })
      return
    }

    const controller = new AbortController()
    setState({ data: null, loading: true, error: null })

    void (async () => {
      try {
        const data = await apiGet<ProjectProfitabilityPayload>(
          `/api/erp/projects/${projectId}/profitability`,
          { schema: projectProfitabilitySchema, signal: controller.signal }
        )
        if (controller.signal.aborted) return
        setState({ data, loading: false, error: null })
      } catch (error) {
        if (controller.signal.aborted) return
        if (error instanceof Error && error.name === "AbortError") return
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : "טעינת נתוני רווחיות נכשלה",
        })
      }
    })()

    return () => controller.abort()
  }, [projectId])

  return state
}

function WidgetShell({
  title,
  icon,
  loading,
  error,
  span = "col-span-1",
  children,
}: {
  title: string
  icon: React.ReactNode
  loading: boolean
  error: string | null
  span?: string
  children: React.ReactNode
}) {
  return (
    <section
      className={`${span} rounded-2xl border border-slate-200 bg-card p-4 shadow-[0_1px_0_rgba(15,23,42,0.04)]`}
    >
      <header className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            {icon}
          </span>
          {title}
        </h3>
        {loading ? <Loader2 className="size-3.5 animate-spin text-slate-400" /> : null}
      </header>
      {error ? (
        <div
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : (
        children
      )}
    </section>
  )
}

export function ProjectDashboardClient({ projectId }: { projectId: string }) {
  const { data, loading, error } = useProjectMargin(projectId)
  const [exportingPdf, setExportingPdf] = React.useState(false)
  const submitted = data?.submittedVsApproved.submittedTotal ?? 0
  const approved = data?.submittedVsApproved.approvedTotal ?? 0
  const maxBilling = Math.max(submitted, approved, 1)
  const marginPct =
    data && data.profitMarginHeatmap.length > 0
      ? data.profitMarginHeatmap.reduce((sum, row) => sum + row.marginPct, 0) /
        data.profitMarginHeatmap.length
      : 0

  const exportExecutiveSummary = React.useCallback(async () => {
    if (!projectId) return
    setExportingPdf(true)
    const controller = new AbortController()
    try {
      const snapshot =
        data ??
        (await apiGet<ProjectProfitabilityPayload>(`/api/erp/projects/${projectId}/profitability`, {
          schema: projectProfitabilitySchema,
          signal: controller.signal,
        }))

      if (!snapshot) return

      const response = await fetch(`/api/erp/projects/${projectId}/executive-summary`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${response.status}`)
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `executive-summary-${projectId.slice(0, 8)}.pdf`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      if (controller.signal.aborted) return
      toast.error(err instanceof Error ? err.message : "PDF export failed")
    } finally {
      setExportingPdf(false)
      controller.abort()
    }
  }, [data, projectId])

  return (
    <div className="flex-1 min-h-0 space-y-4 overflow-y-auto bg-[#F8FAFC] p-4" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-card p-4">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500">
            Project Profitability Dashboard
          </p>
          <h1 className="text-lg font-semibold text-foreground">רווחיות, סטיות וחשיפה</h1>
          <p className="text-xs text-slate-500">
            Bento analytics · נטען ישירות ממנוע הרווחיות של הפרויקט.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-col items-end text-xs text-slate-500">
            <span>Project ID</span>
            <span className="font-mono text-[11px] text-slate-700">{projectId.slice(0, 8)}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={exportingPdf || loading}
            onClick={() => void exportExecutiveSummary()}
          >
            {exportingPdf ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Export Executive Summary
          </Button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
        <WidgetShell
          title="Budget vs Actual"
          icon={<span className="text-xs font-bold">B/A</span>}
          loading={loading}
          error={error}
          span="md:col-span-2 xl:col-span-3"
        >
          <div className="space-y-2">
            {(data?.budgetVsActual ?? []).map((row) => {
              const max = Math.max(row.budget, row.actual, 1)
              const budgetWidth = `${(row.budget / max) * 100}%`
              const actualWidth = `${(row.actual / max) * 100}%`
              return (
                <div key={row.category} className="rounded-xl border border-slate-200 bg-background p-2">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{row.category}</span>
                    <span className="font-mono text-slate-600">
                      {money(row.actual)} / {money(row.budget)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="h-2 rounded bg-card">
                      <div className="h-2 rounded bg-indigo-400" style={{ width: budgetWidth }} />
                    </div>
                    <div className="h-2 rounded bg-card">
                      <div className="h-2 rounded bg-emerald-500" style={{ width: actualWidth }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </WidgetShell>

        <WidgetShell
          title="Submitted vs Approved (Mizmin)"
          icon={<span className="text-xs font-bold">Δ</span>}
          loading={loading}
          error={error}
          span="md:col-span-2 xl:col-span-3"
        >
          <div className="rounded-xl border border-slate-200 bg-background p-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-24 text-xs text-slate-600">Submitted</span>
                <div className="h-3 flex-1 rounded bg-card">
                  <div
                    className="h-3 rounded bg-indigo-400"
                    style={{ width: `${(submitted / maxBilling) * 100}%` }}
                  />
                </div>
                <span className="w-24 text-right font-mono text-xs text-slate-700">{money(submitted)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-24 text-xs text-slate-600">Approved</span>
                <div className="h-3 flex-1 rounded bg-card">
                  <div
                    className="h-3 rounded bg-emerald-500"
                    style={{ width: `${(approved / maxBilling) * 100}%` }}
                  />
                </div>
                <span className="w-24 text-right font-mono text-xs text-slate-700">{money(approved)}</span>
              </div>
            </div>
            <p className="mt-2 text-right font-mono text-xs text-rose-700">
              Gap: {money(data?.submittedVsApproved.gap ?? 0)}
            </p>
            <p className="mt-1 text-right font-mono text-xs text-slate-600">
              Avg Margin: {pct(marginPct)}
            </p>
          </div>
        </WidgetShell>

        <WidgetShell
          title="Profit Margin Heatmap"
          icon={<span className="text-xs font-bold">%</span>}
          loading={loading}
          error={error}
          span="md:col-span-4 xl:col-span-6"
        >
          {data && data.profitMarginHeatmap.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-background p-4 text-center text-xs text-slate-500">
              אין נתוני רווחיות לפי תת-פרק.
            </p>
          ) : (
            <div className="grid gap-2 md:grid-cols-3">
              {(data?.profitMarginHeatmap ?? []).map((cell) => (
                <div
                  key={cell.subChapter}
                  className={
                    cell.risk === "HIGH"
                      ? "rounded-xl border border-rose-200 bg-rose-50 p-3"
                      : cell.risk === "MEDIUM"
                      ? "rounded-xl border border-amber-200 bg-amber-50 p-3"
                      : "rounded-xl border border-emerald-200 bg-emerald-50 p-3"
                  }
                >
                  <p className="text-[11px] font-semibold text-slate-800">{cell.subChapter}</p>
                  <p className="font-mono text-lg font-semibold text-foreground">{pct(cell.marginPct)}</p>
                  <p className="text-[10px] text-slate-600">
                    Revenue {money(cell.expectedRevenue)} · Cost {money(cell.expectedCost)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </WidgetShell>
      </div>
    </div>
  )
}
