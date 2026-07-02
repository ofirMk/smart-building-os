import { notFound, redirect } from "next/navigation"
import { cookies } from "next/headers"

import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import { OnboardingWizard } from "@/components/erp/onboarding/onboarding-wizard"
import type {
  ErpOnboardingConfig,
  ErpOnboardingTaskInstance,
} from "@/types/onboarding"

interface PageProps {
  params: { buildingId: string }
}

export default async function BuildingOnboardingPage({ params }: PageProps) {
  const cookieStore = await cookies()
  const companyId = resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value)
  if (!companyId) redirect("/login")

  const { buildingId } = params
  const supabase = createSupabaseServiceRoleClient()

  // 1. Verify building belongs to this company
  const { data: building } = await supabase
    .from("buildings")
    .select("id, name, city, address_line1")
    .eq("id", buildingId)
    .eq("company_id", companyId)
    .single()

  if (!building) notFound()

  // 2. Load active onboarding config (if any)
  const { data: config } = await supabase
    .from("erp_onboarding_configs")
    .select("*")
    .eq("building_id", buildingId)
    .eq("company_id", companyId)
    .not("status", "in", '("completed","cancelled")')
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  // 3. Load task instances if a config exists
  let tasks: ErpOnboardingTaskInstance[] = []
  if (config?.id) {
    const { data: taskRows } = await supabase
      .from("erp_onboarding_task_instances")
      .select("*")
      .eq("config_id", config.id)
      .order("display_order", { ascending: true })
    tasks = (taskRows ?? []) as ErpOnboardingTaskInstance[]
  }

  // 4. Load approved suppliers for this company (for assignment dropdowns)
  const { data: suppliers } = await supabase
    .from("erp_md_suppliers")
    .select("id, name, supplier_kind")
    .eq("company_id", companyId)
    .in("qualification_status", ["APPROVED", "PREFERRED"])
    .order("name", { ascending: true })

  return (
    <OnboardingWizard
      building={{ id: building.id, name: building.name, city: building.city ?? "" }}
      initialConfig={(config as ErpOnboardingConfig | null) ?? null}
      initialTasks={tasks}
      suppliers={(suppliers ?? []) as { id: string; name: string; supplier_kind: string }[]}
    />
  )
}
