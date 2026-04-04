import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { UserPermissionsClient } from "./user-permissions-client"
import { isPartnerDashboardSuperAdmin } from "@/lib/marker-ofek/partner-metrics/access"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export const metadata: Metadata = {
  title: "הרשאות משתמשים",
}

export default async function UserPermissionsPage() {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) redirect("/dashboard")
  if (!isPartnerDashboardSuperAdmin(user.email)) redirect("/marker-ofek")

  return <UserPermissionsClient />
}
