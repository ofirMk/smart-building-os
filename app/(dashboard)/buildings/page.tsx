import { Suspense } from "react"

import { BuildingsGridSkeleton } from "@/components/buildings/buildings-grid-skeleton"

import { BuildingsContent } from "./buildings-content"

export const dynamic = "force-dynamic"

export default function BuildingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 text-start">
      <div className="space-y-1">
        <p className="max-w-2xl text-sm text-muted-foreground">
          פורטפוליו נכסים: כל בניין עם כתובת מלאה, מספר דירות ועמדות טעינה חשמלית.
        </p>
      </div>

      <Suspense fallback={<BuildingsGridSkeleton />}>
        <BuildingsContent />
      </Suspense>
    </div>
  )
}
