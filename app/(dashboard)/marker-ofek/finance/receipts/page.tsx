import type { Metadata } from "next"
import { cookies } from "next/headers"

import { CustomerReceiptComposer } from "@/components/marker-ofek/finance/customer-receipt-composer"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { listOpenClientBillsAction } from "@/lib/marker-ofek/finance/t6-ar-ap-actions"

export const metadata: Metadata = {
  title: "תקבולי לקוחות · Marker Ofek",
}

export const dynamic = "force-dynamic"

/**
 * Sprint T6 — Customer receipt entry.
 *
 * Lists every open client progress bill (status SUBMITTED/PARTIALLY_APPROVED/
 * APPROVED with payment_status != PAID) and lets the user allocate a single
 * receipt across one or more bills. On save → triggers fire and AR balances
 * + GL JE update automatically.
 */
export default async function FinanceReceiptsPage() {
  const cookieStore = await cookies()
  const companyId =
    resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value) ?? "marker_ofek"

  const result = await listOpenClientBillsAction(companyId)

  return (
    <CustomerReceiptComposer
      companyId={companyId}
      openBills={result.ok ? result.bills : []}
      error={result.ok ? null : result.error}
    />
  )
}
