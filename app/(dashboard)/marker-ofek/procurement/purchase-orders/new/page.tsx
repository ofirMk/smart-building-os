import type { Metadata } from "next"

import { PurchaseOrderEngineForm } from "@/components/marker-ofek/procurement/purchase-order-engine-form"

export const metadata: Metadata = {
  title: "הזמנת רכש",
  description:
    "Phase 2.1 — מנוע הזמנת רכש עם בקרת תקציב (Budget-locked PO Engine)",
}

export default function NewPurchaseOrderPage() {
  return (
    <div className="min-h-0 bg-white p-4 md:p-6">
      <PurchaseOrderEngineForm />
    </div>
  )
}
