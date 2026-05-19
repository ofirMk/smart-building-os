import type { Metadata } from "next"
import Link from "next/link"

import { BidLevelingMatrix } from "@/components/marker-ofek/procurement/bid-leveling-matrix"
import { fetchTenderComparisonAction } from "@/lib/marker-ofek/procurement/t12-tender-comparison-actions"

export const metadata: Metadata = {
  title: "השוואת הצעות מכרז · Marker Ofek",
}

export const dynamic = "force-dynamic"

/**
 * Sprint T12 — Tender Bid Leveling page.
 *
 * Server component: optionally accepts `?rfqId=<uuid>` to compare a specific
 * RFQ; otherwise the action picks the most recent OPEN one and falls back
 * to a hand-crafted demo comparison if nothing real is available.
 */
export default async function TenderComparePage({
  searchParams,
}: {
  searchParams?: Promise<{ rfqId?: string }>
}) {
  const params = (await searchParams) ?? {}
  const result = await fetchTenderComparisonAction(params.rfqId)

  if (!result.ok) {
    return (
      <section dir="rtl" className="flex flex-col gap-3 p-6">
        <header className="space-y-1">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            Sprint T12 · MedaTech §7 Tender Bid Leveling
          </p>
          <h1 className="text-2xl font-semibold text-foreground">
            השוואת הצעות מכרז
          </h1>
        </header>
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          טעינת המכרז נכשלה: {result.error}
        </div>
        <Link
          href="/marker-ofek"
          className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          חזרה ללוח הבקרה →
        </Link>
      </section>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 pb-12 sm:p-6">
      <BidLevelingMatrix comparison={result.comparison} />
    </div>
  )
}
