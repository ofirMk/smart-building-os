import type { Metadata } from "next"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"

import { VendorBidPortal } from "@/components/vendor/vendor-bid-portal"
import { fetchVendorRfqAction } from "@/lib/marker-ofek/procurement/t14-vendor-rfq-actions"

export const metadata: Metadata = {
  title: "הגשת הצעת מחיר",
}

export const dynamic = "force-dynamic"

/**
 * Sprint T14 — Public vendor magic-link bidding page.
 *
 * Anonymous-accessible. Resolves the RFQ envelope for the supplied token
 * (auto-seeder returns the demo "Aluminum Works" envelope for the demo
 * UUID), then renders the mobile-first bidding portal.
 */
export default async function VendorRfqPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const result = await fetchVendorRfqAction(token)

  if (!result.ok) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        <div
          dir="rtl"
          className="flex min-h-[calc(100dvh-1rem)] flex-col items-center justify-center gap-4 px-6 py-10 text-center"
        >
          <div className="flex size-16 items-center justify-center rounded-full bg-rose-100">
            <AlertTriangle className="size-8 text-rose-600" aria-hidden />
          </div>
          <h1 className="text-xl font-bold text-foreground">
            הקישור אינו תקין או שפג תוקפו
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">{result.error}</p>
          <Link
            href="/"
            className="text-xs text-indigo-700 underline-offset-2 hover:underline"
          >
            חזרה לעמוד הבית
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
      <VendorBidPortal envelope={result.envelope} />
    </div>
  )
}
