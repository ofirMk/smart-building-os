import Link from "next/link"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { LayoutDashboard } from "lucide-react"

import { MasterPlanTracker } from "@/components/dashboard/master-plan-tracker"
import { Button } from "@/components/ui/button"
import { getFocusModeHomeHref } from "@/lib/marker-ofek/focus-mode"

export const metadata: Metadata = {
  title: "דף הבית",
}

/**
 * דף הבית של מרקר אופק — מפת דרכים לשדרוג Holden ERP וקישור למרכז הפיקוד.
 *
 * ב-Focus Mode פעיל (NEXT_PUBLIC_FOCUS_MODE=items): מפנה ישירות ל-`/marker-ofek/items`.
 */
export default function MarkerOfekHomePage() {
  const focusHome = getFocusModeHomeHref()
  if (focusHome) {
    redirect(focusHome)
  }
  return (
    <div
      dir="rtl"
      lang="he"
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-12 pt-2"
    >
      <header className="space-y-1 text-start">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          מרקר אופק
        </p>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          דף הבית
        </h1>
        <p className="text-sm text-muted-foreground">
          מעקב אחר שלבי שדרוג המערכת; מרכז העבודה היומי נמצא במרכז הפיקוד.
        </p>
      </header>

      <MasterPlanTracker />

      <div className="flex flex-wrap items-center justify-start gap-3">
        <Button
          className="gap-2"
          render={<Link href="/marker-ofek/command-center" />}
        >
          <LayoutDashboard className="size-4" aria-hidden />
          כניסה למרכז הפיקוד
        </Button>
      </div>
    </div>
  )
}
