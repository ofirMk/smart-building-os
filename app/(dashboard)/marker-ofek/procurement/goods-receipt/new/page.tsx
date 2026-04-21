import type { Metadata } from "next"

import GoodsReceiptWorkspace from "@/components/marker-ofek/procurement/goods-receipt-workspace"

export const metadata: Metadata = {
  title: "קליטת סחורה (GR)",
  description:
    "Phase 2.2 — קליטת סחורה מול הזמנת רכש מאושרת (Three-way match — שלב קליטה)",
}

export default function NewGoodsReceiptPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
      <GoodsReceiptWorkspace />
    </div>
  )
}
