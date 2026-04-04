import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { resolvePartnerMetricsPersona } from "@/lib/marker-ofek/partner-metrics/access"
import { TendersHubClient } from "@/components/marker-ofek/tenders/tenders-hub-client"

export default async function MarkerOfekTendersHubPage() {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const canConvertTender = resolvePartnerMetricsPersona(user?.email ?? null) === "ophir"

  return <TendersHubClient canConvertTender={canConvertTender} />
}
