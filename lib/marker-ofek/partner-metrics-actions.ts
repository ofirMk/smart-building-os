"use server"

import { revalidatePath } from "next/cache"
import { format } from "date-fns"

import { GUY_RAHUMIM_ADMIN_EMAIL } from "@/lib/auth/user-role"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import {
  type PartnerMetricsPersona,
  canViewHoldingExecutive,
  resolvePartnerMetricsPersona,
} from "@/lib/marker-ofek/partner-metrics/access"
import {
  compareProfitCenterBrand,
  inferProfitCenterBrand,
  profitCenterLabel as formatProfitCenterLabel,
  type ProfitCenterBrand,
} from "@/lib/marker-ofek/holding-profit-center-tags"
import { resolveManagingPartnerScope } from "@/lib/marker-ofek/effective-managing-partner-scope"
import { poRowCountsTowardCommittedSpend } from "@/lib/marker-ofek/procurement/po-cost-policy"
import { readPartnerCostField } from "@/lib/marker-ofek/partner-project-costs"
import { roundMoney } from "@/lib/marker-ofek/partial-account-calc"
import {
  computeGanttLaborCostByProjectId,
  computeGanttLaborDaysByProjectId,
} from "@/lib/marker-ofek/partner-metrics/gantt-labor-cost"
import {
  loadCorporateOverheadAllocations,
  overheadAllocationMethodLabel,
  type OverheadAllocationMethod,
} from "@/lib/marker-ofek/project-overhead-loading"
import type { AppUserRole } from "@/lib/auth/user-role"
import { formatError } from "@/lib/utils"

const BONUS_RATE = 0.25

type ProjectMetricsSourceRow = {
  id: string
  name: string | null
  internal_project_code: string | null
  managing_partner_id: string | null
  partner_cost_subcontractors: number | null
  partner_cost_employee_salaries: number | null
  partner_cost_petty_cash: number | null
  partner_cost_site_overhead: number | null
}

export type PartnerProjectRow = {
  projectId: string
  name: string
  code: string
  managingPartnerId: string | null
  managingPartnerLabel: string
  totalClientInvoices: number
  subconCosts: number
  /**
   * Hybrid: `partner_cost_employee_salaries` when positive (manual), else Gantt labor.
   */
  employeeSalaries: number
  /** Manual DB override active for salaries (`partner_cost_employee_salaries` positive). */
  employeeSalariesIsManual: boolean
  pettyCash: number
  siteOverhead: number
  procurementOrders: number
  totalCostBuckets: number
  profit: number
  /** Net_Profit × 0.25 */
  managementFeeDue: number
  marginPercent: number | null
}

export type PendingProcurementRow = {
  id: string
  poNumber: string
  totalAmount: number
  status: string
  projectId: string
  projectName: string
  projectCode: string
  supplierName: string
}

export type PartnerOption = {
  id: string
  label: string
}

export type PartnerMetricsPayload = {
  persona: PartnerMetricsPersona
  userId: string
  totalManagedProfit: number
  managementBonus: number
  projects: PartnerProjectRow[]
  partnerOptions: PartnerOption[]
  pendingProcurement: PendingProcurementRow[]
}

function sumInvoicesByProject(
  rows: { project_id: string; grand_total: number }[] | null
): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows ?? []) {
    const pid = r.project_id
    m.set(pid, (m.get(pid) ?? 0) + Number(r.grand_total ?? 0))
  }
  return m
}

/** Approved partial accounts without a linked client invoice (avoids double-count with mo_invoices). */
function sumApprovedPartialsNotInvoicedByProject(
  partialRows: { id: string; payment_due: number; contract_id: string; project_id: string | null }[] | null,
  contractProjectById: Map<string, string>,
  linkedPartialIds: Set<string>
): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of partialRows ?? []) {
    if (linkedPartialIds.has(r.id)) continue
    const pid =
      (r.project_id && String(r.project_id).trim() !== "" ? r.project_id : null) ??
      contractProjectById.get(r.contract_id)
    if (!pid) continue
    m.set(pid, (m.get(pid) ?? 0) + Number(r.payment_due ?? 0))
  }
  return m
}

