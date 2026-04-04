import type { SupabaseClient } from "@supabase/supabase-js"

import { roundMoney } from "@/lib/marker-ofek/partial-account-calc"

export type ProjectLoadingMethod = "revenue_based" | "labor_based" | "fixed_rate"

export type ProjectAllocationInput = {
  projectId: string
  method: ProjectLoadingMethod
  revenueNis: number
  laborHours: number
  fixedRatePercent: number
}

export type ProjectLoadingBreakdown = {
  projectId: string
  method: ProjectLoadingMethod
  corporateOverheadAllocatedNis: number
  revenueNis: number
  laborHours: number
  fixedRatePercent: number
}

/**
 * מדיניות העמסה (V1): פרויקטים ב־fixed_rate מקבלים אחוז מסך העומס;
 * השאר מחולק לפי הכנסה מוכרת, אלא אם כולם labor_based — אז לפי שעות/ימים (משקל).
 */
export function allocateCorporateOverheadPool(
  poolTotalNis: number,
  projects: ProjectAllocationInput[]
): Map<string, number> {
  const pool = Math.max(0, roundMoney(poolTotalNis))
  const out = new Map<string, number>()
  if (projects.length === 0 || pool <= 0) return out

  for (const p of projects) {
    out.set(p.projectId, 0)
  }

  const fixed = projects.filter((p) => p.method === "fixed_rate")
  const nonFixed = projects.filter((p) => p.method !== "fixed_rate")

  const fixedSumPctRaw = fixed.reduce((s, p) => s + Math.max(0, p.fixedRatePercent), 0)
  if (fixedSumPctRaw > 100 + 1e-9) {
    const scale = 100 / fixedSumPctRaw
    for (const p of fixed) {
      const scaled = roundMoney(p.fixedRatePercent * scale)
      const assigned = roundMoney((pool * scaled) / 100)
      out.set(p.projectId, (out.get(p.projectId) ?? 0) + assigned)
    }
  } else {
    for (const p of fixed) {
      const pct = Math.max(0, p.fixedRatePercent)
      const assigned = roundMoney((pool * pct) / 100)
      out.set(p.projectId, (out.get(p.projectId) ?? 0) + assigned)
    }
  }

  let fixedTotal = 0
  for (const p of fixed) {
    fixedTotal += out.get(p.projectId) ?? 0
  }
  fixedTotal = roundMoney(fixedTotal)
  const remainder = roundMoney(Math.max(0, pool - fixedTotal))

  if (nonFixed.length === 0) {
    if (remainder > 0 && fixed.length > 0) {
      const wsum = fixed.reduce((s, p) => s + Math.max(0, p.fixedRatePercent), 0) || 1
      for (const p of fixed) {
        const w = Math.max(0, p.fixedRatePercent)
        const share = w / wsum
        const add = roundMoney(remainder * share)
        out.set(p.projectId, roundMoney((out.get(p.projectId) ?? 0) + add))
      }
    }
    return normalizeRoundingDrift(out, pool)
  }

  const allLabor =
    nonFixed.length > 0 && nonFixed.every((p) => p.method === "labor_based")

  let denom = 0
  const weights = new Map<string, number>()
  for (const p of nonFixed) {
    const w = allLabor ? Math.max(0, p.laborHours) : Math.max(0, p.revenueNis)
    const ww = w > 0 ? w : 1e-6
    weights.set(p.projectId, ww)
    denom += ww
  }
  denom = roundMoney(denom)

  for (const p of nonFixed) {
    const w = weights.get(p.projectId) ?? 1e-6
    const share = denom > 0 ? w / denom : 1 / nonFixed.length
    const add = roundMoney(remainder * share)
    out.set(p.projectId, roundMoney((out.get(p.projectId) ?? 0) + add))
  }

  return normalizeRoundingDrift(out, pool)
}

function normalizeRoundingDrift(
  m: Map<string, number>,
  targetPool: number
): Map<string, number> {
  let sum = 0
  for (const v of m.values()) sum += v
  sum = roundMoney(sum)
  const drift = roundMoney(targetPool - sum)
  if (Math.abs(drift) < 0.02) return m
  const keys = [...m.keys()]
  if (keys.length === 0) return m
  const k = keys[0]!
  m.set(k, roundMoney((m.get(k) ?? 0) + drift))
  return m
}

