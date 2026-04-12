import type { Metadata } from "next"
import { Suspense } from "react"

import { PurchaseOrderEngineForm } from "@/components/marker-ofek/procurement/purchase-order-engine-form"

export const metadata: Metadata = {
  title: "הזמנת רכש",
  description:
    "Phase 2.1 — מנוע הזמנת רכש עם בקרת תקציב (Budget-locked PO Engine)",
}

function PoFormFallback() {
  return (
    <div
      className="flex min-h-[min(420px,50vh)] flex-col items-center justify-center gap-2 bg-white p-8 text-sm text-slate-500"
      dir="rtl"
    >
      <span className="h-8 w-8 animate-pulse rounded-full bg-slate-200" aria-hidden />
      טוען טופס הזמנת רכש…
    </div>
  )
}

export default function NewPurchaseOrderPage() {
  return (
    <div className="min-h-0 bg-white p-4 md:p-6">
      <Suspense fallback={<PoFormFallback />}>
        <PurchaseOrderEngineForm />
      </Suspense>
    </div>
  )
}
