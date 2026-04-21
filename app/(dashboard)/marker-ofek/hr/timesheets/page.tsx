import type { Metadata } from "next"
import { Suspense } from "react"

import { FinanceBillingWorkspaceSkeleton } from "@/components/marker-ofek/finance/billing-workspace-skeleton"
import { TimesheetWorkspace } from "@/components/marker-ofek/hr/timesheet-workspace"

export const metadata: Metadata = {
  title: "ניהול שעות ושכר",
  description:
    "Phase 9.2 — אישור שעות חודשי, נוספות וייצוא שכר להנה״ח (CSV)",
}

export default function HrTimesheetsPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
      <Suspense fallback={<FinanceBillingWorkspaceSkeleton />}>
        <TimesheetWorkspace />
      </Suspense>
    </div>
  )
}
