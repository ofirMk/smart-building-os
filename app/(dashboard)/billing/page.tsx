import { BillingManagementView } from "@/components/billing/billing-management-view"
import {
  BILLING_INVOICES_MOCK,
  BILLING_SUMMARY_MOCK,
} from "@/components/billing/billing-mock-data"

export default function BillingPage() {
  return (
    <BillingManagementView
      summary={BILLING_SUMMARY_MOCK}
      invoices={BILLING_INVOICES_MOCK}
    />
  )
}
