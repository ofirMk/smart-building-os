import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { getHoldingExecutiveDashboard } from "@/lib/marker-ofek/partner-metrics-actions"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { canViewHoldingExecutive } from "@/lib/marker-ofek/partner-metrics/access"
import type { AppUserRole } from "@/lib/auth/user-role"
export const metadata: Metadata = {
  title: "דוח רווח והפסד — כספים",
}

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

export default async function FinancePnLPage() {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id || !user.email) redirect("/")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  const role = (profile as { role?: AppUserRole } | null)?.role ?? null
  if (!canViewHoldingExecutive(user.email, role)) {
    redirect("/marker-ofek/finance")
  }

  const res = await getHoldingExecutiveDashboard()
  if (!res.ok) {
    return (
      <div className="p-8 rtl" dir="rtl">
        <p className="text-sm text-red-600">{res.error}</p>
      </div>
    )
  }

  const d = res.data
  const l1 = d.portfolioGrossProfitNis
  const l2Field = d.netProfitNis
  const pool = d.totalMonthlyCorporateOverheadNis
  const l3 = d.portfolioNetLoadedProfitNis

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 md:px-6 rtl" dir="rtl">
      <header>
        <Link
          href="/marker-ofek/finance"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← חזרה לחשבוניות
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#1e293b]">
          רווח והפסד — היררכיה מקונסלדציה
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          מקורות: הכנסות מוכרות ועלות ישירה ממנוע שותפים (חשבוניות + חלקיים ללא כפילות, רכש PO
          מאושר). עומס הנהלה מרישום העקיפות הפעיל.{" "}
          <span className="font-medium text-slate-700">
            מדיניות העמסה: {d.overheadAllocationLabel}
          </span>
        </p>
      </header>

      <ol className="space-y-4">
        <li className="rounded-xl border border-slate-100 border-s-teal-300 bg-card p-5 shadow-sm ring-1 ring-teal-100">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">
            רמה 1 — רווח גולמי פרויקט
          </p>
          <p className="mt-1 text-xs text-slate-500">
            הכנסה מוכרת פחות עלויות ישירות (קבלנים, רכש, שכר) — לפני קופה ועומס אתר.
          </p>
          <p className="mt-3 font-currency-mono text-2xl font-semibold tabular-nums text-[#0f172a]">
            {ils.format(l1)}
          </p>
        </li>
        <li className="rounded-xl border border-slate-100 bg-card p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">
            רמה 2 — רווח שטח (תפעולי)
          </p>
          <p className="mt-1 text-xs text-slate-500">
            אחרי קופה קטנה ועומס אתר (`partner` buckets) — לפני עקיפות חברה.
          </p>
          <p className="mt-3 font-currency-mono text-2xl font-semibold tabular-nums text-[#0f172a]">
            {ils.format(l2Field)}
          </p>
        </li>
        <li className="rounded-xl border border-slate-100 bg-card p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700">
            עומס הנהלה חודשי (פורטפוליו)
          </p>
          <p className="mt-1 text-xs text-slate-500">סכום שורות פעילות מרישום העקיפות.</p>
          <p className="mt-3 font-currency-mono text-2xl font-semibold tabular-nums text-[#0f172a]">
            {ils.format(pool)}
          </p>
        </li>
        <li className="rounded-xl border border-violet-100 bg-violet-50/40 p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-900">
            רמה 3 — רווח נטו טעון (קונסולידציה)
          </p>
          <p className="mt-1 text-xs text-slate-600">
            רווח שטח פחות חלוקת עקיפות חברה לפי מדיניות ההעמסה.
          </p>
          <p className="mt-3 font-currency-mono text-2xl font-semibold tabular-nums text-violet-950">
            {ils.format(l3)}
          </p>
        </li>
      </ol>

      <p className="text-center text-xs text-slate-400">
        לפרטי פרויקט ראו{" "}
        <Link href="/management" className="text-indigo-700 underline">
          דשבורד הנהלה
        </Link>
        .
      </p>
    </div>
  )
}
