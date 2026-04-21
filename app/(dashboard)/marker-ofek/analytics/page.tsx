import type { Metadata } from "next"
import { Suspense } from "react"

import { ExecutiveDashboardPageSkeleton } from "@/components/marker-ofek/analytics/executive-dashboard-skeleton"
import { ExecutiveDashboard } from "@/components/marker-ofek/analytics/executive-dashboard"

export const metadata: Metadata = {
  title: "אנליטיקה והנהלה (BI)",
  description:
    "Phase 9.1 — דשבורד הנהלה: רווחיות, תזרים והתחייבויות חוצה־פרויקטים (דמה)",
}

export default function MarkerOfekAnalyticsPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
      <Suspense fallback={<ExecutiveDashboardPageSkeleton />}>
        <ExecutiveDashboard />
      </Suspense>
    </div>
  )
}
