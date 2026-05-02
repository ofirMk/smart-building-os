import type { Metadata } from "next"

import ReconciliationWorkspace from "@/components/marker-ofek/finance/reconciliation-workspace"

export const metadata: Metadata = {
  title: "התאמת חשבוניות (3-Way Match)",
  description:
    "Phase 8.3 — Reconciliation Dashboard: בקרת חשבוניות ספק מול הזמנות רכש ותעודות קבלה.",
}

export default function ReconciliationPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
      <ReconciliationWorkspace />
    </div>
  )
}
