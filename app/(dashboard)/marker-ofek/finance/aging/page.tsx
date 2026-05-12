import type { Metadata } from "next"
import { cookies } from "next/headers"

import { AgingDualReport } from "@/components/marker-ofek/finance/aging-dual-report"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { fetchCanonicalAgingReportAction } from "@/lib/marker-ofek/finance/t6-ar-ap-actions"

export const metadata: Metadata = {
  title: "גילאי חוב AR + AP · Marker Ofek",
}

export const dynamic = "force-dynamic"

/**
 * Sprint T6 — Combined AR + AP aging.
 *
 * Pulls open AR (approved client progress bills not fully paid) and open AP
 * (approved/ready-for-payment vendor invoices not fully paid) from canonical
 * ERP tables and renders bucket cards + drill-down tables for both sides.
 */
export default async function FinanceAgingPage() {
  const cookieStore = await cookies()
  const companyId =
    resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value) ?? "marker_ofek"

  const [ar, ap] = await Promise.all([
    fetchCanonicalAgingReportAction(companyId, "AR"),
    fetchCanonicalAgingReportAction(companyId, "AP"),
  ])

  return (
    <AgingDualReport
      arReport={ar.ok ? ar.report : null}
      apReport={ap.ok ? ap.report : null}
      errors={{
        ar: ar.ok ? null : ar.error,
        ap: ap.ok ? null : ap.error,
      }}
    />
  )
}
