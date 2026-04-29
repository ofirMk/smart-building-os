import type { Metadata } from "next"
import { Suspense } from "react"

import { TechnicalCatalogWorkspace } from "@/components/marker-ofek/catalog/technical-catalog-workspace"

export const metadata: Metadata = {
  title: "קטלוג פריטים טכני (מאסטר)",
  description:
    "Phase 2 — מרחב עבודה Master-Detail לקטלוג מאסטר",
}

function CatalogFallback() {
  return (
    <div
      className="flex min-h-[min(420px,50vh)] items-center justify-center bg-card text-sm text-slate-500"
      dir="rtl"
    >
      טוען קטלוג…
    </div>
  )
}

export default function TechnicalItemsCatalogPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <Suspense fallback={<CatalogFallback />}>
        <TechnicalCatalogWorkspace />
      </Suspense>
    </div>
  )
}
