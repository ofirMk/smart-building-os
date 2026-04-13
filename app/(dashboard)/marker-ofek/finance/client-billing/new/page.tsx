import type { Metadata } from "next"
import { Suspense } from "react"

import { ClientBillingWorkspace } from "@/components/marker-ofek/finance/client-billing-workspace"
import { FinanceBillingWorkspaceSkeleton } from "@/components/marker-ofek/finance/billing-workspace-skeleton"

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
