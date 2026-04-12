import type { Metadata } from "next"
import dynamic from "next/dynamic"
import { Suspense } from "react"

import { FinanceBillingWorkspaceSkeleton } from "@/components/marker-ofek/finance/billing-workspace-skeleton"

const SubcontractorBillingWorkspace = dynamic(
  () =>
    import("@/components/marker-ofek/finance/subcontractor-billing-workspace").then(
      (m) => ({ default: m.SubcontractorBillingWorkspace })
    ),
  { loading: () => <FinanceBillingWorkspaceSkeleton />, ssr: false }
)

export const metadata: Metadata = {
  title: "אישור חשבונות קבלנים",
  description:
    "Phase 4.1 — אישור חשבון חלקי מול קבלן משנה, שלושת השלבים ואזהרת ליקויי QA",
}

export default function NewSubcontractorBillingPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      <Suspense fallback={<FinanceBillingWorkspaceSkeleton />}>
        <SubcontractorBillingWorkspace />
      </Suspense>
    </div>
  )
}
