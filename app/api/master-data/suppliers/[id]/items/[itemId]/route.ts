/**
 * PUT    /api/master-data/suppliers/[id]/items/[itemId] — update pricing fields
 * DELETE /api/master-data/suppliers/[id]/items/[itemId] — remove product link
 *
 * `itemId` is the `erp_md_supplier_items.id` (UUID of the bridge row).
 * `net_unit_price` is generated-stored — never written directly.
 */

import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"
import type { SupplierItemDto } from "../route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ─────────────────────────────────────────────
// DB row (same shape as the parent route)
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
// Validation
// ─────────────────────────────────────────────

const updateSchema = z
  .object({
    supplierSku: z.string().trim().max(128).nullable().optional(),
    basePrice: z
      .number()
      .min(0, { message: "basePrice חייב להיות אי-שלילי" })
      .optional(),
    discountPercentage: z.number().min(0).max(100).optional(),
    currency: z
      .string()
      .trim()
      .length(3, { message: "currency חייב להיות 3 תווים" })
      .transform((v) => v.toUpperCase())
      .optional(),
    uom: z.string().trim().max(16).nullable().optional(),
    validFrom: z.string().nullable().optional(),
    validTo: z.string().nullable().optional(),
    isPreferred: z.boolean().optional(),
    manufacturerSku: z.string().trim().max(128).nullable().optional(),
    manufacturerName: z.string().trim().max(255).nullable().optional(),
    manufacturerFullName: z.string().trim().max(512).nullable().optional(),
    leadTimeDays: z.number().int().min(0).nullable().optional(),
  })
  .refine(
    (d) => {
      if (d.validFrom && d.validTo) return d.validTo >= d.validFrom
      return true
    },
    { message: "valid_to חייב להיות אחרי valid_from", path: ["validTo"] },
  )

// ─────────────────────────────────────────────
// Route helpers
// ─────────────────────────────────────────────

function normalizeParams(
  params: Promise<{ id: string; itemId: string }> | { id: string; itemId: string },
): Promise<{ id: string; itemId: string }> {
  return Promise.resolve(params)
}

// ─────────────────────────────────────────────
// PUT — update pricing fields
// ─────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> | { id: string; itemId: string } },
) {
  const { id: supplierId, itemId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const json = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Body לא תקין" },
      { status: 400 },
    )
  }

  const d = parsed.data
  const patch: Record<string, unknown> = {}

  if (d.supplierSku !== undefined) patch.supplier_sku = d.supplierSku ?? null
  if (d.manufacturerSku !== undefined) patch.manufacturer_sku = d.manufacturerSku ?? null
  if (d.manufacturerName !== undefined) patch.manufacturer_name = d.manufacturerName ?? null
  if (d.manufacturerFullName !== undefined) patch.manufacturer_full_name = d.manufacturerFullName ?? null
  if (d.leadTimeDays !== undefined) patch.lead_time_days = d.leadTimeDays ?? null
  if (d.basePrice !== undefined) patch.base_price = d.basePrice
  if (d.discountPercentage !== undefined) patch.discount_percentage = d.discountPercentage
  if (d.currency !== undefined) patch.currency = d.currency
  if (d.uom !== undefined) patch.uom = d.uom ?? null
  if (d.validFrom !== undefined) patch.valid_from = d.validFrom ?? null
  if (d.validTo !== undefined) patch.valid_to = d.validTo ?? null
  if (d.isPreferred !== undefined) patch.is_preferred = d.isPreferred

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "אין שדות לעדכון" }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from("erp_md_supplier_items")
    .update(patch)
    .eq("id", itemId)
    .eq("company_id", activeCompanyId)
    .eq("supplier_id", supplierId)
    .select(SELECT)
    .single()

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "פריט לא נמצא" }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data: mapRow(updated as unknown as Row) })
}

// ─────────────────────────────────────────────
// DELETE — remove product link from supplier
// ─────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> | { id: string; itemId: string } },
) {
  const { id: supplierId, itemId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(_req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const { error, count } = await supabase
    .from("erp_md_supplier_items")
    .delete({ count: "exact" })
    .eq("id", itemId)
    .eq("company_id", activeCompanyId)
    .eq("supplier_id", supplierId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (count === 0) return NextResponse.json({ error: "פריט לא נמצא" }, { status: 404 })

  return NextResponse.json({ ok: true })
}