async function buildPartnerProjectRows(
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>,
  projectList: ProjectMetricsSourceRow[]
): Promise<{ rows: PartnerProjectRow[]; pendingPo: unknown[] }> {
  const projectIds = projectList.map((p) => p.id as string)
  if (projectIds.length === 0) {
    return { rows: [], pendingPo: [] }
  }

  const laborByProject = await computeGanttLaborCostByProjectId(supabase, projectIds)

  const { data: contractProjRows } = await supabase
    .from("contracts")
    .select("id, project_id")
    .in("project_id", projectIds)
    .eq("is_deleted", false)

  const contractProjectById = new Map<string, string>()
  const contractIds: string[] = []
  for (const c of contractProjRows ?? []) {
    const cid = (c as { id: string }).id
    const pid = (c as { project_id: string }).project_id
    contractProjectById.set(cid, pid)
    contractIds.push(cid)
  }

  const partialQuery =
    contractIds.length > 0
      ? supabase
          .from("partial_accounts")
          .select("id, payment_due, contract_id, project_id")
          .in("contract_id", contractIds)
          .eq("status", "approved")
          .eq("is_deleted", false)
      : Promise.resolve({ data: [] as unknown[], error: null })

  const [{ data: invRows }, { data: poRows }, { data: pendingPo }, { data: paRows }, { data: invPartialLinks }] =
    await Promise.all([
      supabase
        .from("mo_invoices")
        .select("project_id, grand_total, status")
        .in("project_id", projectIds)
        .in("status", ["approved", "paid"]),
      supabase
        .from("purchase_orders")
        .select("project_id, total_amount, status, is_ceo_approved")
        .in("project_id", projectIds)
        .eq("is_deleted", false),
      supabase
        .from("purchase_orders")
        .select("id, po_number, total_amount, status, project_id, supplier_id")
        .in("project_id", projectIds)
        .eq("is_deleted", false)
        .eq("status", "pending_ceo_approval"),
      partialQuery,
      supabase
        .from("mo_invoices")
        .select("linked_partial_account_id")
        .in("project_id", projectIds)
        .not("linked_partial_account_id", "is", null),
    ])

  const linkedPartialIds = new Set<string>()
  for (const row of invPartialLinks ?? []) {
    const id = (row as { linked_partial_account_id: string | null }).linked_partial_account_id
    if (id) linkedPartialIds.add(id)
  }

  const partialExtraByProject = sumApprovedPartialsNotInvoicedByProject(
    paRows as {
      id: string
      payment_due: number
      contract_id: string
      project_id: string | null
    }[] | null,
    contractProjectById,
    linkedPartialIds
  )

  const invByProject = sumInvoicesByProject(
    invRows as { project_id: string; grand_total: number }[] | null
  )

  const procurementByProject = new Map<string, number>()
  for (const r of poRows ?? []) {
    const row = r as {
      project_id: string
      total_amount: number
      status: string
      is_ceo_approved?: boolean | null
    }
    if (!poRowCountsTowardCommittedSpend(row)) continue
    const pid = row.project_id
    procurementByProject.set(
      pid,
      (procurementByProject.get(pid) ?? 0) + Number(row.total_amount ?? 0)
    )
  }

  const rows: PartnerProjectRow[] = projectList.map((p) => {
    const raw = p as unknown as Record<string, unknown>
    const pid = p.id as string
    const clientInv =
      (invByProject.get(pid) ?? 0) + (partialExtraByProject.get(pid) ?? 0)
    const sub = readPartnerCostField(raw, "partner_cost_subcontractors")
    const manualSal = readPartnerCostField(raw, "partner_cost_employee_salaries")
    const ganttSal = laborByProject.get(pid) ?? 0
    const employeeSalariesIsManual = manualSal > 0
    const sal = employeeSalariesIsManual ? manualSal : ganttSal
    const petty = readPartnerCostField(raw, "partner_cost_petty_cash")
    const oh = readPartnerCostField(raw, "partner_cost_site_overhead")
    const proc = procurementByProject.get(pid) ?? 0
    const totalCosts = sub + sal + petty + oh + proc
    const profit = clientInv - totalCosts
    const marginPercent =
      clientInv > 0 ? Math.round((profit / clientInv) * 1000) / 10 : null
    return {
      projectId: pid,
      name: String(p.name ?? ""),
      code: String(p.internal_project_code ?? ""),
      managingPartnerId: (p.managing_partner_id as string | null) ?? null,
      managingPartnerLabel: "",
      totalClientInvoices: clientInv,
      subconCosts: sub,
      employeeSalaries: sal,
      employeeSalariesIsManual,
      pettyCash: petty,
      siteOverhead: oh,
      procurementOrders: proc,
      totalCostBuckets: totalCosts,
      profit,
      managementFeeDue: profit * BONUS_RATE,
      marginPercent,
    }
  })

  const partnerIds = [...new Set(rows.map((r) => r.managingPartnerId).filter(Boolean))] as string[]
  const labelById = new Map<string, string>()
  if (partnerIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", partnerIds)
    for (const pr of profs ?? []) {
      const id = pr.id as string
      const fn = (pr.full_name as string | null)?.trim()
      labelById.set(id, fn || id.slice(0, 8))
    }
  }
  for (const r of rows) {
    r.managingPartnerLabel = r.managingPartnerId
      ? labelById.get(r.managingPartnerId) ?? r.managingPartnerId.slice(0, 8)
      : "—"
  }

  return { rows, pendingPo: pendingPo ?? [] }
}

