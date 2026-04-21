import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, ExternalLink } from "lucide-react"

import { PartnerProjectDetailForm } from "@/app/(dashboard)/marker-ofek/partner-finance/[projectId]/partner-project-detail-form"
import { Button } from "@/components/ui/button"
import { getPartnerFinancials } from "@/lib/marker-ofek/partner-metrics-actions"
import { isPartnerMetricsViewer } from "@/lib/marker-ofek/partner-metrics/access"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { assertUserMayViewPartnerFinancials } from "@/lib/marker-ofek/user-dashboard-config-actions"

export default async function MarkerOfekPartnerFinanceProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const id = String(projectId ?? "").trim()
  if (!id) notFound()

  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email || !isPartnerMetricsViewer(user.email)) {
    redirect("/dashboard")
  }
  if (!(await assertUserMayViewPartnerFinancials())) {
    redirect("/marker-ofek")
  }

  const res = await getPartnerFinancials({ filterPartnerId: null, projectId: id })
  if (!res.ok || res.data.projects.length !== 1) {
    notFound()
  }

  const row = res.data.projects[0]

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 bg-card px-6 py-10 text-[#0f172a]" dir="rtl">
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit gap-2 text-slate-500 hover:text-[#0f172a]"
          render={
            <Link href="/marker-ofek/partner-finance">
              <ArrowLeft className="size-4" aria-hidden />
              חזרה למרכז רווחיות
            </Link>
          }
        />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">פירוט פרויקט</p>
          <h1 className="page-title mt-1 md:text-3xl">
            <span className="font-rubik block text-sm text-slate-500">{row.code}</span>
            {row.name}
          </h1>
        </div>
      </div>

      <section className="rounded-xl border border-slate-100 bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-500">מקורות וקישורים</h2>
        <ul className="flex flex-col gap-2 text-sm">
          <li>
            <Link
              className="inline-flex items-center gap-1.5 font-medium text-indigo-600 hover:text-indigo-500"
              href={`/marker-ofek/execution/gantt/${row.projectId}`}
            >
              גנט ושיבוצי משאבים (שכר)
              <ExternalLink className="size-3.5 opacity-70" aria-hidden />
            </Link>
          </li>
          <li>
            <Link
              className="inline-flex items-center gap-1.5 font-medium text-indigo-600 hover:text-indigo-500"
              href="/marker-ofek/procurement"
            >
              מודול רכש (הזמנות)
              <ExternalLink className="size-3.5 opacity-70" aria-hidden />
            </Link>
          </li>
          <li>
            <Link
              className="inline-flex items-center gap-1.5 font-medium text-indigo-600 hover:text-indigo-500"
              href={`/marker-ofek/projects/${row.projectId}`}
            >
              כרטיס פרויקט
              <ExternalLink className="size-3.5 opacity-70" aria-hidden />
            </Link>
          </li>
        </ul>
      </section>

      <section className="rounded-xl border border-slate-100 bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-500">פירוט רווחיות</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
            <dt className="text-slate-500">הכנסות (חשבוניות מאושר / שולם)</dt>
            <dd className="font-currency-mono text-[#0f172a]">
              {formatIls(row.totalClientInvoices)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">חברות ביצוע</dt>
            <dd className="font-currency-mono">{formatIls(row.subconCosts)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">
              שכר {row.employeeSalariesIsManual ? "(ידני)" : "(גנט)"}
            </dt>
            <dd className="font-currency-mono">{formatIls(row.employeeSalaries)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">קופה קטנה</dt>
            <dd className="font-currency-mono">{formatIls(row.pettyCash)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">עלות אתר / עומס</dt>
            <dd className="font-currency-mono">{formatIls(row.siteOverhead)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
            <dt className="text-slate-500">רכש (הזמנות, לא טיוטה)</dt>
            <dd className="font-currency-mono">{formatIls(row.procurementOrders)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">דמי ניהול (25%)</dt>
            <dd className="font-currency-mono text-indigo-600">{formatIls(row.managementFeeDue)}</dd>
          </div>
          <div className="flex justify-between gap-4 pt-1 text-base font-semibold">
            <dt className="text-[#0f172a]">רווח נקי</dt>
            <dd
              className={
                row.profit >= 0 ? "font-currency-mono text-emerald-600" : "font-currency-mono text-rose-600"
              }
            >
              {formatIls(row.profit)}
            </dd>
          </div>
        </dl>
      </section>

      <PartnerProjectDetailForm projectId={row.projectId} initialRow={row} />
    </div>
  )
}

function formatIls(n: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n)
}
