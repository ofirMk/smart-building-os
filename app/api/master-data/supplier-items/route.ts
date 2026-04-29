import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  requireMasterDataApiContext,
  sanitizeOptionalString,
} from "@/lib/erp/master-data-api"

const supplierItemSchema = z.object({
  itemId: z.string().uuid(),
  supplierId: z.string().uuid(),
  supplierSku: z.string().trim().optional().nullable(),
  basePrice: z.coerce.number().min(0).optional().default(0),
  discountPercentage: z.coerce.number().min(0).max(100).optional().default(0),
  currency: z.string().trim().length(3).optional().default("ILS"),
  uom: z.string().trim().optional().nullable(),
  validFrom: z.string().trim().optional().nullable(),
  validTo: z.string().trim().optional().nullable(),
  isPreferred: z.boolean().optional().default(false),
  aiLastParsedAt: z.string().trim().optional().nullable(),
  aiParseStatus: z.string().trim().optional().nullable(),
  aiParseHistory: z.array(z.unknown()).optional().default([]),
  aiMetadata: z.record(z.string(), z.unknown()).optional().default({}),
})

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

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const q = sanitizeOptionalString(req.nextUrl.searchParams.get("q"))
  const itemId = sanitizeOptionalString(req.nextUrl.searchParams.get("itemId"))
  const supplierId = sanitizeOptionalString(req.nextUrl.searchParams.get("supplierId"))

  let query = supabase
    .from("erp_md_supplier_items")
    .select("id,company_id,item_id,supplier_id,supplier_sku,base_price,discount_percentage,currency,uom,valid_from,valid_to,is_preferred,ai_last_parsed_at,ai_parse_status,ai_parse_history,ai_metadata")
    .eq("company_id", activeCompanyId)
    .order("is_preferred", { ascending: false })
    .order("updated_at", { ascending: false })

  if (itemId) query = query.eq("item_id", itemId)
  if (supplierId) query = query.eq("supplier_id", supplierId)
  if (q) query = query.ilike("supplier_sku", `%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: (data ?? []).map(mapSupplierItemRow) })
}

export async function POST(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const body = await req.json().catch(() => null)
  const parsed = supplierItemSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }

  const itemCheck = await supabase
    .from("erp_md_items")
    .select("id")
    .eq("company_id", activeCompanyId)
    .eq("id", parsed.data.itemId)
    .maybeSingle()
  if (itemCheck.error || !itemCheck.data) {
    return NextResponse.json(
      { error: itemCheck.error?.message ?? "Invalid itemId for active company" },
      { status: 400 }
    )
  }

  const supplierCheck = await supabase
    .from("erp_md_suppliers")
    .select("id")
    .eq("company_id", activeCompanyId)
    .eq("id", parsed.data.supplierId)
    .maybeSingle()
  if (supplierCheck.error || !supplierCheck.data) {
    return NextResponse.json(
      { error: supplierCheck.error?.message ?? "Invalid supplierId for active company" },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("erp_md_supplier_items")
    .insert({
      company_id: activeCompanyId,
      item_id: parsed.data.itemId,
      supplier_id: parsed.data.supplierId,
      supplier_sku: parsed.data.supplierSku ?? null,
      base_price: parsed.data.basePrice,
      discount_percentage: parsed.data.discountPercentage,
      currency: parsed.data.currency.toUpperCase(),
      uom: parsed.data.uom ?? null,
      valid_from: parsed.data.validFrom ?? null,
      valid_to: parsed.data.validTo ?? null,
      is_preferred: parsed.data.isPreferred,
      ai_last_parsed_at: parsed.data.aiLastParsedAt ?? null,
      ai_parse_status: parsed.data.aiParseStatus ?? null,
      ai_parse_history: parsed.data.aiParseHistory,
      ai_metadata: parsed.data.aiMetadata,
    })
    .select("id,company_id,item_id,supplier_id,supplier_sku,base_price,discount_percentage,currency,uom,valid_from,valid_to,is_preferred,ai_last_parsed_at,ai_parse_status,ai_parse_history,ai_metadata")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: mapSupplierItemRow(data) }, { status: 201 })
}
