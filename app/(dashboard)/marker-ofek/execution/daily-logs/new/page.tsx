import type { Metadata } from "next"
import { Suspense } from "react"

import { DailyLogWorkspace } from "@/components/marker-ofek/execution/daily-log-workspace"

export const metadata: Metadata = {
  title: "יומן עבודה יומי",
  description:
    "Phase 3.1 — יומן ביצוע בשטח: כוח אדם, משימות, מזג אוויר ושידור למשרד",
}

export default function NewDailyLogPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
      <Suspense
        fallback={
          <div className="p-8 text-center text-slate-500" dir="rtl">
            טוען יומן עבודה...
          </div>
        }
      >
        <DailyLogWorkspace />
      </Suspense>
    </div>
  )
}