/**
 * Partner Profit Center — V1 formula:
 * Total_Profit = Income − (Subcontractors + Salaries + PettyCash + Overhead + Procurement),
 * where Income = sum(`mo_invoices.grand_total`) for status ∈ {approved, paid}
 * plus approved `partial_accounts.payment_due` when no `mo_invoices.linked_partial_account_id` points at that partial;
 * Salaries = manual `partner_cost_employee_salaries` when positive, else Gantt labor;
 * Procurement = sum(PO totals) excluding draft / pending CEO / POs where `is_ceo_approved` is false.
 * Management fee = 25% × net profit per project (and portfolio roll-up).
 */
export async function getPartnerFinancials(params: {
  filterPartnerId: string | null
  /** When set, only this project (still subject to persona RBAC). */
  projectId?: string | null
}): Promise<{ ok: true; data: PartnerMetricsPayload } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id || !user.email) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const persona = resolvePartnerMetricsPersona(user.email)
    if (!persona) {
      return { ok: false, error: "אין הרשאה לדשבורד הנהלה בכירה" }
    }

    const scope = await resolveManagingPartnerScope(user.email, user.id)

    let projQuery = supabase
      .from("projects")
      .select(
        "id, name, internal_project_code, managing_partner_id, partner_cost_subcontractors, partner_cost_employee_salaries, partner_cost_petty_cash, partner_cost_site_overhead"
      )
      .eq("is_deleted", false)

    if (persona === "guy" || persona === "samer") {
      projQuery = projQuery.eq("managing_partner_id", user.id)
    } else if (persona === "ophir") {
      if (params.filterPartnerId) {
        projQuery = projQuery.eq("managing_partner_id", params.filterPartnerId)
      } else if (scope.effectiveManagingPartnerId) {
        projQuery = projQuery.eq("managing_partner_id", scope.effectiveManagingPartnerId)
      }
      // global / default: no managing_partner filter (include unassigned projects)
    }

    const singleId = params.projectId?.trim()
    if (singleId) {
      projQuery = projQuery.eq("id", singleId)
    }

    const { data: projects, error: pErr } = await projQuery
    if (pErr) throw pErr

    const projectList = projects ?? []
    const projectIds = projectList.map((p) => p.id as string)
    if (projectIds.length === 0) {
      const partnerOptions = await loadPartnerOptions(supabase, persona)
      return {
        ok: true,
        data: {
          persona,
          userId: user.id,
          totalManagedProfit: 0,
          managementBonus: 0,
          projects: [],
          partnerOptions,
          pendingProcurement: [],
        },
      }
    }

    const { rows, pendingPo } = await buildPartnerProjectRows(
      supabase,
      projectList as ProjectMetricsSourceRow[]
    )

    const totalManagedProfit = rows.reduce((s, r) => s + r.profit, 0)
    const managementBonus = totalManagedProfit * BONUS_RATE

    const partnerOptions = await loadPartnerOptions(supabase, persona)

    const projectMeta = new Map(
      projectList.map((p) => [
        p.id as string,
        { name: String(p.name ?? ""), code: String(p.internal_project_code ?? "") },
      ])
    )
    const supplierIds = [...new Set((pendingPo ?? []).map((x) => (x as { supplier_id: string }).supplier_id))]
    const supplierNameById = new Map<string, string>()
    if (supplierIds.length > 0) {
      const { data: ents } = await supabase.from("entities").select("id, name").in("id", supplierIds)
      for (const e of ents ?? []) {
        supplierNameById.set(e.id as string, String((e as { name: string }).name ?? ""))
      }
    }

    const pendingProcurement: PendingProcurementRow[] = (pendingPo ?? []).map((raw) => {
      const po = raw as {
        id: string
        po_number: string
        total_amount: number
        status: string
        project_id: string
        supplier_id: string
      }
      const meta = projectMeta.get(po.project_id)
      return {
        id: po.id,
        poNumber: po.po_number,
        totalAmount: Number(po.total_amount ?? 0),
        status: po.status,
        projectId: po.project_id,
        projectName: meta?.name ?? "",
        projectCode: meta?.code ?? "",
        supplierName: supplierNameById.get(po.supplier_id) ?? "",
      }
    })

    return {
      ok: true,
      data: {
        persona,
        userId: user.id,
        totalManagedProfit,
        managementBonus,
        projects: rows.sort((a, b) => a.code.localeCompare(b.code, "he")),
        partnerOptions,
        pendingProcurement,
      },
    }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export type ExecutiveProjectHealth = "ok" | "warn" | "risk"

