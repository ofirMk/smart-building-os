import Link from "next/link"
import { Shield } from "lucide-react"

export default function FinanceRetentionPage() {
  return (
    <div
      dir="rtl"
      lang="he"
      className="mx-auto w-full max-w-3xl space-y-8 pb-16"
    >
      <Link
        href="/marker-ofek/finance/contracts-billing"
        className="inline-flex w-fit text-sm text-slate-500 hover:text-indigo-950"
      >
        חזרה למרכז חוזה וחשבונות
      </Link>
      <header className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="flex size-11 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-indigo-950">
            <Shield className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-indigo-950">
              עכבון וערבויות
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              מעקב אחר ניכויי עכבון, ביטוחים וערבויות ביצוע לפי כללים בחוזה וחשבונות
              חלקיים.
            </p>
            <p className="mt-4 text-sm text-slate-500">
              ניהול כללי מתבצע במסך{" "}
              <Link
                href="/marker-ofek/finance/billing"
                className="font-medium text-indigo-800 underline-offset-2 hover:underline"
              >
                מרכז חיוב ותזרים
              </Link>
              .
            </p>
          </div>
        </div>
      </header>
    </div>
  )
}
