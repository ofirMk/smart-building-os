"use server"

/**
 * Sprint T10 — Multi-Project Executive Portfolio Cockpit (server actions).
 *
 * Aggregates real data across every active project for one company:
 *   - Contract value (sum of erp_client_contracts.total_amount per project)
 *   - Revenue approved/billed (sum of approved/indexed amounts on
 *     erp_client_progress_bills, falling back to submitted amounts when no
 *     approval has occurred yet — matches the same waterfall used by the
 *     T6 AR-invoice trigger so the portfolio numbers tie out 1:1).
 *   - Costs approved (sum of erp_subcontractor_bills.grand_total_amount for
 *     bills in status APPROVED or PAID).
 *   - Gross margin (revenue − costs) and gross margin %.
 *   - Progress % (billed / contract_value, capped at 100%).
 *   - RAG health classification.
 *
 * All numbers come from production tables — no mocks, no synthetic fillers.
 * Projects with insufficient data return zeros and a NEUTRAL RAG so the UI
 * can render them gracefully.
 */

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectHealth = "GREEN" | "YELLOW" | "RED" | "NEUTRAL"

export interface PortfolioProjectRow {
  projectId: string
  projectNumber: string
  projectName: string
  status: string
  startDate: string | null
  endDate: string | null
  contractValue: number
  revenueApproved: number
  costsApproved: number
  grossMargin: number
  grossMarginPct: number
  progressPct: number
  health: ProjectHealth
}

export interface PortfolioKpis {
  totalPortfolioValue: number
  totalRevenueApproved: number
  totalCostsApproved: number
  totalGrossMargin: number
  avgGrossMarginPct: number
  activeProjectsCount: number
}

export interface PortfolioOverview {
  kpis: PortfolioKpis
  projects: PortfolioProjectRow[]
}

export type PortfolioOverviewResult =
  | { ok: true; overview: PortfolioOverview }
  | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function describeError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === "string" && err.length > 0) return err
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message
    if (typeof msg === "string" && msg.length > 0) return msg
  }
  return fallback
}

function pickNonZero(...values: Array<number | null | undefined>): number {
  for (const v of values) {
    const n = Number(v ?? 0)
    if (!Number.isNaN(n) && n !== 0) return n
  }
  return 0
}

function computeHealth(
  contractValue: number,
  revenue: number,
  costs: number,
): ProjectHealth {
  // No contract → not enough data to score.
  if (contractValue <= 0) return "NEUTRAL"

  // No revenue or costs yet → neutral (project just started, can't judge).
  if (revenue <= 0 && costs <= 0) return "NEUTRAL"

  // If costs are tracked but no revenue yet — under-billed → yellow.
  if (revenue <= 0 && costs > 0) return "YELLOW"

  const marginPct = revenue > 0 ? ((revenue - costs) / revenue) * 100 : 0

  if (marginPct < 5) return "RED"
  if (marginPct < 15) return "YELLOW"
  return "GREEN"
}

// ---------------------------------------------------------------------------
// Main aggregation
// ---------------------------------------------------------------------------