export type HoldingExecutiveRow = {
  projectId: string
  name: string
  code: string
  profitCenterKey: ProfitCenterBrand
  /** Ir HaYin / Rainbow / — */
  profitCenterLabel: string
  contractValueNis: number
  completionPercent: number | null
  netMarginPercent: number | null
  recognizedBillingNis: number
  netProfitNis: number
  /** Same buckets as partner P&L (כולל רכש PO שאינו טיוטה). */
  totalCostNis: number
  /** רמת 1: הכנסה מוכרת פחות עלות ישירה (קבלנים + רכש + שכר). */
  grossProfitNis: number
  /** רמת 2: מנוע שותפים — רווח תפעולי לפני עקיפות חברה. */
  operatingProfitNis: number
  /** סכום מרישום העקיפות החודשי המוקצה לפרויקט. */
  allocatedCorporateOverheadNis: number
  /** רמת 2 מעמיסה: רווח נקי אחרי עקיפות חברה. */
  netLoadedProfitNis: number
  netLoadedMarginPercent: number | null
  overdueTaskCount: number
  healthStatus: ExecutiveProjectHealth
}

export type HoldingExecutiveDelayAlert = {
  projectId: string
  name: string
  code: string
  overdueTaskCount: number
}

function computeExecutiveProjectHealth(
  marginPercent: number | null,
  completionPercent: number | null,
  overdueTaskCount: number
): ExecutiveProjectHealth {
  if (overdueTaskCount >= 6) return "risk"
  if (overdueTaskCount >= 2) return "warn"
  if (marginPercent != null && marginPercent < 0) return "risk"
  if (marginPercent != null && marginPercent < 4) return "warn"
  if (
    completionPercent != null &&
    completionPercent > 93 &&
    marginPercent != null &&
    marginPercent < 10
  ) {
    return "warn"
  }
  return "ok"
}

function buildExecutiveInsightAlerts(params: {
  pendingPoApprovalNis: number
  recognizedRevenueNis: number
  totalDirectCostNis: number
  netProfitNis: number
  rows: HoldingExecutiveRow[]
  delayAlerts: HoldingExecutiveDelayAlert[]
}): string[] {
  const ils = new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  })
  const out: string[] = []
  if (params.pendingPoApprovalNis > 0) {
    out.push(
      `רכש: ${ils.format(params.pendingPoApprovalNis)} ממתינים לאישור מנכ״ל — עלול לחסום תזרים.`
    )
  }
  if (
    params.recognizedRevenueNis > 0 &&
    params.totalDirectCostNis >= params.recognizedRevenueNis * 0.9
  ) {
    out.push(
      "עלות מצטברת מתקרבת להכנסות מוכרות — בדקו הזמנות רכש וחריגים מאושרים."
    )
  }
  if (params.netProfitNis < 0) {
    out.push("רווח נקי פורטפוליו שלילי בטווח הנוכחי — נדרשת החלטת הנהלה.")
  }
  for (const r of params.rows.filter((x) => x.healthStatus === "risk").slice(0, 4)) {
    out.push(
      `פרויקט «${r.name}»: מצב סיכון (מרווח ${r.netMarginPercent != null ? `${r.netMarginPercent.toFixed(1)}%` : "—"}).`
    )
  }
  if (params.delayAlerts.length >= 3) {
    out.push(
      `${params.delayAlerts.length} פרויקטים עם משימות באיחור — עדכנו לו״ז בגאנט.`
    )
  }
  return out.slice(0, 10)
}

