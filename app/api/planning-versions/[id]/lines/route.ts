import { type NextRequest, NextResponse } from "next/server"

import {
  requireMasterDataApiContext,
  sanitizeOptionalString,
} from "@/lib/erp/master-data-api"

type BoqLineRow = {
  id: string
  company_id: string
  version_id: string
  section: string
  item_number: string
  description: string
  uom: string
  quantity: number
  unit_price: number
  total_price: number
}

type BoqLineInput = {
  section?: unknown
  itemNumber?: unknown
  description?: unknown
  uom?: unknown
  quantity?: unknown
  unitPrice?: unknown
}

type UpdateLinesBody = {
  lines?: BoqLineInput[]
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeParams(
  params: Promise<{ id: string }> | { id: string }
): Promise<{ id: string }> {
  return Promise.resolve(params)
}

function toBoqLineDto(row: BoqLineRow) {
  return {
    id: row.id,
    companyId: row.company_id,
    versionId: row.version_id,
    section: row.section,
    itemNumber: row.item_number,
    description: row.description,
    uom: row.uom,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    totalPrice: Number(row.total_price),
  }
}

async function ensureVersion(
  req: NextRequest,
  versionId: string
): Promise<
  | { ok: true; supabase: any; companyId: string }
  | { ok: false; response: NextResponse }
> {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate

  const { supabase, companyId } = gate.ctx
  const version = await supabase
    .from("erp_proj_planning_versions")
    .select("id")
    .eq("id", versionId)
    .eq("company_id", companyId)
    .maybeSingle()

  if (version.error) {
    return { ok: false, response: NextResponse.json({ error: version.error.message }, { status: 500 }) }
  }
  if (!version.data) {
    return { ok: false, response: NextResponse.json({ error: "Planning version not found" }, { status: 404 }) }
  }

  return { ok: true, supabase, companyId }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: versionId } = await normalizeParams(params)
  const version = await ensureVersion(req, versionId)
  if (!version.ok) return version.response

  const { supabase, companyId } = version
  const { data, error } = await supabase
    .from("erp_proj_boq_lines")
    .select("*")
    .eq("version_id", versionId)
    .eq("company_id", companyId)
    .order("section", { ascending: true })
    .order("item_number", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: ((data ?? []) as BoqLineRow[]).map(toBoqLineDto) })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: versionId } = await normalizeParams(params)
  const version = await ensureVersion(req, versionId)
  if (!version.ok) return version.response

  const { supabase, companyId } = version
  const body = (await req.json().catch(() => null)) as UpdateLinesBody | null
  const lines = Array.isArray(body?.lines) ? body.lines : null

  if (!lines) {
    return NextResponse.json({ error: "lines array is required" }, { status: 400 })
  }

  const normalized = lines.map((line, index) => {
    const section = sanitizeOptionalString(line.section)
    const itemNumber = sanitizeOptionalString(line.itemNumber)
    const description = sanitizeOptionalString(line.description)
    const uom = sanitizeOptionalString(line.uom)
    const quantity = Number(line.quantity)
    const unitPrice = Number(line.unitPrice)

    if (
      !section ||
      !itemNumber ||
      !description ||
      !uom ||
      !Number.isFinite(quantity) ||
      quantity < 0 ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    ) {
      throw new Error(`Invalid BOQ line at index ${index}`)
    }

    return {
      company_id: companyId,
      version_id: versionId,
      section,
      item_number: itemNumber,
      description,
      uom,
      quantity,
      unit_price: unitPrice,
    }
  })

  try {
    const del = await supabase
      .from("erp_proj_boq_lines")
      .delete()
      .eq("version_id", versionId)
      .eq("company_id", companyId)

    if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 })

    if (normalized.length > 0) {
      const ins = await supabase.from("erp_proj_boq_lines").insert(normalized)
      if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 })
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid payload" },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("erp_proj_boq_lines")
    .select("*")
    .eq("version_id", versionId)
    .eq("company_id", companyId)
    .order("section", { ascending: true })
    .order("item_number", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: ((data ?? []) as BoqLineRow[]).map(toBoqLineDto) })
}

