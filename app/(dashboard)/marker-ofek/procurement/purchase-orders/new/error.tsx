"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RefreshCcw } from "lucide-react"

import { Button } from "@/components/ui/button"

export default function PurchaseOrderNewError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Purchase order new route crashed:", error)
  }, [error])

  return (
    <div
      dir="rtl"
      className="mx-auto flex min-h-[40vh] w-full max-w-3xl flex-col items-start justify-center gap-4 rounded-xl border border-amber-300/60 bg-amber-50 p-6 text-amber-900"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-5" aria-hidden />
        <h2 className="text-base font-semibold">לא ניתן לטעון את דף הזמנת הרכש</h2>
      </div>
      <p className="text-sm">
        אירעה שגיאה בזמן טעינת הנתונים. ניתן לנסות שוב או לחזור למרכז הרכש.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={reset} className="gap-2">
          <RefreshCcw className="size-4" aria-hidden />
          נסה שוב
        </Button>
        <Button type="button" variant="outline" render={<Link href="/marker-ofek/procurement" />}>
          חזרה למרכז רכש
        </Button>
      </div>
    </div>
  )
}

