import type { Metadata } from "next"
import { Suspense } from "react"

import { BudgetControlWorkspace } from "@/components/marker-ofek/finance/budget-control-workspace"

export const metadata: Metadata = {
  title: "בקרת תקציב ורווחיות",
  description:
    "Phase 6.1 — תקציב מול עלות בפועל מול הכנסות מחויבות (דמה)",
}

function BudgetFallback() {
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center bg-card text-sm text-slate-500"
      dir="rtl"
    >
      טוען בקרת תקציב…
    </div>
  )
}

export default function BudgetControlPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
      <Suspense fallback={<BudgetFallback />}>
        <BudgetControlWorkspace />
      </Suspense>
    </div>
  )
}
