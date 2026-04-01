import { Suspense } from "react"

import { AmenitiesPageSkeleton } from "@/components/amenities/amenities-page-skeleton"

import { AmenitiesContent } from "./amenities-content"

export const dynamic = "force-dynamic"

export default function AmenitiesPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 text-start">
      <p className="text-sm text-muted-foreground">
        הזמנות לחדר כושר ולמתחם משותף, כולל הגבלות קיבולת והצהרת בריאות דיגיטלית
        לפני האישור.
      </p>

      <Suspense fallback={<AmenitiesPageSkeleton />}>
        <AmenitiesContent />
      </Suspense>
    </div>
  )
}
