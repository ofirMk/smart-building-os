import type { Metadata } from "next"

import { FinanceOverheadClient } from "@/app/(dashboard)/marker-ofek/finance/overhead/finance-overhead-client"
import { getCompanyOverheadAllocationMethod } from "@/lib/marker-ofek/finance-company-settings-actions"
import { listOverheadRegistryItems } from "@/lib/marker-ofek/overhead-registry-actions"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export const metadata: Metadata = {
  title: "עקיפות והעמסה — כספים",
}

export default async function FinanceOverheadPage() {
  const reg = await listOverheadRegistryItems()
  const meth = await getCompanyOverheadAllocationMethod()

  const supabase = await createSupabaseServerAuthClient()
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, internal_project_code")
    .eq("is_deleted", false)
    .order("internal_project_code", { ascending: true })

  const plist = (projects ?? []) as {
    id: string
    name: string | null
    internal_project_code: string | null
  }[]
  const ids = plist.map((p) => p.id)

  let policies: {
    project_id: string
    method: string
    fixed_rate_percent: number
  }[] = []

  if (ids.length > 0) {
    const { data: pol, error } = await supabase
      .from("project_overhead_allocation")
      .select("project_id, method, fixed_rate_percent")
      .in("project_id", ids)
    if (!error && pol) {
      policies = pol as typeof policies
    }
  }

  return (
    <FinanceOverheadClient
      initialRegistry={reg.ok ? reg.rows : []}
      initialMethod={meth.ok ? meth.method : "revenue_pct"}
      initialProjects={plist}
      initialPolicies={policies}
    />
  )
}
