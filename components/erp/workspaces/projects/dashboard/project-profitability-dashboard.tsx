"use client"

import * as React from "react"
import { z } from "zod"

import { COMPANY_COOKIE_KEY, type CompanyContextId, resolveCompanyContext } from "@/lib/company-context"

const budgetRowSchema = z.object({
  resource: z.string(),
  subChapter: z.string(),
  budget: z.coerce.number(),
  actual: z.coerce.number(),
})

const dashboardEnvelopeSchema = z.object({
  data: z.object({
    budgetVsActual: z.array(budgetRowSchema),
    approvalVariance: z.object({
      submittedTotal: z.coerce.number(),
      approvedTotal: z.coerce.number(),
      variance: z.coerce.number(),
    }),
    changeOrderImpact: z.object({
      originalContractAmount: z.coerce.number(),
      totalChangeOrdersAmount: z.coerce.number(),
      revisedContractAmount: z.coerce.number(),
    }),
    subcontractorTotals: z.object({
      submitted: z.coerce.number(),
      approved: z.coerce.number(),
    }),
  }),
})

type DashboardData = z.infer<typeof dashboardEnvelopeSchema>["data"]

function getActiveCompanyIdFromCookie(): CompanyContextId | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${COMPANY_COOKIE_KEY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`)
  )
  return resolveCompanyContext(match?.[1]?.trim())
}

function money(value: number): string {
  return Number(value || 0).toLocaleString("he-IL", { style: "currency", currency: "ILS" })
}

export function ProjectProfitabilityDashboard({ projectId }: { projectId: string }) {
  const [data, setData] = React.useState<DashboardData | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!projectId) {
      setData(null)
      setLoading(false)
      setError(null)
      return
    }
    const controller = new AbortController()
    setData(null)
    setLoading(true)
    setError(null)

    const headers = new Headers({ "content-type": "application/json" })
    const companyId = getActiveCompanyIdFromCookie()
    if (companyId) {
      headers.set("x-company-id", companyId)
      headers.set("x-active-company-id", companyId)
    }

    void fetch(`/api/erp/projects/${projectId}/profitability`, {
      method: "GET",
      signal: controller.signal,
      headers,
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string }
          throw new Error(payload.error ?? `HTTP ${response.status}`)
        }
        const payload = (await response.json().catch(() => ({}))) as unknown
        const parsed = dashboardEnvelopeSchema.safeParse(payload)
        if (!parsed.success) throw new Error("Profitability payload is invalid")
        return parsed.data.data
      })
      .then((next) => {
        if (controller.signal.aborted) return
        setData(next)
      })
      .catch((fetchError) => {
        if (controller.signal.aborted) return
        setData(null)
        setError(fetchError instanceof Error ? fetchError.message : "טעינת רווחיות נכשלה")
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [projectId])

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      ) : null}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-card px-3 py-4 text-sm text-slate-500">
          טוען לוח רווחיות...
        </div>
      ) : null}
      {!loading && data ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <section className="rounded-xl border border-slate-200 bg-card p-3 md:col-span-2 xl:col-span-2">
            <h3 className="mb-2 text-sm font-semibold text-foreground">Budget vs Actual</h3>
            <div className="space-y-2">
              {data.budgetVsActual.slice(0, 8).map((row) => {
                const max = Math.max(row.budget, row.actual, 1)
                const budgetWidth = `${Math.max((row.budget / max) * 100, 2)}%`
                const actualWidth = `${Math.max((row.actual / max) * 100, 2)}%`
                return (
                  <div key={`${row.resource}:${row.subChapter}`} className="space-y-1">
                    <p className="text-[11px] text-slate-600">
                      {row.resource} / {row.subChapter}
                    </p>
                    <div className="h-2 rounded bg-slate-100">
                      <div className="h-2 rounded bg-indigo-300" style={{ width: budgetWidth }} />
                    </div>
                    <div className="h-2 rounded bg-slate-100">
                      <div className="h-2 rounded bg-emerald-400" style={{ width: actualWidth }} />
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Budget {money(row.budget)} · Actual {money(row.actual)}
                    </p>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-card p-3">
            <h3 className="mb-2 text-sm font-semibold text-foreground">Approval Variance</h3>
            <p className="text-xs text-slate-600">Submitted: {money(data.approvalVariance.submittedTotal)}</p>
            <p className="text-xs text-slate-600">Approved: {money(data.approvalVariance.approvedTotal)}</p>
            <p className="mt-2 text-sm font-semibold text-amber-700">
              Delta: {money(data.approvalVariance.variance)}
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-card p-3">
            <h3 className="mb-2 text-sm font-semibold text-foreground">Change Order Impact</h3>
            <p className="text-xs text-slate-600">
              Original: {money(data.changeOrderImpact.originalContractAmount)}
            </p>
            <p className="text-xs text-slate-600">
              Changes: {money(data.changeOrderImpact.totalChangeOrdersAmount)}
            </p>
            <p className="mt-2 text-sm font-semibold text-indigo-700">
              Revised: {money(data.changeOrderImpact.revisedContractAmount)}
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-card p-3 md:col-span-2 xl:col-span-4">
            <h3 className="mb-2 text-sm font-semibold text-foreground">Subcontractor Bills</h3>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-background px-2 py-1 text-xs">
                Submitted: <span className="font-mono">{money(data.subcontractorTotals.submitted)}</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-background px-2 py-1 text-xs">
                Approved: <span className="font-mono">{money(data.subcontractorTotals.approved)}</span>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
