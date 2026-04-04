import { redirect } from "next/navigation"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { resolvePostMarkerOfekLoginPath } from "@/lib/marker-ofek/post-auth-redirect"

/** כינוי ליעד אחרי התחברות — מסונכרן עם `resolvePostMarkerOfekLoginPath`. */
export default async function MarkerOfekDashboardAliasPage() {
  const supabase = await createSupabaseServerAuthClient()
  const path = await resolvePostMarkerOfekLoginPath(supabase)
  redirect(path)
}
