import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { ArrowLeft, Archive } from "lucide-react"

import { TechnicalCatalogWorkspace } from "@/components/marker-ofek/catalog/technical-catalog-workspace"

export const metadata: Metadata = {
  title: "קטלוג טכני (legacy)",
  description:
    "Phase 2 — מרחב עבודה Master-Detail לקטלוג מאסטר (legacy, mock data). הוחלף ע״י /marker-ofek/items.",
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

/**
 * Phase 7.14.0 — Legacy banner.
 *
 * ה-Workspace הזה (`technical-catalog-workspace`) משתמש ב-mock data ונשמר רק
 * כארכיון לצורך סקירה/השוואה. הקטלוג החי הוא `/marker-ofek/items` (Phase 7.13).
 */
function LegacyBanner() {
  return (
    <div
      dir="rtl"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300/60 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200"
    >
      <div className="flex items-start gap-3">
        <Archive className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">מסך זה נשמר בארכיון</p>
          <p className="text-xs leading-relaxed">
            הקטלוג כאן עובד על נתוני דמה. ניהול פריטים אקטיבי (master נתוני אב,
            ספקים, מחירים) עבר ל-<strong>קטלוג פריטים (נתוני אב)</strong>.
          </p>
        </div>
      </div>
      <Link
        href="/marker-ofek/items"
        className="inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 shadow-sm transition-colors hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60"
      >
        עבור לקטלוג החי
        <ArrowLeft className="size-3.5" aria-hidden />
      </Link>
    </div>
  )
}

export default function TechnicalItemsCatalogPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <LegacyBanner />
      <Suspense fallback={<CatalogFallback />}>
        <TechnicalCatalogWorkspace />
      </Suspense>
    </div>
  )
}
