/**
 * Phase 14 — Approval Matrix Setup Page
 * /procurement/setup/approval-matrix
 *
 * Server page: fetches initial rules list, renders the client component.
 */

import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { COMPANY_COOKIE_KEY } from "@/lib/company-context"
import { ApprovalMatrixClient } from "@/components/erp/procurement/approval-matrix-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function ApprovalMatrixSetupPage() {
  const cookieStore = await cookies()
  const activeCompanyId = cookieStore.get(COMPANY_COOKIE_KEY)?.value ?? null

  let initialRules: unknown[] = []

  if (activeCompanyId) {
    const supabase = await createClient()
    const { data } = await supabase
      .from("erp_approval_matrix_rules")
      .select(
        "id, rule_name, description, priority_order, is_active, condition_json, approval_levels_json, updated_at"
      )
      .eq("company_id", activeCompanyId)
      .order("priority_order", { ascending: true })

    initialRules = data ?? []
  }

  return <ApprovalMatrixClient initialRules={initialRules} />
}
