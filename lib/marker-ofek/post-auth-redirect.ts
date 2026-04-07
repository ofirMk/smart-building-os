import "server-only"

import type { AppUserRole } from "@/lib/auth/user-role"
import { canViewHoldingExecutive } from "@/lib/marker-ofek/partner-metrics/access"
import type { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

type AuthClient = Awaited<ReturnType<typeof createSupabaseServerAuthClient>>

/**
 * יעד לאחר התחברות מוצלחת מזרימת Marker Ofek (סיסמה / SSO).
 * ברירת מחדל: Command Center; מנהלי הולדינג עם הרשאת executive — ישירות לדשבורד הנהלה.
 */
export async function resolvePostMarkerOfekLoginPath(
  supabase: AuthClient
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) return "/auth/marker-ofek/login"

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  const role = (profile as { role?: AppUserRole } | null)?.role ?? "tenant"
  const email = user.email ?? null

  if (canViewHoldingExecutive(email, role)) {
    return "/management"
  }

  return "/marker-ofek/command-center"
}
