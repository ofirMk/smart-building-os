import type { Metadata } from "next"
import { cookies } from "next/headers"

import { Cashflow13WeekDashboard } from "@/components/marker-ofek/finance/cashflow-13-week-dashboard"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { fetchCashflowForecastAction } from "@/lib/marker-ofek/finance/t6-ar-ap-actions"

export const metadata: Metadata = {
  title: "תזרים מזומנים 13 שבועות · Marker Ofek",
}

export const dynamic = "force-dynamic"

/**
 * Sprint T6 — 13-week cashflow forecast dashboard.
 *
 * Pulls planned AR inflows + AP outflows + bank-anchored opening balance from
 * the `erp_get_finance_cashflow_forecast` RPC and renders a weekly KPI grid.
 */
export default async function CashflowForecastPage() {
  const cookieStore = await cookies()
  const companyId =
    resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value) ?? "marker_ofek"

  const result = await fetchCashflowForecastAction(companyId)

  if (!result.ok) {
    return (
      <section className="flex h-full flex-col gap-3 p-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">תזרים מזומנים — 13 שבועות</h1>
          <p className="text-sm text-muted-foreground">תחזית חתימת מזומנים מתגלגלת</p>
        </header>
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          שגיאה בטעינת התחזית: {result.error}
        </div>
      </section>
    )
  }

  return <Cashflow13WeekDashboard companyId={companyId} rows={result.rows} />
}
