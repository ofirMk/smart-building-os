import Link from "next/link"
import { ArrowRight, BarChart3, Briefcase, Scale, Wallet } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getHoldenCommandCenterKpis } from "@/lib/holden-erp/command-center-kpis"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function HoldenCommandCenterPage() {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/login")
  }

  const kpis = await getHoldenCommandCenterKpis()

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Holden Command Center
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          סינתזה A9+A10 — פרויקטים בביצוע, אישורי חשבונות חלקיים, ומאזני GL.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">פרויקטים בביצוע</CardTitle>
            <Briefcase className="size-4 text-emerald-600" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.activeExecutionProjects}</div>
            <CardDescription className="mt-1">
              פעילים עם{" "}
              <code className="rounded bg-slate-100 px-1 text-[10px] dark:bg-slate-800">
                erp_project_wbs
              </code>
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">חשבונות חלקיים לאישור</CardTitle>
            <BarChart3 className="size-4 text-amber-600" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {kpis.pendingPartialAccountsApproval}
            </div>
            <CardDescription className="mt-1">סטטוס submitted</CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">A/R (לקוחות) — קירוב GL</CardTitle>
            <Wallet className="size-4 text-blue-600" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₪{kpis.arNetFromGl.toLocaleString("he-IL", { minimumFractionDigits: 2 })}
            </div>
            <CardDescription className="mt-1">חשבונות 12xx</CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">A/P (ספקים) — קירוב GL</CardTitle>
            <Scale className="size-4 text-violet-600" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₪{kpis.apNetFromGl.toLocaleString("he-IL", { minimumFractionDigits: 2 })}
            </div>
            <CardDescription className="mt-1">חשבונות 20xx</CardDescription>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">קישורים מהירים</CardTitle>
          <CardDescription>בקרה, רכש, ו-Holden ERP</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link
            href="/marker-ofek/projects"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-900"
          >
            לוח פרויקטים
            <ArrowRight className="size-3.5" />
          </Link>
          <Link
            href="/marker-ofek/holden-erp"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-900"
          >
            Holden ERP
            <ArrowRight className="size-3.5" />
          </Link>
          <Link
            href="/marker-ofek/procurement/purchase-orders/new"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-900"
          >
            הזמנת רכש חדשה
            <ArrowRight className="size-3.5" />
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
