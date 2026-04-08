import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, FileText, List, Receipt } from "lucide-react"

import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "חשבוניות והפקה — כספים",
}

const TILES = [
  {
    title: "חשבונית מס חדשה",
    desc: "בחירת לקוח, פרויקט ושורות — חישוב מע״מ חי והפקה במערכת.",
    href: "/marker-ofek/finance/invoices/new",
    icon: FileText,
  },
  {
    title: "רשימת חשבוניות",
    desc: "כל המסמכים שהופקו, הדפסה ומעקב סטטוס.",
    href: "/marker-ofek/finance",
    icon: List,
  },
  {
    title: "חשבונית מרכזת",
    desc: "אגרגציה חודשית לפי פרויקט.",
    href: "/marker-ofek/finance/centralized",
    icon: Receipt,
  },
] as const

export default function FinanceInvoicesHubPage() {
  return (
    <div
      dir="rtl"
      lang="he"
      className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-16"
    >
      <Link
        href="/marker-ofek/finance"
        className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 transition-colors hover:text-emerald-700"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לכספים
      </Link>

      <header className="rounded-2xl border border-emerald-500/20 bg-slate-900 p-6 shadow-2xl sm:p-8">
        <p className="text-xs font-medium uppercase tracking-wider text-emerald-400/90">
          מודול כספים
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          חשבוניות והפקה
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          הפקת חשבוניות מס, שמירת לקוחות במאגר חשבונאות ותיאום מול פרויקטים —
          הכול בתוך המערכת, ללא תלות בתוכנת הנה״ח החיצונית.
        </p>
      </header>

      <nav
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="פעולות חשבוניות"
      >
        {TILES.map((t) => {
          const Icon = t.icon
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-auto min-h-[140px] flex-col items-stretch justify-between gap-3 rounded-2xl border-slate-800 bg-slate-900/90 p-5 text-start shadow-xl transition-colors hover:border-emerald-500/40 hover:bg-slate-900"
              )}
            >
              <span className="flex size-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-950/40 text-emerald-400">
                <Icon className="size-5" strokeWidth={1.5} aria-hidden />
              </span>
              <span>
                <span className="block text-base font-semibold text-white">
                  {t.title}
                </span>
                <span className="mt-1 block text-sm font-normal text-slate-400">
                  {t.desc}
                </span>
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
