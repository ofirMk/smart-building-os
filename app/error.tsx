"use client"

import Link from "next/link"
import { useEffect } from "react"
import { AlertTriangle, RefreshCcw } from "lucide-react"

import { Button } from "@/components/ui/button"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[App Router Error Boundary]", error)
  }, [error])

  return (
    <div
      dir="rtl"
      lang="he"
      className="flex min-h-[100dvh] items-center justify-center bg-card p-4 text-foreground [color-scheme:light]"
    >
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-card p-6 shadow-sm md:p-8">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600">
            <AlertTriangle className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-tight md:text-xl">
              אירעה תקלה בטעינת המסך
            </h1>
            <p className="text-sm text-slate-600">
              אפשר לנסות רענון מקומי או לחזור ללוח הבקרה.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-background px-3 py-2 text-xs text-slate-600">
          {error.digest ? `מזהה תקלה: ${error.digest}` : "מזהה תקלה לא זמין"}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className="gap-2 bg-slate-900 text-white hover:bg-slate-800"
            onClick={reset}
          >
            <RefreshCcw className="size-4" aria-hidden />
            נסה שוב
          </Button>
          <Button
            type="button"
            variant="outline"
            render={<Link href="/marker-ofek" />}
          >
            חזרה ללוח הבקרה
          </Button>
        </div>
      </div>
    </div>
  )
}
