import { type Metadata } from "next"
import { redirect } from "next/navigation"

import { ManagementDashboardClient } from "@/app/(dashboard)/management/management-dashboard-client"
import type { AppUserRole } from "@/lib/auth/user-role"
import { canViewHoldingExecutive } from "@/lib/marker-ofek/partner-metrics/access"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export const metadata: Metadata = {
  title: "לוח ניהול בכיר — Holden Group",
}

export default async function ManagementDashboardPage() {
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

  return <ManagementDashboardClient />
}
