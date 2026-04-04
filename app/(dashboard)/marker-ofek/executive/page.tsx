import { type Metadata } from "next"
import { redirect } from "next/navigation"

import { HoldingExecutiveDashboardClient } from "@/app/(dashboard)/marker-ofek/executive/holding-executive-dashboard-client"
import { getHoldingExecutiveDashboard } from "@/lib/marker-ofek/partner-metrics-actions"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { canViewHoldingExecutive } from "@/lib/marker-ofek/partner-metrics/access"
import type { AppUserRole } from "@/lib/auth/user-role"

export const metadata: Metadata = {
  title: "דשבורד הנהלה — Holding",
}

export default async function HoldingExecutivePage() {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id || !user.email) {
    redirect("/")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  const role = (profile as { role?: AppUserRole } | null)?.role ?? null
  if (!canViewHoldingExecutive(user.email, role)) {
    redirect("/marker-ofek/command-center")
  }

  const res = await getHoldingExecutiveDashboard()
  if (!res.ok) {
    return (
      <div
        className="min-h-screen bg-[#fafafa] p-8 font-sans text-[#0f172a] rtl"
        dir="rtl"
      >
        <div className="mx-auto max-w-6xl rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <p className="text-sm text-red-600">{res.error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#fafafa] font-sans text-[#0f172a] rtl" dir="rtl">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10">
        <HoldingExecutiveDashboardClient payload={res.data} />
      </div>
    </div>
  )
}
