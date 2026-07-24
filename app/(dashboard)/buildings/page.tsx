import Link from "next/link"
import { Suspense } from "react"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { BuildingsGridSkeleton } from "@/components/buildings/buildings-grid-skeleton"

import { BuildingsContent } from "./buildings-content"

export const dynamic = "force-dynamic"

export default function BuildingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 text-start" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">
          פורטפוליו נכסים: כל בניין עם כתובת מלאה, מספר דירות ועמדות טעינה חשמלית.
        </p>
        <Button
          size="sm"
          className="w-full gap-2 sm:w-auto"
          render={<Link href="/buildings/new" />}
        >
          <Plus className="size-4" aria-hidden />
          הוסף בניין חדש
        </Button>
      </div>

      <Suspense fallback={<BuildingsGridSkeleton />}>
        <BuildingsContent />
      </Suspense>
    </div>
  )
}
