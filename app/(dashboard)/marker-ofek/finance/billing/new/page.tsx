import { BillingControlCenterClient } from "@/components/marker-ofek/finance/billing/billing-control-center-client"
import { fetchBillingControlWorkspaceAction } from "@/lib/holden-erp/billing-actions"

export default async function NewBillingTaxInvoicePage() {
  const res = await fetchBillingControlWorkspaceAction()

  if (!res.ok) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-red-400">
        טעינת מרכז החיוב נכשלה: {res.error}
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1">
      <BillingControlCenterClient workspace={res} />
    </div>
  )
}
