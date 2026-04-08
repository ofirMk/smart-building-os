import "server-only"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export type HoldenCommandCenterKpis = {
  activeExecutionProjects: number
  pendingPartialAccountsApproval: number
  arNetFromGl: number
  apNetFromGl: number
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * מדדי Holden Command Center — פרויקטים בביצוע (עם WBS), חשבונות ממתינים, מאזני GL גסים לפי קידומת חשבון.
 */
export async function getHoldenCommandCenterKpis(): Promise<HoldenCommandCenterKpis> {
  const supabase = await createSupabaseServerAuthClient()

  const { data: wbsProjects } = await supabase.from("erp_project_wbs").select("project_id")
  const projectIds = [...new Set((wbsProjects ?? []).map((r) => (r as { project_id: string }).project_id))]

  let activeExecutionProjects = 0
  if (projectIds.length) {
    const { count } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("is_deleted", false)
      .eq("status", "active")
      .in("id", projectIds)
    activeExecutionProjects = typeof count === "number" ? count : 0
  }

  const { count: pendCount } = await supabase
    .from("partial_accounts")
    .select("id", { count: "exact", head: true })
    .eq("is_deleted", false)
    .eq("status", "submitted")

  const { data: lineRows, error: lineErr } = await supabase
    .from("gl_journal_lines")
    .select("debit_amount, credit_amount, account_id")

  let arNetFromGl = 0
  let apNetFromGl = 0

  if (!lineErr && lineRows?.length) {
    const accountIds = [
      ...new Set(
        (lineRows as { account_id: string }[]).map((r) => r.account_id).filter(Boolean)
      ),
    ]
    const { data: accRows } = await supabase
      .from("gl_accounts")
      .select("id, account_code")
      .in("id", accountIds)

    const codeById = new Map(
      (accRows as { id: string; account_code: string }[] | null)?.map((a) => [
        a.id,
        a.account_code,
      ]) ?? []
    )

    for (const row of lineRows as {
      debit_amount: number
      credit_amount: number
      account_id: string
    }[]) {
      const code = String(codeById.get(row.account_id) ?? "").trim()
      const d = Number(row.debit_amount) || 0
      const c = Number(row.credit_amount) || 0
      if (code.startsWith("12")) {
        arNetFromGl += d - c
      }
      if (code.startsWith("20")) {
        apNetFromGl += c - d
      }
    }
  }

  return {
    activeExecutionProjects,
    pendingPartialAccountsApproval: typeof pendCount === "number" ? pendCount : 0,
    arNetFromGl: roundMoney(arNetFromGl),
    apNetFromGl: roundMoney(apNetFromGl),
  }
}
