/**
 * Sprint T8 — Executive Cash-Flow & Financial Cockpit page.
 *
 * Server component. Resolves the active company context from the
 * marker-ofek company cookie, loads four read-only KPI / series actions in
 * parallel, and renders the client cockpit. Empty states (no data) are
 * fully handled by the client.
 */

import { cookies } from "next/headers"

import { FinancialCockpitClient } from "@/components/marker-ofek/finance/financial-cockpit-client"
import {
  COMPANY_COOKIE_KEY,
  resolveCompanyContext,
} from "@/lib/company-context"
import {
  getAgingBucketsAction,
  getCashFlowSeriesAction,
  getCockpitKpisAction,
  getTopDebtorsAction,
} from "@/lib/marker-ofek/finance/t8-cockpit-actions"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "דשבורד כספים — שליטה תזרימית",
}

export default async function FinanceDashboardPage() {
  const cookieStore = await cookies()
  const companyId = resolveCompanyContext(
    cookieStore.get(COMPANY_COOKIE_KEY)?.value,
  )

  if (!companyId) {
    return (
      <div dir="rtl" className="p-6 text-sm text-slate-700">
        לא נמצא הקשר חברה פעיל. בחר חברה דרך מתג ה-Workspace בסרגל העליון
        כדי להציג את דשבורד הכספים.
      </div>
    )
  }

  const [kpisRes, seriesRes, debtorsRes, agingRes] = await Promise.all([
    getCockpitKpisAction({ companyId }),
    getCashFlowSeriesAction({ companyId, days: 90 }),
    getTopDebtorsAction({ companyId, limit: 5 }),
    getAgingBucketsAction({ companyId }),
  ])

  return (
    <div dir="rtl" className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Sprint T8 · Financial Cockpit
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          דשבורד כספים — שליטה תזרימית
        </h1>
        <p className="text-sm text-muted-foreground">
          מבט-על על חובות לקוחות, יתרות זכאים, ותזרים מזומנים — נתוני אמת
          מ-Supabase.
        </p>
      </header>

      <FinancialCockpitClient
        companyId={companyId}
        initialKpis={kpisRes.ok ? kpisRes.data : null}
        initialSeries={seriesRes.ok ? seriesRes.data : []}
        debtors={debtorsRes.ok ? debtorsRes.data : []}
        aging={
          agingRes.ok
            ? agingRes.data
            : { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 }
        }
      />
    </div>
  )
}
