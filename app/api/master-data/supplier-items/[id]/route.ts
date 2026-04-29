import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  requireMasterDataApiContext,
  sanitizeOptionalString,
} from "@/lib/erp/master-data-api"

const supplierItemUpdateSchema = z.object({
  supplierSku: z.string().trim().optional().nullable(),
  basePrice: z.coerce.number().min(0).optional(),
  discountPercentage: z.coerce.number().min(0).max(100).optional(),
  currency: z.string().trim().length(3).optional(),
  uom: z.string().trim().optional().nullable(),
  validFrom: z.string().trim().optional().nullable(),
  validTo: z.string().trim().optional().nullable(),
  isPreferred: z.boolean().optional(),
  aiLastParsedAt: z.string().trim().optional().nullable(),
  aiParseStatus: z.string().trim().optional().nullable(),
  aiParseHistory: z.array(z.unknown()).optional(),
  aiMetadata: z.record(z.string(), z.unknown()).optional(),
})

function normalizeParams(
  params: Promise<{ id: string }> | { id: string }
): Promise<{ id: string }> {
  return Promise.resolve(params)
}

function mapSupplierItemRow(row: {
  id: string
  company_id: string
  item_id: string
  supplier_id: string
  supplier_sku: string | null
  base_price: number
  discount_percentage: number
  currency: string
  uom: string | null
  valid_from: string | null
  valid_to: string | null
  is_preferred: boolean
  ai_last_parsed_at: string | null
  ai_parse_status: string | null
  ai_parse_history: unknown
  ai_metadata: unknown
}) {
  return {
    id: row.id,
    companyId: row.company_id,
    itemId: row.item_id,
    supplierId: row.supplier_id,
    supplierSku: row.supplier_sku,
    basePrice: Number(row.base_price),
    discountPercentage: Number(row.discount_percentage),
    currency: row.currency,
    uom: row.uom,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    isPreferred: row.is_preferred,
    aiLastParsedAt: row.ai_last_parsed_at,
    aiParseStatus: row.ai_parse_status,
    aiParseHistory: Array.isArray(row.ai_parse_history) ? row.ai_parse_history : [],
    aiMetadata:
      typeof row.ai_metadata === "object" && row.ai_metadata !== null && !Array.isArray(row.ai_metadata)
        ? (row.ai_metadata as Record<string, unknown>)
        : {},
  }
}

async function loadSupplierItem(req: NextRequest, id: string) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate
  const { supabase, activeCompanyId } = gate.ctx

  const { data, error } = await supabase
    .from("erp_md_supplier_items")
    .select("id,company_id,item_id,supplier_id,supplier_sku,base_price,discount_percentage,currency,uom,valid_from,valid_to,is_preferred,ai_last_parsed_at,ai_parse_status,ai_parse_history,ai_metadata")
    .eq("id", id)
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
      response: NextResponse.json({ error: "Supplier item not found" }, { status: 404 }),
    }
  }
  return { ok: true as const, data: mapSupplierItemRow(data) }
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeParams(params)
  const loaded = await loadSupplierItem(req, id)
  if (!loaded.ok) return loaded.response
  return NextResponse.json({ data: loaded.data })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const body = await req.json().catch(() => null)
  const parsed = supplierItemUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }

  const patch: Record<string, unknown> = {}
  if (parsed.data.supplierSku !== undefined) {
    patch.supplier_sku = sanitizeOptionalString(parsed.data.supplierSku) ?? null
  }
  if (parsed.data.basePrice !== undefined) patch.base_price = parsed.data.basePrice
  if (parsed.data.discountPercentage !== undefined) {
    patch.discount_percentage = parsed.data.discountPercentage
  }
  if (parsed.data.currency !== undefined) patch.currency = parsed.data.currency.toUpperCase()
  if (parsed.data.uom !== undefined) patch.uom = sanitizeOptionalString(parsed.data.uom) ?? null
  if (parsed.data.validFrom !== undefined) {
    patch.valid_from = sanitizeOptionalString(parsed.data.validFrom) ?? null
  }
  if (parsed.data.validTo !== undefined) {
    patch.valid_to = sanitizeOptionalString(parsed.data.validTo) ?? null
  }
  if (parsed.data.isPreferred !== undefined) patch.is_preferred = parsed.data.isPreferred
  if (parsed.data.aiLastParsedAt !== undefined) {
    patch.ai_last_parsed_at = sanitizeOptionalString(parsed.data.aiLastParsedAt) ?? null
  }
  if (parsed.data.aiParseStatus !== undefined) {
    patch.ai_parse_status = sanitizeOptionalString(parsed.data.aiParseStatus) ?? null
  }
  if (parsed.data.aiParseHistory !== undefined) patch.ai_parse_history = parsed.data.aiParseHistory
  if (parsed.data.aiMetadata !== undefined) patch.ai_metadata = parsed.data.aiMetadata

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields supplied for update" }, { status: 400 })
  }

  const { error } = await supabase
    .from("erp_md_supplier_items")
    .update(patch)
    .eq("id", id)
    .eq("company_id", activeCompanyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return GET(req, { params: Promise.resolve({ id }) })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const { error } = await supabase
    .from("erp_md_supplier_items")
    .delete()
    .eq("id", id)
    .eq("company_id", activeCompanyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
