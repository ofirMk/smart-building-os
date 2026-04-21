import { redirect } from "next/navigation"

import { PartnerProfitCenterClient } from "@/app/(dashboard)/marker-ofek/partner-finance/partner-profit-center-client"
import { getOrganizationBranding } from "@/lib/marker-ofek/organization-branding"
import { getPartnerFinancials } from "@/lib/marker-ofek/partner-metrics-actions"
import { isPartnerMetricsViewer } from "@/lib/marker-ofek/partner-metrics/access"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { assertUserMayViewPartnerFinancials } from "@/lib/marker-ofek/user-dashboard-config-actions"

export default async function MarkerOfekPartnerProfitCenterPage() {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email || !isPartnerMetricsViewer(user.email)) {
    redirect("/dashboard")
  }
  if (!(await assertUserMayViewPartnerFinancials())) {
    redirect("/marker-ofek/command-center")
  }

  const [res, branding] = await Promise.all([
    getPartnerFinancials({ filterPartnerId: null }),
    getOrganizationBranding(),
  ])
  if (!res.ok) {
    return (
      <div className="bg-card p-8 font-sans text-[#0f172a] rtl" dir="rtl">
        <p className="text-sm text-red-600">{res.error}</p>
      </div>
    )
  }

  return (
    <div className="bg-card font-sans text-[#0f172a] rtl" dir="rtl">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10">
        <header className="space-y-2 border-b border-slate-100 pb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
            מרכז שותפי ניהול
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-[#0f172a] md:text-3xl">
            {branding.organizationName} — רווחיות והנהלה בכירה
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
            הכנסות: חשבוניות בסטטוס מאושר או שולם בלבד. עלויות: ספקי ביצוע, שכר (ידני או גנט), קופה קטנה, עומס
            אתר, רכש (PO שאינו טיוטה). דמי ניהול = 25% מרווח נקי לפרויקט.
          </p>
        </header>

        <PartnerProfitCenterClient payload={res.data} />
      </div>
    </div>
  )
}
