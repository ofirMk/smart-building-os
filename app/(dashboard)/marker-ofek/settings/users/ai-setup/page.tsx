import type { Metadata } from "next"
import { redirect } from "next/navigation"

import type { AppUserRole } from "@/lib/auth/user-role"
import { isPartnerDashboardSuperAdmin } from "@/lib/marker-ofek/partner-metrics/access"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

import { AiUserSetupClient } from "./ai-setup-client"

export const metadata: Metadata = {
  title: "הקמת משתמש (AI)",
}

export default async function AiUserSetupPage() {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) redirect("/auth/marker-ofek/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  const role = (profile as { role?: AppUserRole } | null)?.role ?? "tenant"
  const allowed = role === "admin" || isPartnerDashboardSuperAdmin(user.email ?? null)
  if (!allowed) redirect("/marker-ofek")

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("is_deleted", false)
    .order("name", { ascending: true })
    .limit(500)

  const projectOptions =
    (projects as { id: string; name: string | null }[] | null)?.map((p) => ({
      id: p.id,
      name: p.name?.trim() || "ללא שם",
    })) ?? []

  return <AiUserSetupClient projectOptions={projectOptions} />
}
