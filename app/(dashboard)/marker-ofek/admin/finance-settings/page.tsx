/**
 * Finance Settings — admin page (Sprint T7c).
 *
 * Surface area for the operator to tune the finance/AR/AP knobs that affect
 * the tax-invoice pipeline:
 *   • ITA allocation threshold (NIS) — default 25,000 per רשות המסים ר9.
 *   • Brand identity (logo URL) printed at the top of every invoice.
 *   • Signatories (up to 3) for the bottom-of-invoice footer.
 *   • Retention-of-title clause text (legal block).
 *
 * Persistence: the live deployment hasn't run a schema migration for a
 * dedicated `erp_finance_settings` JSONB column yet, so this v1 persists the
 * values to `localStorage` per browser. The server action contract is
 * defined so a follow-up migration (e.g. `erp_companies.finance_settings_json
 * jsonb`) can light up server-side persistence without changing the UI.
 */

import { cookies } from "next/headers"
import Link from "next/link"
import { ArrowLeft, Settings } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FinanceSettingsClient } from "@/components/marker-ofek/admin/finance-settings-client"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { ALLOCATION_REQUIRED_ABOVE_NIS } from "@/lib/finance/israel-tax-api"

export const dynamic = "force-dynamic"

export default async function FinanceSettingsPage() {
  const cookieStore = await cookies()
  const companyId =
    resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value) ?? "marker_ofek"

  return (
    <div dir="rtl" className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700">
            <Settings className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              הגדרות כספים
            </h1>
            <p className="text-xs text-muted-foreground">
              Sprint T7c · רף ITA, חתימות ולוגו · החברה הפעילה:{" "}
              <span className="font-mono">{companyId}</span>
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          render={<Link href="/marker-ofek/finance/tax-invoices" />}
        >
          <ArrowLeft className="ms-1 size-4" aria-hidden />
          חזרה לחשבוניות
        </Button>
      </header>

      <Card className="border-indigo-200 bg-indigo-50/40 p-3 text-xs text-indigo-900">
        <p>
          <strong>הערה:</strong> בגרסת T7c השמירה היא <em>per-browser</em>{" "}
          (LocalStorage). הוספת עמודת{" "}
          <span className="font-mono">erp_companies.finance_settings_json</span>{" "}
          תאפשר סנכרון מולטי-משתמשי בעתיד; חוזה ה-API של ה-client כבר מוכן לזה.
        </p>
      </Card>

      <FinanceSettingsClient
        companyId={companyId}
        defaultThresholdNis={ALLOCATION_REQUIRED_ABOVE_NIS}
      />
    </div>
  )
}
