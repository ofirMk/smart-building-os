import type { Metadata } from "next"
import Link from "next/link"
import { cookies } from "next/headers"

import { PortfolioCockpit } from "@/components/marker-ofek/portfolio/portfolio-cockpit"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { fetchPortfolioOverviewAction } from "@/lib/marker-ofek/portfolio/t10-portfolio-actions"

export const metadata: Metadata = {
  title: "פורטפוליו פרויקטים · Marker Ofek",
}

export const dynamic = "force-dynamic"

/**
 * Sprint T10 — Multi-Project Executive Portfolio Cockpit.
 *
 * Server component: resolves company context, calls the aggregation action,
 * and hands the materialised overview to the client cockpit component.
 *
 * Behaviour on auth failure / RLS denial: renders a soft error pane (not a
 * 404 — the route stays registered for the tripwire).
 */
export default async function PortfolioPage() {
  const cookieStore = await cookies()
  const companyId =
    resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value) ??
    "marker_ofek"

  const result = await fetchPortfolioOverviewAction(companyId)

  if (!result.ok) {
    return (
      <section dir="rtl" className="flex flex-col gap-3 p-6">
        <header className="space-y-1">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            Sprint T10 · Executive Portfolio Command Center
          </p>
          <h1 className="text-2xl font-semibold text-foreground">
            פורטפוליו פרויקטים — מבט מנכ״ל
          </h1>
        </header>
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          טעינת הפורטפוליו נכשלה: {result.error}
        </div>
        <Link
          href="/marker-ofek"
          className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          חזרה ללוח הבקרה →
        </Link>
      </section>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 pb-12 sm:p-6">
      <PortfolioCockpit overview={result.overview} />
    </div>
  )
}
