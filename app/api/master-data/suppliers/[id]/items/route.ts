/**
 * GET  /api/master-data/suppliers/[id]/items — list supplier products
 * POST /api/master-data/suppliers/[id]/items — add a product to a supplier
 *
 * Operates on `erp_md_supplier_items` (canonical pricing bridge).
 * UNIQUE (company_id, item_id, supplier_id) → 409 on duplicate.
 * `net_unit_price` is a generated-stored column — read-only.
 */

import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ─────────────────────────────────────────────
// DTO
// ─────────────────────────────────────────────

export type SupplierItemDto = {
  id: string
  itemId: string
  itemNumber: string | null
  itemDescription: string | null
  itemUom: string | null
  supplierSku: string | null
  manufacturerSku: string | null
  manufacturerName: string | null
  manufacturerFullName: string | null
  leadTimeDays: number | null
  basePrice: number
  netUnitPrice: number | null
  discountPercentage: number
  currency: string
  uom: string | null
  isPreferred: boolean
  validFrom: string | null
  validTo: string | null
}

// ─────────────────────────────────────────────
// DB row shape
// ─────────────────────────────────────────────

type ItemEmbed =
  | { item_number: string; description: string; unit_of_measure: string }
  | { item_number: string; description: string; unit_of_measure: string }[]
  | null

type Row = {
  id: string
  item_id: string
  supplier_sku: string | null
  manufacturer_sku: string | null
  manufacturer_name: string | null
  manufacturer_full_name: string | null
  lead_time_days: number | null
  base_price: number | string
  net_unit_price: number | string | null
  discount_percentage: number | string
  currency: string
  uom: string | null
  is_preferred: boolean
  valid_from: string | null
  valid_to: string | null
  item: ItemEmbed
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === "string" ? Number(v) : v
  return Number.isFinite(n) ? n : 0
}

function toNumOrNull(v: number | string | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === "string" ? Number(v) : v
  return Number.isFinite(n) ? n : null
}

function mapRow(r: Row): SupplierItemDto {
  const embed = pickOne(r.item)
  return {
    id: r.id,
    itemId: r.item_id,
    itemNumber: embed?.item_number ?? null,
    itemDescription: embed?.description ?? null,
    itemUom: embed?.unit_of_measure ?? null,
    supplierSku: r.supplier_sku,
    manufacturerSku: r.manufacturer_sku ?? null,
    manufacturerName: r.manufacturer_name ?? null,
    manufacturerFullName: r.manufacturer_full_name ?? null,
    leadTimeDays: r.lead_time_days ?? null,
    basePrice: toNum(r.base_price),
    netUnitPrice: toNumOrNull(r.net_unit_price),
    discountPercentage: toNum(r.discount_percentage),
    currency: r.currency,
    uom: r.uom,
    isPreferred: r.is_preferred,
    validFrom: r.valid_from,
    validTo: r.valid_to,
  }
}

const SELECT =
  "id,item_id,supplier_sku,manufacturer_sku,manufacturer_name,manufacturer_full_name,lead_time_days," +
  "base_price,net_unit_price,discount_percentage," +
  "currency,uom,is_preferred,valid_from,valid_to," +
  "item:erp_md_items!erp_md_supplier_items_company_item_fk(item_number,description,unit_of_measure)"

// ─────────────────────────────────────────────
// Validation schema
// ─────────────────────────────────────────────

const createSchema = z.object({
  itemId: z.string().uuid({ message: "itemId חייב להיות UUID תקני" }),
  supplierSku: z.string().trim().max(128).nullable().optional(),
  basePrice: z
    .number({ message: "basePrice חייב להיות מספר" })
    .min(0, { message: "basePrice חייב להיות אי-שלילי" }),
  discountPercentage: z.number().min(0).max(100).optional().default(0),
  currency: z
    .string()
    .trim()
    .length(3, { message: "currency חייב להיות 3 תווים" })
    .transform((v) => v.toUpperCase())
    .optional()
    .default("ILS"),
  uom: z.string().trim().max(16).nullable().optional(),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
  isPreferred: z.boolean().optional().default(false),
  manufacturerSku: z.string().trim().max(128).nullable().optional(),
  manufacturerName: z.string().trim().max(255).nullable().optional(),
  manufacturerFullName: z.string().trim().max(512).nullable().optional(),
  leadTimeDays: z.number().int().min(0).nullable().optional(),
})

// ─────────────────────────────────────────────
// Route helpers
// ─────────────────────────────────────────────

function normalizeParams(
  params: Promise<{ id: string }> | { id: string },
): Promise<{ id: string }> {
  return Promise.resolve(params)
}

// ─────────────────────────────────────────────
// GET — list items for supplier
// ─────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  const { id: supplierId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const { data, error } = await supabase
    .from("erp_md_supplier_items")
    .select(SELECT)
    .eq("company_id", activeCompanyId)
    .eq("supplier_id", supplierId)
    .order("is_preferred", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: ((data ?? []) as unknown as Row[]).map(mapRow),
  })
}

// ─────────────────────────────────────────────
// POST — add a product to a supplier
// ─────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  const { id: supplierId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  // Verify supplier belongs to this company (RLS double-check)
  const { data: supplier, error: supplierErr } = await supabase
    .from("erp_md_suppliers")
    .select("id")
    .eq("id", supplierId)
    .eq("company_id", activeCompanyId)
    .maybeSingle()

  if (supplierErr) return NextResponse.json({ error: supplierErr.message }, { status: 500 })
  if (!supplier) return NextResponse.json({ error: "ספק לא נמצא" }, { status: 404 })

  const json = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Body לא תקין" },
      { status: 400 },
    )
  }

  const d = parsed.data

  const { data: created, error } = await supabase
    .from("erp_md_supplier_items")
    .insert({
      company_id: activeCompanyId,
      supplier_id: supplierId,
      item_id: d.itemId,
      supplier_sku: d.supplierSku ?? null,
      manufacturer_sku: d.manufacturerSku ?? null,
      manufacturer_name: d.manufacturerName ?? null,
      manufacturer_full_name: d.manufacturerFullName ?? null,
      lead_time_days: d.leadTimeDays ?? null,
      base_price: d.basePrice,
      discount_percentage: d.discountPercentage,
      currency: d.currency,
      uom: d.uom ?? null,
      valid_from: d.validFrom ?? null,
      valid_to: d.validTo ?? null,
      is_preferred: d.isPreferred,
    })
    .select(SELECT)
    .single()

  if (error) {
    // UNIQUE(company_id, item_id, supplier_id) violation
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "פריט זה כבר מוגדר אצל ספק זה" },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(
    { data: mapRow(created as unknown as Row) },
    { status: 201 },
  )
}
