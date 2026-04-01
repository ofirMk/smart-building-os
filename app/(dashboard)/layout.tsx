import { AiAssistant } from "@/components/dashboard/AiAssistant"
import { DashboardShell } from "@/components/dashboard-shell"
import type { AppUserRole } from "@/lib/auth/user-role"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let userEmail: string | null = null
  let userRole: AppUserRole = "tenant"

  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    userEmail = user?.email ?? null

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
      const r = (profile as { role?: AppUserRole } | null)?.role
      if (r) userRole = r
    }
  } catch {
    userEmail = null
  }

  return (
    <>
      <DashboardShell userEmail={userEmail} userRole={userRole}>
        {children}
      </DashboardShell>
      <AiAssistant />
    </>
  )
}
