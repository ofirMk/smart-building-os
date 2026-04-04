import "server-only"

import { roundMoney } from "@/lib/marker-ofek/partial-account-calc"
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  allocateCorporateOverheadPool,
  fetchProjectOverheadPolicies,
  type ProjectAllocationInput,
  type ProjectLoadingMethod,
} from "@/lib/marker-ofek/finance-allocation-engine"

type MinimalSupabase = Pick<SupabaseClient, "from">

export type OverheadAllocationMethod = "revenue_pct" | "labor_hours" | "per_project"

type ProjectLoadingInputRow = {
  projectId: string
  revenueNis: number
  laborDays: number
}

function normalizeAllocationMethod(raw: string | null | undefined): "revenue_pct" | "labor_hours" {
  const s = String(raw ?? "").trim().toLowerCase()
  return s === "labor_hours" ? "labor_hours" : "revenue_pct"
}

function globalToLoadingMethod(m: "revenue_pct" | "labor_hours"): ProjectLoadingMethod {
  return m === "labor_hours" ? "labor_based" : "revenue_based"
}

/**
 * @deprecated Use `allocateCorporateOverheadPool` from finance-allocation-engine for mixed methods.
 * נשמר לתאימות בדיקות ישנות.
 */
export function calculateProjectLoading(input: {
  method: "revenue_pct" | "labor_hours"
  totalOverheadNis: number
  projects: ProjectLoadingInputRow[]
}): Map<string, number> {
  const list = input.projects.filter((p) => p.projectId)
  const mapped: ProjectAllocationInput[] = list.map((p) => ({
    projectId: p.projectId,
    method: input.method === "labor_hours" ? "labor_based" : "revenue_based",
    revenueNis: Math.max(0, p.revenueNis),
    laborHours: Math.max(0, p.laborDays),
    fixedRatePercent: 0,
  }))
  return allocateCorporateOverheadPool(input.totalOverheadNis, mapped)
}

export async function loadCorporateOverheadAllocations(
  supabase: MinimalSupabase,
  partnerRows: Array<{ projectId: string; totalClientInvoices: number }>,
  laborDaysByProject: Map<string, number>
): Promise<{
  method: OverheadAllocationMethod
  totalPoolNis: number
  byProject: Map<string, number>
}> {
  const { data: cp } = await supabase
    .from("company_profile")
    .select("overhead_allocation_method")
    .limit(1)
    .maybeSingle()

  const globalMethod = normalizeAllocationMethod(
    (cp as { overhead_allocation_method?: string } | null)?.overhead_allocation_method
  )

  const today = new Date().toISOString().slice(0, 10)

  const { data: items, error } = await supabase
    .from("mo_overhead_registry")
    .select("monthly_amount_nis, effective_from, effective_to, is_active")
    .eq("is_active", true)

  if (error) {
    return {
      method: globalMethod,
      totalPoolNis: 0,
      byProject: new Map(),
    }
  }

  let totalPool = 0
  for (const row of items ?? []) {
    const r = row as {
      monthly_amount_nis?: number
      effective_from?: string
      effective_to?: string | null
    }
    const from = String(r.effective_from ?? "").slice(0, 10)
    const toRaw = r.effective_to
    const to = toRaw ? String(toRaw).slice(0, 10) : null
    if (from && today < from) continue
    if (to && today > to) continue
    totalPool += Number(r.monthly_amount_nis ?? 0) || 0
  }
  totalPool = roundMoney(totalPool)

  const projectIds = partnerRows.map((r) => r.projectId)
  const policies = await fetchProjectOverheadPolicies(supabase, projectIds)

  const defaultMethod = globalToLoadingMethod(globalMethod)

  const allocInputs: ProjectAllocationInput[] = partnerRows.map((r) => {
    const pol = policies.get(r.projectId)
    return {
      projectId: r.projectId,
      method: pol?.method ?? defaultMethod,
      revenueNis: Math.max(0, r.totalClientInvoices),
      laborHours: Math.max(0, laborDaysByProject.get(r.projectId) ?? 0),
      fixedRatePercent: Math.max(0, pol?.fixedRatePercent ?? 0),
    }
  })

  const byProject = allocateCorporateOverheadPool(totalPool, allocInputs)

  const methodSet = new Set(allocInputs.map((x) => x.method))
  const hasPerProjectPolicy = policies.size > 0
  const displayMethod: OverheadAllocationMethod =
    hasPerProjectPolicy || methodSet.size > 1 ? "per_project" : globalMethod

  return { method: displayMethod, totalPoolNis: totalPool, byProject }
}

export function overheadAllocationMethodLabel(m: OverheadAllocationMethod): string {
  if (m === "per_project") return "לפי פרויקט (מדיניות מעורבת)"
  return m === "labor_hours" ? "ימי עבודה (גאנט)" : "% מהכנסה מוכרת"
}