export type HoldingExecutivePayload = {
  /** Sum of active main_contract `total_amount` (portfolio). */
  totalPortfolioNis: number
  /** Sum of recognized client billing (invoices + partials) across scoped projects. */
  recognizedRevenueNis: number
  /** Partner P&L cost buckets (רכש + שכר + קבלנים וכו׳) — משקף שינויי PO מידית. */
  totalDirectCostNis: number
  /** רווח שטח: הכנסות מוכרות פחות עלות ישירה (לפני עומס הנהלה ארגוני). */
  netProfitNis: number
  /** רמת 1 מקונסלידציה: סה״כ רווח גולמי בפורטפוליו. */
  portfolioGrossProfitNis: number
  /** רמת 3: רווח אחרי הקצאת עקיפות חברה (נטו טעון). */
  portfolioNetLoadedProfitNis: number
  /** סכום כולל מרישום העקיפות הפעיל לחודש הנוכחי. */
  totalMonthlyCorporateOverheadNis: number
  /** מדיניות העמסה (אופיר). */
  overheadAllocationMethod: OverheadAllocationMethod
  overheadAllocationLabel: string
  /** Pro-rated 90d proxy: (net profit / 365) × 90 — not bank balance. */
  cashRunway90dNis: number
  /** `mo_invoices` with status paid (scoped projects). */
  invoicesPaidNis: number
  /** Invoices not in paid status (approved, draft, …) — not yet cash. */
  invoicesOutstandingNis: number
  /** חוב לקוחות — שווי חשבוניות שטרם שולמו (מקביל ל־outstanding). */
  accountsReceivableNis: number
  /** התחייבות רכש — סכום PO במצב ממתין לאישור מנכ״ל. */
  pendingProcurementApprovalNis: number
  activeProjectCount: number
  rows: HoldingExecutiveRow[]
  /** Gantt leaf-like rows: `end_date` before today and progress under 100%. */
  delayAlerts: HoldingExecutiveDelayAlert[]
  /** הודעות הנהלה שמקורן בכללי סיכון (לא מודל חיצוני). */
  executiveInsightAlerts: string[]
}

/**
 * CEO / holding view: portfolio contract totals and the same net-profit engine as
 * `getPartnerFinancials`. Guy/Samer rows are limited to projects they manage.
 */
