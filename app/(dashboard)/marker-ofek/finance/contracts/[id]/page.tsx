import { notFound } from "next/navigation"

import { ContractBillingCenterClient } from "./contract-billing-center-client"
import type { ContractBillingInitial } from "@/lib/marker-ofek/contract-billing-types"
import { fetchProjectBoq, fetchProjectTasks, fetchTaskBoqLinks } from "@/lib/marker-ofek/gantt-actions"
import {
  buildGanttSuggestedPercentByContractLineId,
  contractWideGanttProgress,
  type ContractLineBaseRow,
} from "@/lib/marker-ofek/billing-gantt-suggestions"
import { getContractRecognizedTotals } from "@/lib/marker-ofek/contract-billing-revenue"
import { resolveDeductionPercents } from "@/lib/marker-ofek/partial-account-calc"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type { MoPartialAccountStatus } from "@/types/marker-ofek"

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export default async function MarkerOfekContractBillingCenterPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const resolved = await Promise.resolve(params)
  const contractId = typeof resolved.id === "string" ? resolved.id : ""
  if (!contractId) notFound()

  const supabase = await createSupabaseServerAuthClient()

  const { data: contract, error: cErr } = await supabase
    .from("contracts")
    .select(
      "id, project_id, total_amount, agreement_type, pricing_model, retention_pct, retainage_percentage, insurance_pct, lab_fees_pct, index_coefficient, projects(name, internal_project_code)"
    )
    .eq("id", contractId)
    .eq("is_deleted", false)
    .maybeSingle()

  if (cErr || !contract) notFound()

  const row = contract as {
    id: string
    project_id: string
    total_amount: number | null
    agreement_type: string | null
    pricing_model: string | null
    projects:
      | { name: string; internal_project_code: string }
      | { name: string; internal_project_code: string }[]
      | null
  }

  const proj = Array.isArray(row.projects) ? row.projects[0] : row.projects
  const projectId = row.project_id
  const projectName = proj?.name ?? "—"
  const internalCode = proj?.internal_project_code ?? "—"
  const pricingModel = row.pricing_model?.trim()
  const contractLabel =
    pricingModel === "boq"
      ? "כתב כמויות"
      : pricingModel === "paushal"
        ? "פאושלי"
        : row.agreement_type?.trim() || "חוזה"

  const [
    { data: contractItemsAll },
    ganttTasks,
    taskBoqLinks,
    projectBoq,
    recognizedTotals,
    deductionRulesResult,
  ] = await Promise.all([
    supabase
      .from("contract_line_items")
      .select("id, section_number, quantity, unit_price")
      .eq("contract_id", contractId),
    fetchProjectTasks(projectId),
    fetchTaskBoqLinks(projectId),
    fetchProjectBoq(projectId),
    getContractRecognizedTotals(supabase, contractId),
    supabase.from("contract_deduction_rules").select("deduction_kind, percent").eq("contract_id", contractId),
  ])
  const deductionRuleRows = deductionRulesResult.error
    ? []
    : (deductionRulesResult.data ?? [])

  const contractLinesForGantt: ContractLineBaseRow[] = (contractItemsAll ?? []).map((raw) => {
    const x = raw as {
      id: string
      section_number: string
      quantity: number | null
      unit_price: number | null
    }
    const q = Number(x.quantity ?? 0)
    const up = Number(x.unit_price ?? 0)
    return {
      id: x.id,
      section_number: String(x.section_number ?? ""),
      lineValue: roundMoney(q * up),
    }
  })

  const ganttSuggestedByLineId = buildGanttSuggestedPercentByContractLineId({
    contractLines: contractLinesForGantt,
    projectBoq: projectBoq.map((b) => ({ id: b.id, item_code: b.item_code })),
    taskBoqLinks: taskBoqLinks.map((l) => ({ task_id: l.task_id, boq_item_id: l.boq_item_id })),
    tasks: ganttTasks,
  })
  const contractGanttProgress = contractWideGanttProgress(ganttTasks)

  const lineBaseByContractLineId = new Map(
    contractLinesForGantt.map((l) => [l.id, l.lineValue] as const)
  )

  const { data: paRows } = await supabase
    .from("partial_accounts")
    .select(
      "id, account_number, status, payment_due, total_cumulative_amount, current_progress_percent, created_at, period_work_gross, period_work_indexed, indexation_adjustment_amount, retainage_amount, retention_deduction"
    )
    .eq("contract_id", contractId)
    .eq("is_deleted", false)
    .order("account_number", { ascending: true })

  const partialIds = (paRows ?? []).map((p) => (p as { id: string }).id)
  const lineByPartial = new Map<
    string,
    Array<{
      id: string
      quantity_previous: number
      quantity_current: number
      line_total_price: number
      cumulative_amount: number
      contract_line_item_id: string | null
      contract_milestone_id: string | null
    }>
  >()

  if (partialIds.length > 0) {
    const { data: lines } = await supabase
      .from("partial_account_line_items")
      .select(
        "id, partial_account_id, quantity_previous, quantity_current, line_total_price, cumulative_amount, contract_line_item_id, contract_milestone_id"
      )
      .in("partial_account_id", partialIds)

    for (const lid of lines ?? []) {
      const li = lid as {
        id: string
        partial_account_id: string
        quantity_previous: number
        quantity_current: number
        line_total_price: number
        cumulative_amount: number
        contract_line_item_id: string | null
        contract_milestone_id: string | null
      }
      const list = lineByPartial.get(li.partial_account_id) ?? []
      list.push(li)
      lineByPartial.set(li.partial_account_id, list)
    }
  }

  const milestoneIds = new Set<string>()
  const lineItemIds = new Set<string>()
  for (const list of lineByPartial.values()) {
    for (const li of list) {
      if (li.contract_milestone_id) milestoneIds.add(li.contract_milestone_id)
      if (li.contract_line_item_id) lineItemIds.add(li.contract_line_item_id)
    }
  }

  const [{ data: milestones }, { data: boqRows }] = await Promise.all([
    milestoneIds.size
      ? supabase
          .from("contract_milestones")
          .select("id, name, amount")
          .in("id", [...milestoneIds])
      : Promise.resolve({ data: [] as unknown[] }),
    lineItemIds.size
      ? supabase
          .from("contract_line_items")
          .select("id, section_number, description")
          .in("id", [...lineItemIds])
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const milestoneName = new Map(
    (milestones ?? []).map((m) => {
      const x = m as { id: string; name: string }
      return [x.id, x.name] as const
    })
  )
  const milestoneAmount = new Map(
    (milestones ?? []).map((m) => {
      const x = m as { id: string; amount?: number | null }
      return [x.id, roundMoney(Number(x.amount ?? 0))] as const
    })
  )
  const boqLabel = new Map(
    (boqRows ?? []).map((b) => {
      const x = b as { id: string; section_number: string; description: string }
      return [x.id, `${x.section_number} — ${x.description}`] as const
    })
  )

  const partialAccounts: ContractBillingInitial["partialAccounts"] = (
    paRows ?? []
  ).map((p) => {
    const pa = p as {
      id: string
      account_number: number
      status: MoPartialAccountStatus
      payment_due: number
      total_cumulative_amount: number
      current_progress_percent: number | null
      created_at: string
      period_work_gross?: number | null
      period_work_indexed?: number | null
      indexation_adjustment_amount?: number | null
      retainage_amount?: number | null
      retention_deduction?: number | null
    }
    const rawLines = lineByPartial.get(pa.id) ?? []
    const lines = rawLines.map((li) => {
      const lineBaseAmount = li.contract_line_item_id
        ? lineBaseByContractLineId.get(li.contract_line_item_id) ?? 0
        : li.contract_milestone_id
          ? milestoneAmount.get(li.contract_milestone_id) ?? 0
          : 0
      const ganttSuggestedPercent =
        li.contract_line_item_id != null
          ? ganttSuggestedByLineId.get(li.contract_line_item_id) ?? null
          : null
      return {
        id: li.id,
        contract_line_item_id: li.contract_line_item_id,
        contract_milestone_id: li.contract_milestone_id,
        quantity_previous: Number(li.quantity_previous ?? 0),
        quantity_current: Number(li.quantity_current ?? 0),
        line_total_price: Number(li.line_total_price ?? 0),
        cumulative_amount: Number(li.cumulative_amount ?? 0),
        line_base_amount: lineBaseAmount,
        gantt_suggested_percent: ganttSuggestedPercent,
        label:
          (li.contract_milestone_id &&
            milestoneName.get(li.contract_milestone_id)) ||
          (li.contract_line_item_id && boqLabel.get(li.contract_line_item_id)) ||
          "שורה",
      }
    })
    const sumLinePeriod = roundMoney(
      lines.reduce((s, li) => s + Number(li.line_total_price ?? 0), 0)
    )
    const storedGross = Number(pa.period_work_gross ?? 0)
    const period_work_gross =
      storedGross > 0 || lines.length === 0 ? storedGross : sumLinePeriod
    const storedAdj = Number(pa.indexation_adjustment_amount ?? 0)
    const period_work_indexed = Number(pa.period_work_indexed ?? 0)
    const indexation_adjustment_amount =
      storedAdj !== 0 || period_work_indexed > 0 || storedGross > 0
        ? storedAdj
        : roundMoney(period_work_indexed - period_work_gross)
    const retainage_amount =
      Number(pa.retainage_amount ?? 0) ||
      Number(pa.retention_deduction ?? 0)

    return {
      id: pa.id,
      account_number: pa.account_number,
      status: pa.status,
      payment_due: Number(pa.payment_due ?? 0),
      total_cumulative_amount: Number(pa.total_cumulative_amount ?? 0),
      current_progress_percent:
        pa.current_progress_percent != null
          ? Number(pa.current_progress_percent)
          : null,
      created_at: pa.created_at,
      period_work_gross,
      period_work_indexed,
      indexation_adjustment_amount,
      retainage_amount,
      lines,
    }
  })

  const cr = row as {
    retention_pct?: number | null
    retainage_percentage?: number | null
    insurance_pct?: number | null
    lab_fees_pct?: number | null
    index_coefficient?: number | null
  }
  const retainageForDraft =
    cr.retainage_percentage != null && Number.isFinite(Number(cr.retainage_percentage))
      ? Number(cr.retainage_percentage)
      : Number(cr.retention_pct ?? 0)
  const billingDraftParams = {
    deductionPercents: resolveDeductionPercents({
      retentionPct: retainageForDraft,
      insurancePct: Number(cr.insurance_pct ?? 0),
      labFeesPct: Number(cr.lab_fees_pct ?? 0.5),
      rules: (deductionRuleRows ?? []) as Array<{
        deduction_kind: string
        percent: number | null
      }>,
    }),
    indexCoefficient: Number(cr.index_coefficient ?? 1),
  }

  const sortedByAcct = [...partialAccounts].sort(
    (a, b) => b.account_number - a.account_number
  )
  const topPartial = sortedByAcct[0] ?? null
  const newAccountBaseline: ContractBillingInitial["newAccountBaseline"] =
    topPartial && topPartial.lines.length > 0
      ? {
          sourcePartialAccountId: topPartial.id,
          sourceAccountNumber: topPartial.account_number,
          previousCumulativeApproved: topPartial.total_cumulative_amount,
          lines: topPartial.lines.map((li) => ({
            contract_line_item_id: li.contract_line_item_id,
            contract_milestone_id: li.contract_milestone_id,
            label: li.label,
            lineBase: li.line_base_amount,
            quantityPreviousEnd: li.quantity_current,
            ganttSuggestedPercent: li.gantt_suggested_percent,
          })),
        }
      : null

  const initial: ContractBillingInitial = {
    contractId: row.id,
    projectId,
    internalCode,
    projectName,
    contractLabel,
    totalContract:
      row.total_amount != null ? Number(row.total_amount) : null,
    recognizedFromInvoices: recognizedTotals.fromInvoices,
    recognizedFromApprovedPartials:
      recognizedTotals.fromApprovedPartialsNotInvoiced,
    totalRecognized: recognizedTotals.totalRecognized,
    contractGanttProgress,
    ganttTasksForSync: ganttTasks.map((t) => ({
      id: t.id,
      name: t.name,
      progress: Math.max(0, Math.min(100, Math.round(Number(t.progress) || 0))),
    })),
    billingDraftParams,
    newAccountBaseline,
    partialAccounts,
  }

  return <ContractBillingCenterClient initial={initial} />
}