export async function fetchPortfolioOverviewAction(
  companyId: string,
): Promise<PortfolioOverviewResult> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data: userData, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userData.user) {
      return { ok: false, error: "Unauthorized" }
    }

    // 1. Active + draft + completed projects for the company. We include
    //    every status so the cockpit reflects the full ledger; the UI can
    //    filter visually if needed.
    const { data: projectsData, error: projectsErr } = await supabase
      .from("erp_proj_projects")
      .select("id, project_number, name, status, start_date, end_date")
      .eq("company_id", companyId)
      .order("name", { ascending: true })

    if (projectsErr) {
      return {
        ok: false,
        error: describeError(projectsErr, "טעינת פרויקטים נכשלה"),
      }
    }

    const projects = projectsData ?? []
    if (projects.length === 0) {
      return {
        ok: true,
        overview: {
          kpis: {
            totalPortfolioValue: 0,
            totalRevenueApproved: 0,
            totalCostsApproved: 0,
            totalGrossMargin: 0,
            avgGrossMarginPct: 0,
            activeProjectsCount: 0,
          },
          projects: [],
        },
      }
    }

    const projectIds = projects.map((p) => p.id as string)

    // 2. Pull in parallel: client contracts, client progress bills,
    //    subcontractor bills. All filtered by company + project IN (...) so
    //    we issue 3 queries total rather than 3*N.
    const [contractsRes, billsRes, subBillsRes] = await Promise.all([
      supabase
        .from("erp_client_contracts")
        .select("project_id, total_amount, status")
        .eq("company_id", companyId)
        .in("project_id", projectIds),
      supabase
        .from("erp_client_progress_bills")
        .select(
          "client_contract_id, status, indexed_approved_amount, approved_total_amount, indexed_submitted_amount, submitted_total_amount",
        )
        .eq("company_id", companyId),
      supabase
        .from("erp_subcontractor_bills")
        .select("project_id, status, grand_total_amount, amount_to_pay, cumulative_net_amount")
        .eq("company_id", companyId)
        .in("project_id", projectIds),
    ])

    if (contractsRes.error) {
      return {
        ok: false,
        error: describeError(contractsRes.error, "טעינת חוזי לקוח נכשלה"),
      }
    }
    if (billsRes.error) {
      return {
        ok: false,
        error: describeError(billsRes.error, "טעינת חשבונות חלקיים נכשלה"),
      }
    }
    if (subBillsRes.error) {
      return {
        ok: false,
        error: describeError(subBillsRes.error, "טעינת חשבונות קבלן נכשלה"),
      }
    }

    // 3. Build a contract → project map so we can attribute progress bills
    //    to the correct project_id.
    const contractToProject = new Map<string, string>()
    const contractValueByProject = new Map<string, number>()

    for (const c of contractsRes.data ?? []) {
      const cid = (c as { id?: string }).id
      const pid = (c as { project_id?: string }).project_id
      const total = Number((c as { total_amount?: number }).total_amount ?? 0)
      if (pid) {
        contractValueByProject.set(
          pid,
          (contractValueByProject.get(pid) ?? 0) + (Number.isFinite(total) ? total : 0),
        )
      }
      // We didn't actually select c.id above; reselect cheaper: store a
      // contract_id -> project map by re-querying the row identifier.
      // → fall through; we'll patch this below by ALSO fetching id.
      void cid
    }

    // We need contract_id on each row to map progress bills correctly.
    // The previous select didn't include `id`; re-fetch the id+project_id
    // mapping (light query: 2 columns).
    const { data: contractIdMapData, error: contractIdMapErr } = await supabase
      .from("erp_client_contracts")
      .select("id, project_id")
      .eq("company_id", companyId)
      .in("project_id", projectIds)

    if (contractIdMapErr) {
      return {
        ok: false,
        error: describeError(contractIdMapErr, "מיפוי חוזי לקוח נכשל"),
      }
    }

    for (const row of contractIdMapData ?? []) {
      const cid = (row as { id?: string }).id
      const pid = (row as { project_id?: string }).project_id
      if (cid && pid) contractToProject.set(cid, pid)
    }

    // 4. Aggregate revenue per project from progress bills using the same
    //    waterfall the T6 AR-invoice trigger uses.
    const revenueByProject = new Map<string, number>()
    for (const b of billsRes.data ?? []) {
      const cid = (b as { client_contract_id?: string }).client_contract_id
      if (!cid) continue
      const pid = contractToProject.get(cid)
      if (!pid) continue
      const status = String((b as { status?: string }).status ?? "")
      // Only count bills that contributed to billable revenue. APPROVED and
      // PARTIALLY_APPROVED are both real obligations recognised in the
      // ledger; SUBMITTED is forward-looking. For the executive view we
      // include APPROVED + PARTIALLY_APPROVED only (recognised revenue).
      if (status !== "APPROVED" && status !== "PARTIALLY_APPROVED") continue
      const amount = pickNonZero(
        (b as { indexed_approved_amount?: number }).indexed_approved_amount,
        (b as { approved_total_amount?: number }).approved_total_amount,
        (b as { indexed_submitted_amount?: number }).indexed_submitted_amount,
        (b as { submitted_total_amount?: number }).submitted_total_amount,
      )
      if (amount <= 0) continue
      revenueByProject.set(pid, (revenueByProject.get(pid) ?? 0) + amount)
    }

    // 5. Aggregate costs per project from subcontractor bills.
    const costsByProject = new Map<string, number>()
    for (const sb of subBillsRes.data ?? []) {
      const pid = (sb as { project_id?: string }).project_id
      if (!pid) continue
      const status = String((sb as { status?: string }).status ?? "")
      if (status !== "APPROVED" && status !== "PAID") continue
      const amount = pickNonZero(
        (sb as { grand_total_amount?: number }).grand_total_amount,
        (sb as { amount_to_pay?: number }).amount_to_pay,
        (sb as { cumulative_net_amount?: number }).cumulative_net_amount,
      )
      if (amount <= 0) continue
      costsByProject.set(pid, (costsByProject.get(pid) ?? 0) + amount)
    }

    // 6. Materialize per-project rows.
    const projectRows: PortfolioProjectRow[] = projects.map((p) => {
      const pid = p.id as string
      const contractValue = contractValueByProject.get(pid) ?? 0
      const revenue = revenueByProject.get(pid) ?? 0
      const costs = costsByProject.get(pid) ?? 0
      const grossMargin = revenue - costs
      const grossMarginPct = revenue > 0 ? (grossMargin / revenue) * 100 : 0
      const progressPct =
        contractValue > 0 ? Math.min(100, (revenue / contractValue) * 100) : 0
      return {
        projectId: pid,
        projectNumber: String((p as { project_number?: string }).project_number ?? ""),
        projectName: String((p as { name?: string }).name ?? ""),
        status: String((p as { status?: string }).status ?? "DRAFT"),
        startDate: ((p as { start_date?: string | null }).start_date ?? null),
        endDate: ((p as { end_date?: string | null }).end_date ?? null),
        contractValue: Math.round(contractValue * 100) / 100,
        revenueApproved: Math.round(revenue * 100) / 100,
        costsApproved: Math.round(costs * 100) / 100,
        grossMargin: Math.round(grossMargin * 100) / 100,
        grossMarginPct: Math.round(grossMarginPct * 10) / 10,
        progressPct: Math.round(progressPct * 10) / 10,
        health: computeHealth(contractValue, revenue, costs),
      }
    })

    // 7. Roll up portfolio KPIs.
    const totalPortfolioValue = projectRows.reduce(
      (acc, r) => acc + r.contractValue,
      0,
    )
    const totalRevenueApproved = projectRows.reduce(
      (acc, r) => acc + r.revenueApproved,
      0,
    )
    const totalCostsApproved = projectRows.reduce(
      (acc, r) => acc + r.costsApproved,
      0,
    )
    const totalGrossMargin = totalRevenueApproved - totalCostsApproved

    // Avg margin % is a revenue-weighted average (more meaningful than a
    // simple mean of project margin %).
    const avgGrossMarginPct =
      totalRevenueApproved > 0
        ? (totalGrossMargin / totalRevenueApproved) * 100
        : 0

    const activeProjectsCount = projectRows.filter(
      (r) => r.status === "ACTIVE",
    ).length

    return {
      ok: true,
      overview: {
        kpis: {
          totalPortfolioValue: Math.round(totalPortfolioValue * 100) / 100,
          totalRevenueApproved: Math.round(totalRevenueApproved * 100) / 100,
          totalCostsApproved: Math.round(totalCostsApproved * 100) / 100,
          totalGrossMargin: Math.round(totalGrossMargin * 100) / 100,
          avgGrossMarginPct: Math.round(avgGrossMarginPct * 10) / 10,
          activeProjectsCount,
        },
        projects: projectRows,
      },
    }
  } catch (err) {
    return {
      ok: false,
      error: describeError(err, "שגיאה לא צפויה בטעינת הפורטפוליו"),
    }
  }
}