export async function getHoldingExecutiveDashboard(): Promise<
  { ok: true; data: HoldingExecutivePayload } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id || !user.email) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    const role = (profile as { role?: AppUserRole } | null)?.role ?? null
    if (!canViewHoldingExecutive(user.email, role)) {
      return { ok: false, error: "אין הרשאה לדשבורד הנהלה" }
    }

    const persona = resolvePartnerMetricsPersona(user.email)
    const scope = await resolveManagingPartnerScope(user.email, user.id)

    let projectsQuery = supabase
      .from("projects")
      .select(
        "id, name, internal_project_code, managing_partner_id, partner_cost_subcontractors, partner_cost_employee_salaries, partner_cost_petty_cash, partner_cost_site_overhead"
      )
      .eq("is_deleted", false)

    if (persona === "guy" || persona === "samer") {
      projectsQuery = projectsQuery.eq("managing_partner_id", user.id)
    } else if (persona === "ophir" && scope.effectiveManagingPartnerId) {
      projectsQuery = projectsQuery.eq("managing_partner_id", scope.effectiveManagingPartnerId)
    }

    const { data: projects, error: pErr } = await projectsQuery

    if (pErr) throw pErr

    const projectList = (projects ?? []) as ProjectMetricsSourceRow[]
    const projectIds = projectList.map((p) => p.id as string)

    if (projectIds.length === 0) {
      return {
        ok: true,
        data: {
          totalPortfolioNis: 0,
          recognizedRevenueNis: 0,
          totalDirectCostNis: 0,
          netProfitNis: 0,
          portfolioGrossProfitNis: 0,
          portfolioNetLoadedProfitNis: 0,
          totalMonthlyCorporateOverheadNis: 0,
          overheadAllocationMethod: "revenue_pct",
          overheadAllocationLabel: overheadAllocationMethodLabel("revenue_pct"),
          cashRunway90dNis: 0,
          invoicesPaidNis: 0,
          invoicesOutstandingNis: 0,
          accountsReceivableNis: 0,
          pendingProcurementApprovalNis: 0,
          activeProjectCount: 0,
          rows: [],
          delayAlerts: [],
          executiveInsightAlerts: [],
        },
      }
    }

    const { rows: partnerRows } = await buildPartnerProjectRows(supabase, projectList)

    const laborDaysByProject = await computeGanttLaborDaysByProjectId(
      supabase,
      projectIds
    )
    const ohAlloc = await loadCorporateOverheadAllocations(
      supabase,
      partnerRows,
      laborDaysByProject
    )

    const todayIso = format(new Date(), "yyyy-MM-dd")

    const [
      { data: invCashRows },
      { data: overdueTasks },
      { data: contractRows },
      { data: pendingPoRows },
    ] = await Promise.all([
      supabase
        .from("mo_invoices")
        .select("grand_total, status")
        .in("project_id", projectIds),
      supabase
        .from("tasks")
        .select("project_id, progress")
        .in("project_id", projectIds)
        .lt("end_date", todayIso),
      supabase
        .from("contracts")
        .select("project_id, total_amount")
        .in("project_id", projectIds)
        .eq("is_deleted", false)
        .eq("contract_type", "main_contract")
        .eq("status", "active"),
      supabase
        .from("purchase_orders")
        .select("total_amount")
        .in("project_id", projectIds)
        .eq("is_deleted", false)
        .eq("status", "pending_ceo_approval"),
    ])

    let invoicesPaidNis = 0
    let invoicesOutstandingNis = 0
    for (const r of invCashRows ?? []) {
      const st = String((r as { status?: string }).status ?? "").toLowerCase()
      const g = Number((r as { grand_total?: number }).grand_total ?? 0)
      if (!Number.isFinite(g) || g <= 0) continue
      if (st === "paid") {
        invoicesPaidNis += g
      } else {
        invoicesOutstandingNis += g
      }
    }

    let pendingProcurementApprovalNis = 0
    for (const r of pendingPoRows ?? []) {
      const g = Number((r as { total_amount?: number }).total_amount ?? 0)
      if (!Number.isFinite(g) || g <= 0) continue
      pendingProcurementApprovalNis += g
    }

    const overdueByProject = new Map<string, number>()
    for (const t of overdueTasks ?? []) {
      const prog = Number((t as { progress?: number | string }).progress ?? 0)
      if (prog >= 99.5) continue
      const pid = String((t as { project_id?: string }).project_id ?? "")
      if (!pid) continue
      overdueByProject.set(pid, (overdueByProject.get(pid) ?? 0) + 1)
    }

    const projectMeta = new Map(
      projectList.map((p) => [
        p.id as string,
        {
          name: String(p.name ?? "—"),
          code: String(p.internal_project_code ?? "").trim(),
        },
      ])
    )

    const delayAlerts: HoldingExecutiveDelayAlert[] = [...overdueByProject.entries()]
      .filter(([, n]) => n > 0)
      .map(([projectId, overdueTaskCount]) => {
        const meta = projectMeta.get(projectId)
        return {
          projectId,
          name: meta?.name ?? "—",
          code: meta?.code ?? "",
          overdueTaskCount,
        }
      })
      .sort((a, b) => b.overdueTaskCount - a.overdueTaskCount)

    const contractValueByProject = new Map<string, number>()
    let totalPortfolioNis = 0
    for (const c of contractRows ?? []) {
      const raw = c as { project_id: string; total_amount: number | null }
      const v = Number(raw.total_amount ?? 0)
      if (!Number.isFinite(v) || v <= 0) continue
      const pid = raw.project_id
      contractValueByProject.set(pid, (contractValueByProject.get(pid) ?? 0) + v)
      totalPortfolioNis += v
    }

    const netProfitNis = partnerRows.reduce((s, r) => s + r.profit, 0)
    const recognizedRevenueNis = partnerRows.reduce(
      (s, r) => s + r.totalClientInvoices,
      0
    )
    const totalDirectCostNis = partnerRows.reduce(
      (s, r) => s + r.totalCostBuckets,
      0
    )
    const accountsReceivableNis = invoicesOutstandingNis

    const overdueTaskCountByProject = new Map(
      delayAlerts.map((a) => [a.projectId, a.overdueTaskCount])
    )

    const holdingRows: HoldingExecutiveRow[] = partnerRows.map((r) => {
      const contractValueNis = contractValueByProject.get(r.projectId) ?? 0
      const recognized = r.totalClientInvoices
      const completionPercent =
        contractValueNis > 0
          ? Math.min(100, Math.round((recognized / contractValueNis) * 1000) / 10)
          : null
      const profitCenterKey = inferProfitCenterBrand(r.name, r.code)
      const overdueTaskCount = overdueTaskCountByProject.get(r.projectId) ?? 0
      const grossProfitNis = roundMoney(
        r.totalClientInvoices -
          r.subconCosts -
          r.procurementOrders -
          r.employeeSalaries
      )
      const operatingProfitNis = roundMoney(r.profit)
      const allocatedCorporateOverheadNis =
        ohAlloc.byProject.get(r.projectId) ?? 0
      const netLoadedProfitNis = roundMoney(r.profit - allocatedCorporateOverheadNis)
      const netLoadedMarginPercent =
        recognized > 0
          ? Math.round((netLoadedProfitNis / recognized) * 1000) / 10
          : null
      const healthStatus = computeExecutiveProjectHealth(
        netLoadedMarginPercent ?? r.marginPercent,
        completionPercent,
        overdueTaskCount
      )
      return {
        projectId: r.projectId,
        name: r.name,
        code: r.code,
        profitCenterKey,
        profitCenterLabel: formatProfitCenterLabel(profitCenterKey),
        contractValueNis,
        completionPercent,
        netMarginPercent: r.marginPercent,
        recognizedBillingNis: recognized,
        netProfitNis: r.profit,
        totalCostNis: r.totalCostBuckets,
        grossProfitNis,
        operatingProfitNis,
        allocatedCorporateOverheadNis,
        netLoadedProfitNis,
        netLoadedMarginPercent,
        overdueTaskCount,
        healthStatus,
      }
    })

    holdingRows.sort((a, b) => {
      const br = compareProfitCenterBrand(a.profitCenterKey, b.profitCenterKey)
      if (br !== 0) return br
      return a.name.localeCompare(b.name, "he")
    })

    const portfolioGrossProfitNis = roundMoney(
      holdingRows.reduce((s, x) => s + x.grossProfitNis, 0)
    )
    const portfolioNetLoadedProfitNis = roundMoney(
      holdingRows.reduce((s, x) => s + x.netLoadedProfitNis, 0)
    )
    const cashRunway90dNis = (portfolioNetLoadedProfitNis / 365) * 90

    const executiveInsightAlerts = buildExecutiveInsightAlerts({
      pendingPoApprovalNis: pendingProcurementApprovalNis,
      recognizedRevenueNis,
      totalDirectCostNis,
      netProfitNis: portfolioNetLoadedProfitNis,
      rows: holdingRows,
      delayAlerts,
    })

    return {
      ok: true,
      data: {
        totalPortfolioNis,
        recognizedRevenueNis,
        totalDirectCostNis,
        netProfitNis,
        portfolioGrossProfitNis,
        portfolioNetLoadedProfitNis,
        totalMonthlyCorporateOverheadNis: ohAlloc.totalPoolNis,
        overheadAllocationMethod: ohAlloc.method,
        overheadAllocationLabel: overheadAllocationMethodLabel(ohAlloc.method),
        cashRunway90dNis,
        invoicesPaidNis,
        invoicesOutstandingNis,
        accountsReceivableNis,
        pendingProcurementApprovalNis,
        activeProjectCount: projectIds.length,
        rows: holdingRows,
        delayAlerts,
        executiveInsightAlerts,
      },
    }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/** @deprecated Prefer `getPartnerFinancials` — identical behavior. */
