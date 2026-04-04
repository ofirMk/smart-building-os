import { notFound } from "next/navigation"

import {
  PartialAccountDetailClient,
  type PartialAccountDetailInitial,
  type PartialAccountDetailLine,
  type PartialAccountVariationLine,
} from "./partial-account-detail-client"
import {
  DEFAULT_INDEX_SERIES_CODE,
  fetchIndexHistoryRowById,
} from "@/lib/marker-ofek/index-history-lookup"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export default async function PartialAccountBillingPage({
  params,
}: {
  params: Promise<{ partialId: string }> | { partialId: string }
}) {
  const resolved = await Promise.resolve(params)
  const partialId =
    typeof resolved.partialId === "string" ? resolved.partialId : ""
  if (!partialId) notFound()

  const supabase = await createSupabaseServerAuthClient()

  const { data: pa, error: paErr } = await supabase
    .from("partial_accounts")
    .select(
      `
      id,
      contract_id,
      account_number,
      status,
      payment_due,
      total_cumulative_amount,
      period_work_gross,
      period_work_indexed,
      indexation_adjustment_amount,
      retainage_amount,
      base_index_history_id,
      applied_index_history_id,
      retention_deduction,
      insurance_deduction,
      lab_fees_deduction,
      is_deleted,
      contracts (
        id,
        pricing_model,
        agreement_type,
        project_id,
        projects ( name, internal_project_code )
      )
    `
    )
    .eq("id", partialId)
    .maybeSingle()

  if (paErr || !pa || (pa as { is_deleted?: boolean }).is_deleted) {
    notFound()
  }

  const paRaw = pa as {
    id: string
    contract_id: string
    account_number: number
    status: string
    payment_due: number
    total_cumulative_amount: number
    period_work_gross: number | null
    period_work_indexed: number | null
    indexation_adjustment_amount: number | null
    retainage_amount: number | null
    base_index_history_id: string | null
    applied_index_history_id: string | null
    retention_deduction: number
    insurance_deduction: number
    lab_fees_deduction: number | null
    contracts:
      | {
          id: string
          pricing_model: string | null
          agreement_type: string | null
          project_id: string
          projects:
            | { name: string; internal_project_code: string }
            | { name: string; internal_project_code: string }[]
            | null
        }
      | {
          id: string
          pricing_model: string | null
          agreement_type: string | null
          project_id: string
          projects:
            | { name: string; internal_project_code: string }
            | { name: string; internal_project_code: string }[]
            | null
        }[]
      | null
  }

  const c = Array.isArray(paRaw.contracts)
    ? paRaw.contracts[0]
    : paRaw.contracts
  if (!c) notFound()

  const row = { ...paRaw, contracts: c }

  const pr = c.projects
  const proj = Array.isArray(pr) ? pr[0] : pr
  const projectName = proj?.name ?? "—"
  const internalCode = proj?.internal_project_code ?? "—"
  const pricingModel = c.pricing_model?.trim()
  const contractLabel =
    pricingModel === "boq"
      ? "כתב כמויות"
      : pricingModel === "paushal"
        ? "פאושלי"
        : c.agreement_type?.trim() || "חוזה"

  const { data: rawLines } = await supabase
    .from("partial_account_line_items")
    .select(
      `
      id,
      quantity_previous,
      quantity_current,
      cumulative_amount,
      line_total_price,
      contract_line_item_id,
      contract_milestone_id
    `
    )
    .eq("partial_account_id", partialId)

  const lineRows = rawLines ?? []
  const lineItemIds = new Set<string>()
  const milestoneIds = new Set<string>()
  for (const li of lineRows) {
    const x = li as {
      contract_line_item_id: string | null
      contract_milestone_id: string | null
    }
    if (x.contract_line_item_id) lineItemIds.add(x.contract_line_item_id)
    if (x.contract_milestone_id) milestoneIds.add(x.contract_milestone_id)
  }

  const [{ data: boqRows }, { data: msRows }] = await Promise.all([
    lineItemIds.size
      ? supabase
          .from("contract_line_items")
          .select(
            "id, section_number, description, unit, quantity, unit_price"
          )
          .in("id", [...lineItemIds])
      : Promise.resolve({ data: [] as unknown[] }),
    milestoneIds.size
      ? supabase
          .from("contract_milestones")
          .select("id, name, amount")
          .in("id", [...milestoneIds])
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const boqById = new Map(
    (boqRows ?? []).map((b) => {
      const x = b as {
        id: string
        section_number: string
        description: string
        unit: string | null
        quantity: number | null
        unit_price: number | null
      }
      return [x.id, x] as const
    })
  )
  const msById = new Map(
    (msRows ?? []).map((m) => {
      const x = m as { id: string; name: string; amount: number | null }
      return [x.id, x] as const
    })
  )

  let periodWorkGross = 0
  const lines: PartialAccountDetailLine[] = []

  for (const li of lineRows) {
    const x = li as {
      id: string
      quantity_previous: number | null
      quantity_current: number | null
      cumulative_amount: number | null
      line_total_price: number | null
      contract_line_item_id: string | null
      contract_milestone_id: string | null
    }
    const ltp = roundMoney(Number(x.line_total_price ?? 0))
    periodWorkGross += ltp

    if (x.contract_line_item_id) {
      const cli = boqById.get(x.contract_line_item_id)
      const qty = cli ? Number(cli.quantity ?? 0) : null
      const up = cli ? Number(cli.unit_price ?? 0) : null
      lines.push({
        id: x.id,
        section: cli?.section_number ?? "—",
        description: cli?.description ?? "שורה",
        unit: cli?.unit?.trim() || "—",
        contractQty: qty,
        unitPrice: up,
        quantity_previous: Number(x.quantity_previous ?? 0),
        quantity_current: Number(x.quantity_current ?? 0),
        cumulative_amount: roundMoney(Number(x.cumulative_amount ?? 0)),
        line_total_price: ltp,
        isMilestone: false,
      })
    } else if (x.contract_milestone_id) {
      const ms = msById.get(x.contract_milestone_id)
      const amt = ms ? roundMoney(Number(ms.amount ?? 0)) : null
      lines.push({
        id: x.id,
        section: "אד",
        description: ms?.name ?? "אבן דרך",
        unit: "%",
        contractQty: null,
        unitPrice: amt,
        quantity_previous: Number(x.quantity_previous ?? 0),
        quantity_current: Number(x.quantity_current ?? 0),
        cumulative_amount: roundMoney(Number(x.cumulative_amount ?? 0)),
        line_total_price: ltp,
        isMilestone: true,
      })
    }
  }

  const storedGross = roundMoney(Number(paRaw.period_work_gross ?? 0))
  const displayPeriodGross =
    storedGross > 0 || lineRows.length === 0
      ? storedGross
      : roundMoney(periodWorkGross)

  const [baseIdxRow, appliedIdxRow] = await Promise.all([
    fetchIndexHistoryRowById(supabase, paRaw.base_index_history_id),
    fetchIndexHistoryRowById(supabase, paRaw.applied_index_history_id),
  ])

  const indexRatio =
    baseIdxRow &&
    appliedIdxRow &&
    Number(baseIdxRow.index_value) > 0
      ? Number(appliedIdxRow.index_value) / Number(baseIdxRow.index_value)
      : null

  const pdfMeta = {
    seriesCode: DEFAULT_INDEX_SERIES_CODE,
    baseIndex: baseIdxRow,
    currentIndex: appliedIdxRow,
    indexRatio,
    indexationAdjustment: roundMoney(
      Number(paRaw.indexation_adjustment_amount ?? 0)
    ),
    retainageAmount: roundMoney(
      Number(paRaw.retainage_amount ?? 0) ||
        Number(paRaw.retention_deduction ?? 0)
    ),
    storedPeriodGross: displayPeriodGross,
  }

  const variations: PartialAccountVariationLine[] = []
  const voResult = await supabase
    .from("contract_variation_orders")
    .select(
      `
      vo_number,
      title,
      contract_variation_lines (
        section_code,
        description,
        unit,
        quantity,
        unit_price,
        line_total
      )
    `
    )
    .eq("contract_id", row.contract_id)
    .eq("status", "approved")

  const voRows = voResult.error ? [] : voResult.data

  for (const vo of voRows ?? []) {
    const v = vo as {
      vo_number: number
      title: string
      contract_variation_lines:
        | Array<{
            section_code: string | null
            description: string
            unit: string | null
            quantity: number
            unit_price: number
            line_total: number
          }>
        | null
    }
    const vl = v.contract_variation_lines
    const list = Array.isArray(vl) ? vl : vl ? [vl] : []
    for (const ln of list) {
      variations.push({
        voNumber: v.vo_number,
        voTitle: v.title ?? "",
        section_code: ln.section_code,
        description: ln.description,
        unit: ln.unit,
        quantity: Number(ln.quantity ?? 0),
        unit_price: Number(ln.unit_price ?? 0),
        line_total: Number(ln.line_total ?? 0),
      })
    }
  }

  const initial: PartialAccountDetailInitial = {
    partialId: row.id,
    contractId: row.contract_id,
    accountNumber: row.account_number,
    status: row.status,
    projectName,
    internalCode,
    contractLabel,
    paymentDue: roundMoney(Number(row.payment_due ?? 0)),
    totalCumulative: roundMoney(Number(row.total_cumulative_amount ?? 0)),
    periodWorkIndexed: roundMoney(Number(row.period_work_indexed ?? 0)),
    retention: roundMoney(Number(row.retention_deduction ?? 0)),
    insurance: roundMoney(Number(row.insurance_deduction ?? 0)),
    labFees: roundMoney(Number(row.lab_fees_deduction ?? 0)),
    periodWorkGross: displayPeriodGross,
    pdfMeta,
    lines,
    variations,
  }

  return <PartialAccountDetailClient initial={initial} />
}
