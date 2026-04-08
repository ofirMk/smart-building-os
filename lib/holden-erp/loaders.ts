import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export type HoldenContractBoqRow = {
  id: string
  section_number: string
  description: string
  unit: string | null
  quantity: number | null
  unit_price: number | null
}

export type HoldenContractDocument = {
  contract: {
    id: string
    makat: string | null
    total_amount: number | null
    retention_pct: number
    advance_payment_amount: number
    index_coefficient: number | null
    index_linkage_base_date: string | null
    status: string
    pricing_model: string
    entity: { name: string; legal_id: string | null } | null
    project: { name: string; address: string | null } | null
  }
  boqLines: HoldenContractBoqRow[]
}

export async function loadHoldenContractDocument(
  contractId: string
): Promise<HoldenContractDocument | null> {
  const id = contractId?.trim()
  if (!id) return null

  const supabase = await createSupabaseServerAuthClient()

  const { data: c, error } = await supabase
    .from("contracts")
    .select(
      `
      id,
      makat,
      total_amount,
      retention_pct,
      advance_payment_amount,
      index_coefficient,
      index_linkage_base_date,
      status,
      pricing_model,
      entities ( name, legal_id ),
      projects ( name, address )
    `
    )
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle()

  if (error || !c) return null

  const raw = c as Record<string, unknown>
  const ent = raw.entities as { name?: string; legal_id?: string | null } | null
  const proj = raw.projects as { name?: string; address?: string | null } | null

  const { data: lines } = await supabase
    .from("contract_line_items")
    .select("id, section_number, description, unit, quantity, unit_price")
    .eq("contract_id", id)
    .order("sort_order", { ascending: true })

  const boqLines: HoldenContractBoqRow[] = (lines ?? []).map((row) => {
    const r = row as Record<string, unknown>
    return {
      id: String(r.id),
      section_number: String(r.section_number ?? ""),
      description: String(r.description ?? ""),
      unit: r.unit != null ? String(r.unit) : null,
      quantity: r.quantity != null ? Number(r.quantity) : null,
      unit_price: r.unit_price != null ? Number(r.unit_price) : null,
    }
  })

  return {
    contract: {
      id: String(raw.id),
      makat: raw.makat != null ? String(raw.makat) : null,
      total_amount: raw.total_amount != null ? Number(raw.total_amount) : null,
      retention_pct: Number(raw.retention_pct ?? 0),
      advance_payment_amount: Number(raw.advance_payment_amount ?? 0),
      index_coefficient:
        raw.index_coefficient != null ? Number(raw.index_coefficient) : null,
      index_linkage_base_date:
        raw.index_linkage_base_date != null
          ? String(raw.index_linkage_base_date)
          : null,
      status: String(raw.status ?? ""),
      pricing_model: String(raw.pricing_model ?? "boq"),
      entity: ent ? { name: String(ent.name ?? ""), legal_id: ent.legal_id ?? null } : null,
      project: proj
        ? { name: String(proj.name ?? ""), address: proj.address ?? null }
        : null,
    },
    boqLines,
  }
}

export type HoldenPartialLineRow = {
  id: string
  quantity_previous: number
  quantity_current: number
  line_total_price: number | null
  contract_line_item_id: string | null
  section_number: string
  description: string
  unit: string | null
}

export type HoldenPartialDocument = {
  partial: {
    id: string
    account_number: number
    status: string
    account_period: string | null
    retention_deduction: number
    payment_due: number
    total_cumulative_amount: number
    period_work_indexed: number | null
    contract_id: string
  }
  contract: HoldenContractDocument["contract"]
  lines: HoldenPartialLineRow[]
}

export async function loadHoldenPartialDocument(
  partialAccountId: string
): Promise<HoldenPartialDocument | null> {
  const id = partialAccountId?.trim()
  if (!id) return null

  const supabase = await createSupabaseServerAuthClient()

  const { data: pa, error: paErr } = await supabase
    .from("partial_accounts")
    .select(
      `
      id,
      account_number,
      status,
      account_period,
      retention_deduction,
      payment_due,
      total_cumulative_amount,
      period_work_indexed,
      contract_id
    `
    )
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle()

  if (paErr || !pa) return null

  const p = pa as Record<string, unknown>
  const contractId = String(p.contract_id ?? "")

  const contractDoc = await loadHoldenContractDocument(contractId)
  if (!contractDoc) return null

  const { data: pli } = await supabase
    .from("partial_account_line_items")
    .select(
      "id, quantity_previous, quantity_current, line_total_price, contract_line_item_id"
    )
    .eq("partial_account_id", id)

  const lineByItem = new Map(
    contractDoc.boqLines.map((li) => [li.id, li] as const)
  )

  const lines: HoldenPartialLineRow[] = (pli ?? []).map((row) => {
    const r = row as Record<string, unknown>
    const cliId = r.contract_line_item_id != null ? String(r.contract_line_item_id) : null
    const cli = cliId ? lineByItem.get(cliId) : undefined
    return {
      id: String(r.id),
      quantity_previous: Number(r.quantity_previous ?? 0),
      quantity_current: Number(r.quantity_current ?? 0),
      line_total_price: r.line_total_price != null ? Number(r.line_total_price) : null,
      contract_line_item_id: cliId,
      section_number: cli?.section_number ?? "—",
      description: cli?.description ?? "",
      unit: cli?.unit ?? null,
    }
  })

  return {
    partial: {
      id: String(p.id),
      account_number: Number(p.account_number),
      status: String(p.status ?? ""),
      account_period: p.account_period != null ? String(p.account_period) : null,
      retention_deduction: Number(p.retention_deduction ?? 0),
      payment_due: Number(p.payment_due ?? 0),
      total_cumulative_amount: Number(p.total_cumulative_amount ?? 0),
      period_work_indexed:
        p.period_work_indexed != null ? Number(p.period_work_indexed) : null,
      contract_id: contractId,
    },
    contract: contractDoc.contract,
    lines,
  }
}