export async function fetchPartnerMetricsDashboard(
  params: Parameters<typeof getPartnerFinancials>[0]
): Promise<{ ok: true; data: PartnerMetricsPayload } | { ok: false; error: string }> {
  return getPartnerFinancials(params)
}

export async function updatePartnerProjectManualCosts(input: {
  projectId: string
  partner_cost_subcontractors: number
  partner_cost_petty_cash: number
  partner_cost_site_overhead: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.email) return { ok: false, error: "נדרשת התחברות" }
    const persona = resolvePartnerMetricsPersona(user.email)
    if (!persona) return { ok: false, error: "אין הרשאה" }

    const pid = String(input.projectId ?? "").trim()
    if (!pid) return { ok: false, error: "חסר פרויקט" }

    const { data: proj, error: pe } = await supabase
      .from("projects")
      .select("id, managing_partner_id")
      .eq("id", pid)
      .eq("is_deleted", false)
      .maybeSingle()
    if (pe || !proj) return { ok: false, error: "פרויקט לא נמצא" }

    if (persona !== "ophir" && (proj as { managing_partner_id: string | null }).managing_partner_id !== user.id) {
      return { ok: false, error: "אין הרשאה לפרויקט זה" }
    }

    const { error } = await supabase
      .from("projects")
      .update({
        partner_cost_subcontractors: Math.max(0, Number(input.partner_cost_subcontractors) || 0),
        partner_cost_petty_cash: Math.max(0, Number(input.partner_cost_petty_cash) || 0),
        partner_cost_site_overhead: Math.max(0, Number(input.partner_cost_site_overhead) || 0),
      })
      .eq("id", pid)
    if (error) return { ok: false, error: error.message }

    revalidatePath("/marker-ofek/partner-finance")
    revalidatePath(`/marker-ofek/partner-finance/${pid}`)
    revalidatePath("/partner-finance")
    revalidatePath("/partner-metrics")
    revalidatePath(`/partner-finance/${pid}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/**
 * תקציר Oracle לעוזר AI — עד 3 נקודות מתוך דשבורד הנהלה (רק למורשים).
 */
export async function getExecutiveOracleBrief(): Promise<
  | {
      ok: true
      bullets: string[]
    }
  | { ok: false }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.email) return { ok: false }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    const role = (profile as { role?: string } | null)?.role ?? null
    if (!canViewHoldingExecutive(user.email, role)) {
      return { ok: false }
    }

    const res = await getHoldingExecutiveDashboard()
    if (!res.ok) return { ok: false }

    const d = res.data
    const money = new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 0,
    })

    const bullets: string[] = []
    if (d.pendingProcurementApprovalNis >= 1) {
      bullets.push(
        `רכש ממתין לאישור ה־CEO — ${money.format(d.pendingProcurementApprovalNis)}.`
      )
    }
    if (d.delayAlerts.length > 0) {
      bullets.push(
        `עיכובי לו״ז: ${d.delayAlerts.length} התראות פעילות — כדאי לעבור על הגאנט.`
      )
    }
    const insight = d.executiveInsightAlerts?.[0]?.trim()
    if (insight) {
      bullets.push(insight)
    }
    if (bullets.length < 3 && d.accountsReceivableNis >= 1) {
      bullets.push(`חוב לקוחות (AR): ${money.format(d.accountsReceivableNis)}.`)
    }
    if (bullets.length < 3 && d.portfolioNetLoadedProfitNis < 0) {
      bullets.push(
        `רווח טעון שלילי בפורטפוליו: ${money.format(d.portfolioNetLoadedProfitNis)} — בדקו פרויקטים אדומים.`
      )
    }

    return { ok: true, bullets: bullets.slice(0, 3) }
  } catch {
    return { ok: false }
  }
}

async function loadPartnerOptions(
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>,
  persona: PartnerMetricsPersona
): Promise<PartnerOption[]> {
  if (persona !== "ophir") return []

  const { data: plist } = await supabase
    .from("projects")
    .select("managing_partner_id")
    .eq("is_deleted", false)
    .not("managing_partner_id", "is", null)

  const idSet = new Set<string>(
    (plist ?? []).map((p) => p.managing_partner_id as string).filter(Boolean)
  )

  const pinnedEmails: { email: string; fallback: string }[] = [
    { email: GUY_RAHUMIM_ADMIN_EMAIL, fallback: "גיא רחמים" },
  ]
  const samerEnv = process.env.PARTNER_SAMER_EMAIL?.trim()
  if (samerEnv) {
    pinnedEmails.push({ email: samerEnv, fallback: "סאמר אל-עומרי" })
  }

  for (const { email } of pinnedEmails) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", email.trim())
      .maybeSingle()
    if (prof?.id) idSet.add(prof.id as string)
  }

  if (idSet.size === 0) return []

  const { data: profs } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", [...idSet])

  const fallbackByEmail = new Map(pinnedEmails.map((p) => [p.email.trim().toLowerCase(), p.fallback]))

  return (profs ?? [])
    .map((p) => {
      const id = p.id as string
      const em = String((p as { email?: string }).email ?? "")
        .trim()
        .toLowerCase()
      const fn = ((p.full_name as string | null) ?? "").trim()
      const label =
        fn ||
        (em && fallbackByEmail.get(em)) ||
        id.slice(0, 8)
      return { id, label }
    })
    .sort((a, b) => a.label.localeCompare(b.label, "he"))
}
