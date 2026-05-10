import { type NextRequest, NextResponse } from "next/server"

import {
  requireMasterDataApiContext,
  sanitizeOptionalString,
} from "@/lib/erp/master-data-api"
import { recalculateContractTotalAmount } from "@/lib/erp/contracts-api"
import type { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type { ErpContractLine, UpdateContractLineInput } from "@/types/erp"

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerAuthClient>>

type ContractLineRow = {
  id: string
  company_id: string
  contract_id: string
  boq_line_id: string | null
  item_id: string | null
  description: string
  quantity: number
  unit_price: number
  total_price: number
}

type ContractLineUpdateBody = Partial<UpdateContractLineInput>

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeParams(
  params: Promise<{ id: string; lineId: string }> | { id: string; lineId: string }
): Promise<{ id: string; lineId: string }> {
  return Promise.resolve(params)
}

function toContractLineDto(row: ContractLineRow): ErpContractLine {
  return {
    id: row.id,
    companyId: row.company_id,
    contractId: row.contract_id,
    boqLineId: row.boq_line_id,
    itemId: row.item_id,
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    totalPrice: Number(row.total_price),
  }
}

async function ensureContract(req: NextRequest, contractId: string) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate

  const { supabase, activeCompanyId } = gate.ctx
  const contract = await supabase
    .from("erp_contracts")
    .select("id")
    .eq("id", contractId)
    .eq("company_id", activeCompanyId)
    .maybeSingle()

  if (contract.error) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: contract.error.message }, { status: 500 }),
    }
  }
  if (!contract.data) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Contract not found" }, { status: 404 }),
    }
  }

  return { ok: true as const, supabase, activeCompanyId }
}

async function loadLine(supabase: SupabaseClient, activeCompanyId: string, contractId: string, lineId: string) {
  const { data, error } = await supabase
    .from("erp_contract_lines")
    .select("*")
    .eq("id", lineId)
    .eq("contract_id", contractId)
    .eq("company_id", activeCompanyId)
    .maybeSingle()

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: error.message }, { status: 500 }),
    }
  }
  if (!data) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Contract line not found" }, { status: 404 }),
    }
  }

  return { ok: true as const, line: data as ContractLineRow }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> | { id: string; lineId: string } }
) {
  const { id: contractId, lineId } = await normalizeParams(params)
  const contract = await ensureContract(req, contractId)
  if (!contract.ok) return contract.response

  const line = await loadLine(contract.supabase, contract.activeCompanyId, contractId, lineId)
  if (!line.ok) return line.response

  return NextResponse.json({ data: toContractLineDto(line.line) })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> | { id: string; lineId: string } }
) {
  const { id: contractId, lineId } = await normalizeParams(params)
  const contract = await ensureContract(req, contractId)
  if (!contract.ok) return contract.response

  const { supabase, activeCompanyId } = contract
  const body = (await req.json().catch(() => null)) as ContractLineUpdateBody | null
  const patch: Record<string, string | number | null> = {}

  if (body?.description !== undefined) {
    const description = sanitizeOptionalString(body.description)
    if (!description) {
      return NextResponse.json({ error: "description cannot be empty" }, { status: 400 })
    }
    patch.description = description
  }
  if (body?.quantity !== undefined) {
    const quantity = Number(body.quantity)
    if (!Number.isFinite(quantity) || quantity < 0) {
      return NextResponse.json({ error: "quantity must be a non-negative number" }, { status: 400 })
    }
    patch.quantity = Number(quantity.toFixed(3))
  }
  if (body?.unitPrice !== undefined) {
    const unitPrice = Number(body.unitPrice)
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return NextResponse.json({ error: "unitPrice must be a non-negative number" }, { status: 400 })
    }
    patch.unit_price = Number(unitPrice.toFixed(2))
  }
  if (body?.boqLineId !== undefined) {
    const boqLineId = sanitizeOptionalString(body.boqLineId)
    if (boqLineId) {
      const boqLine = await supabase
        .from("erp_proj_boq_lines")
        .select("id")
        .eq("id", boqLineId)
        .eq("company_id", activeCompanyId)
        .maybeSingle()
      if (boqLine.error) return NextResponse.json({ error: boqLine.error.message }, { status: 500 })
      if (!boqLine.data) {
        return NextResponse.json({ error: "BOQ line not found for active company" }, { status: 400 })
      }
    }
    patch.boq_line_id = boqLineId
  }
  if (body?.itemId !== undefined) {
    const itemId = sanitizeOptionalString(body.itemId)
    if (itemId) {
      const item = await supabase
        .from("erp_md_items")
        .select("id")
        .eq("id", itemId)
        .eq("company_id", activeCompanyId)
        .maybeSingle()
      if (item.error) return NextResponse.json({ error: item.error.message }, { status: 500 })
      if (!item.data) {
        return NextResponse.json({ error: "Item not found for active company" }, { status: 400 })
      }
    }
    patch.item_id = itemId
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields supplied for update" }, { status: 400 })
  }

  const { error } = await supabase
    .from("erp_contract_lines")
    .update(patch)
    .eq("id", lineId)
    .eq("contract_id", contractId)
    .eq("company_id", activeCompanyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  const recalc = await recalculateContractTotalAmount({
    supabase,
    activeCompanyId,
    contractId,
  })
  if (!recalc.ok) return NextResponse.json({ error: recalc.error }, { status: 500 })

  const line = await loadLine(supabase, activeCompanyId, contractId, lineId)
  if (!line.ok) return line.response

  return NextResponse.json({ data: toContractLineDto(line.line) })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> | { id: string; lineId: string } }
) {
  const { id: contractId, lineId } = await normalizeParams(params)
  const contract = await ensureContract(req, contractId)
  if (!contract.ok) return contract.response

  const { supabase, activeCompanyId } = contract
  const { data, error } = await supabase
    .from("erp_contract_lines")
    .delete()
    .select("id")
    .eq("id", lineId)
    .eq("contract_id", contractId)
    .eq("company_id", activeCompanyId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: "Contract line not found" }, { status: 404 })
  const recalc = await recalculateContractTotalAmount({
    supabase,
    activeCompanyId,
    contractId,
  })
  if (!recalc.ok) return NextResponse.json({ error: recalc.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
