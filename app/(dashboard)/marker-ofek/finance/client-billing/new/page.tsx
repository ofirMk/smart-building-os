import type { Metadata } from "next"
import dynamic from "next/dynamic"
import { Suspense } from "react"

import { FinanceBillingWorkspaceSkeleton } from "@/components/marker-ofek/finance/billing-workspace-skeleton"

const ClientBillingWorkspace = dynamic(
  () =>
    import("@/components/marker-ofek/finance/client-billing-workspace").then(
      (m) => ({ default: m.ClientBillingWorkspace })
    ),
  { loading: () => <FinanceBillingWorkspaceSkeleton />, ssr: false }
)

export const metadata: Metadata = {
  title: "הגשת חשבון יזם (מצטבר)",
  description:
    "Phase 4.2 — בקשת תשלום מצטברת מול יזם, כמות תקופה וסיכום כספי",
}

export default function NewClientBillingPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      <Suspense fallback={<FinanceBillingWorkspaceSkeleton />}>
        <ClientBillingWorkspace />
      </Suspense>
    </div>
  )
}
