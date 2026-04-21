import type { Metadata } from "next"
import { Suspense } from "react"

import { EntityWorkspace } from "@/components/layout/EntityWorkspace"
import { PoCreationSidebar } from "@/components/marker-ofek/procurement/po-creation-sidebar"
import { PurchaseOrderEngineForm } from "@/components/marker-ofek/procurement/purchase-order-engine-form"

export const metadata: Metadata = {
  title: "הזמנת רכש",
  description:
    "Phase 2.1 — מנוע הזמנת רכש עם בקרת תקציב (Budget-locked PO Engine)",
}

function PoFormFallback() {
  return (
    <div
      className="flex min-h-[min(420px,50vh)] flex-col items-center justify-center gap-2 bg-card p-8 text-sm text-slate-500"
      dir="rtl"
    >
      <span className="h-8 w-8 animate-pulse rounded-full bg-slate-200" aria-hidden />
      טוען טופס הזמנת רכש…
    </div>
  )
}

export default function NewPurchaseOrderPage() {
  return (
    <EntityWorkspace
      title="Procurement PO Workspace"
      description="Dual-pane Bento layout · יצירת הזמנת רכש"
      sidebar={<PoCreationSidebar />}
      main={
        <Suspense fallback={<PoFormFallback />}>
          <PurchaseOrderEngineForm />
        </Suspense>
      }
    />
  )
}
