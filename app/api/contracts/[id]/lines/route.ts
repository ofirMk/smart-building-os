import { type NextRequest, NextResponse } from "next/server"

import {
  requireMasterDataApiContext,
  sanitizeOptionalString,
} from "@/lib/erp/master-data-api"
import type { CreateContractLineInput, ErpContractLine } from "@/types/erp"
import type { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

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

type ContractLineCreateBody = Partial<CreateContractLineInput>

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeParams(
  params: Promise<{ id: string }> | { id: string }
): Promise<{ id: string }> {
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

async function ensureContract(
  req: NextRequest,
  contractId: string
): Promise<
  | { ok: true; supabase: SupabaseClient; activeCompanyId: string }
  | { ok: false; response: NextResponse }
> {
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
    return { ok: false, response: NextResponse.json({ error: contract.error.message }, { status: 500 }) }
  }
  if (!contract.data) {
    return { ok: false, response: NextResponse.json({ error: "Contract not found" }, { status: 404 }) }
  }
  return { ok: true, supabase, activeCompanyId }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: contractId } = await normalizeParams(params)
  const contract = await ensureContract(req, contractId)
  if (!contract.ok) return contract.response

  const { supabase, activeCompanyId } = contract
  const { data, error } = await supabase
    .from("erp_contract_lines")
    .select("*")
    .eq("contract_id", contractId)
    .eq("company_id", activeCompanyId)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: ((data ?? []) as ContractLineRow[]).map(toContractLineDto) })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: contractId } = await normalizeParams(params)
  const contract = await ensureContract(req, contractId)
  if (!contract.ok) return contract.response

  const { supabase, activeCompanyId } = contract
  const body = (await req.json().catch(() => null)) as ContractLineCreateBody | null

  const boqLineId = sanitizeOptionalString(body?.boqLineId)
  const itemId = sanitizeOptionalString(body?.itemId)
  const description = sanitizeOptionalString(body?.description)
  const quantity = Number(body?.quantity)
  const unitPrice = Number(body?.unitPrice)

  if (
    !description ||
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    !Number.isFinite(unitPrice) ||
    unitPrice < 0
  ) {
    return NextResponse.json(
      { error: "description, quantity and unitPrice are required with non-negative values" },
      { status: 400 }
    )
  }

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

  const { data, error } = await supabase
    .from("erp_contract_lines")
    .insert({
      company_id: activeCompanyId,
      contract_id: contractId,
      boq_line_id: boqLineId,
      item_id: itemId,
      description,
      quantity,
      unit_price: Number(unitPrice.toFixed(2)),
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: toContractLineDto(data as ContractLineRow) }, { status: 201 })
}