export async function fetchLaborHoursByProject(
  supabase: Pick<SupabaseClient, "from">,
  projectIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  for (const id of projectIds) out.set(id, 0)
  if (projectIds.length === 0) return out

  const { data: dm, error: dmErr } = await supabase
    .from("daily_manpower")
    .select("hours, project_daily_logs!inner(project_id)")
    .in("project_daily_logs.project_id", projectIds)

  if (!dmErr && dm && dm.length > 0) {
    for (const row of dm) {
      const r = row as {
        hours?: number | string
        project_daily_logs?: { project_id?: string } | { project_id?: string }[]
      }
      const embed = r.project_daily_logs
      const pid = Array.isArray(embed)
        ? embed[0]?.project_id
        : embed?.project_id
      if (!pid) continue
      const h = Number(r.hours ?? 0)
      if (!Number.isFinite(h) || h <= 0) continue
      out.set(pid, roundMoney((out.get(pid) ?? 0) + h))
    }
    return out
  }

  const { data: logs, error: logErr } = await supabase
    .from("project_daily_logs")
    .select("project_id, crew_count")
    .in("project_id", projectIds)

  if (logErr) throw new Error(logErr.message)
  for (const row of logs ?? []) {
    const pid = (row as { project_id?: string }).project_id
    if (!pid) continue
    const c = Number((row as { crew_count?: number }).crew_count ?? 0)
    if (!Number.isFinite(c) || c <= 0) continue
    out.set(pid, (out.get(pid) ?? 0) + c * 8)
  }
  for (const id of projectIds) {
    out.set(id, roundMoney(out.get(id) ?? 0))
  }
  return out
}

export async function fetchProjectOverheadPolicies(
  supabase: Pick<SupabaseClient, "from">,
  projectIds: string[]
): Promise<Map<string, { method: ProjectLoadingMethod; fixedRatePercent: number }>> {
  const out = new Map<
    string,
    { method: ProjectLoadingMethod; fixedRatePercent: number }
  >()
  if (projectIds.length === 0) return out

  const { data, error } = await supabase
    .from("project_overhead_allocation")
    .select("project_id, method, fixed_rate_percent")
    .in("project_id", projectIds)

  if (error) {
    if (/does not exist|relation/i.test(error.message)) return out
    throw new Error(error.message)
  }
  for (const r of data ?? []) {
    const row = r as {
      project_id: string
      method: string
      fixed_rate_percent: number | string
    }
    const m = row.method as ProjectLoadingMethod
    if (
      m === "revenue_based" ||
      m === "labor_based" ||
      m === "fixed_rate"
    ) {
      out.set(row.project_id, {
        method: m,
        fixedRatePercent: Number(row.fixed_rate_percent ?? 0),
      })
    }
  }
  return out
}

export type CalculateProjectLoadingResult = {
  projectId: string
  methodUsed: ProjectLoadingMethod
  poolTotalNis: number
  corporateOverheadAllocatedNis: number
  peersInScope: number
}

/**
 * שירות העמסה: חלוקת סך עקיפות (`poolTotalNis`) על `projectId` מול עמיתים,
 * לפי מדיניות פרויקט או עקיפת method.
 */
export async function calculateProjectLoading(
  supabase: Pick<SupabaseClient, "from">,
  projectId: string,
  options: {
    poolTotalNis: number
    method?: ProjectLoadingMethod
    peerProjectIds: string[]
    revenueByProject: Map<string, number>
    /** משקל עבודה (ימי גאנט או שעות יומן) */
    laborWeightByProject: Map<string, number>
  }
): Promise<CalculateProjectLoadingResult> {
  const peers = [...new Set([projectId, ...options.peerProjectIds])]
  const policies = await fetchProjectOverheadPolicies(supabase, peers)

  const projects: ProjectAllocationInput[] = peers.map((pid) => {
    const pol = policies.get(pid)
    const method =
      pid === projectId && options.method
        ? options.method
        : pol?.method ?? "revenue_based"
    return {
      projectId: pid,
      method,
      revenueNis: Math.max(0, options.revenueByProject.get(pid) ?? 0),
      laborHours: Math.max(0, options.laborWeightByProject.get(pid) ?? 0),
      fixedRatePercent: Math.max(0, pol?.fixedRatePercent ?? 0),
    }
  })

  const alloc = allocateCorporateOverheadPool(options.poolTotalNis, projects)
  return {
    projectId,
    methodUsed:
      options.method ??
      policies.get(projectId)?.method ??
      "revenue_based",
    poolTotalNis: roundMoney(options.poolTotalNis),
    corporateOverheadAllocatedNis: roundMoney(alloc.get(projectId) ?? 0),
    peersInScope: peers.length,
  }
}

export async function buildCorporateLoadingBreakdown(
  supabase: Pick<SupabaseClient, "from">,
  peers: ProjectAllocationInput[],
  poolTotalNis: number
): Promise<{
  poolTotalNis: number
  byProject: Map<string, number>
  breakdown: ProjectLoadingBreakdown[]
}> {
  const poolTotal = roundMoney(poolTotalNis)
  const byProject = allocateCorporateOverheadPool(poolTotal, peers)
  const breakdown: ProjectLoadingBreakdown[] = peers.map((p) => ({
    projectId: p.projectId,
    method: p.method,
    corporateOverheadAllocatedNis: roundMoney(byProject.get(p.projectId) ?? 0),
    revenueNis: p.revenueNis,
    laborHours: p.laborHours,
    fixedRatePercent: p.fixedRatePercent,
  }))
  return { poolTotalNis: poolTotal, byProject, breakdown }
}
