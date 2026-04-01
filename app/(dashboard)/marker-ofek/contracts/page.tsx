import type { Metadata } from "next"
import Link from "next/link"
import { FileText, Plus, Scale, Settings } from "lucide-react"

import { buttonVariants } from "@/components/ui/button-variants"
import { ContractsListClient } from "./contracts-list-client"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "ניהול חוזים — מרקר אופק",
  description: "מודול חוזים למזמינים וקבלני משנה — מרקר אופק",
}

export default function MarkerOfekContractsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8">
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-slate-950/90 via-slate-900/80 to-cyan-950/40 p-6 shadow-lg shadow-black/20 md:p-8">
        <div
          className="pointer-events-none absolute -start-24 -top-24 size-72 rounded-full bg-cyan-500/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
              <Scale className="size-6" aria-hidden />
            </div>
            <div className="min-w-0 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-cyan-400/90">
                מרקר אופק
              </p>
              <h1 className="text-pretty text-2xl font-bold tracking-tight text-white md:text-3xl">
                מרקר אופק — ניהול חוזים (מזמין / קבלני משנה)
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
                מעקב אחר חוזים ראשיים ומשניים, ישויות עסקיות ופרויקטי ביצוע.
                לחצו על שורה או על &quot;צפייה&quot; לפתיחת פרטי החוזה והגשת חשבון חלקי.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href="/marker-ofek/settings"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "gap-2 border-white/30 bg-white/5 text-white hover:bg-white/10"
              )}
            >
              <Settings className="size-4" aria-hidden />
              פרטים רשמיים למס
            </Link>
            <Link
              href="/marker-ofek/contracts/new"
              className={cn(
                buttonVariants({ size: "lg" }),
                "gap-2 bg-cyan-600 text-white hover:bg-cyan-500"
              )}
            >
              <Plus className="size-4" aria-hidden />
              יצירת חוזה חדש
            </Link>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-border/60 bg-card/80 shadow-sm backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-4 md:px-6">
          <div className="flex items-center gap-2 text-foreground">
            <FileText className="size-5 text-muted-foreground" aria-hidden />
            <h2 className="text-lg font-semibold tracking-tight">
              רשימת חוזים
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            עמודות: מזהה פרויקט · שם ישות · סוג חוזה · סכום כולל · סטטוס
          </p>
        </div>

        <ContractsListClient />
      </section>
    </div>
  )
}
