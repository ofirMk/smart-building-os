import { type NextRequest, NextResponse } from "next/server"

import {
  requireMasterDataApiContext,
  sanitizeOptionalString,
} from "@/lib/erp/master-data-api"

type ItemUpdateBody = {
  sku?: unknown
  itemNumber?: unknown
  description?: unknown
  uom?: unknown
  unitOfMeasure?: unknown
  productFamilyId?: unknown
  isInventoryManaged?: unknown
  foreignDescription?: unknown
  status?: unknown
  minOrderQuantity?: unknown
  itemType?: unknown
  budgetSubChapter?: unknown
  resourceId?: unknown
  budgetSubChapterManualOverride?: unknown
  resourceIdManualOverride?: unknown
}

function normalizeParams(
  params: Promise<{ id: string }> | { id: string }
): Promise<{ id: string }> {
  return Promise.resolve(params)
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ITEM_STATUSES = new Set([
  "ACTIVE",
  "INACTIVE",
  "PURCHASE_ONLY",
  "INTERNAL_ONLY",
  "OBSOLETE",
])

async function loadItem(req: NextRequest, id: string) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate
  const { supabase, activeCompanyId } = gate.ctx

  const { data, error } = await supabase
    .from("erp_md_items")
    .select("id,company_id,item_number,description,foreign_description,unit_of_measure,product_family_id,is_inventory_managed,status,min_order_quantity,item_type,budget_sub_chapter,resource_id,budget_sub_chapter_manual_override,resource_id_manual_override")
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
      response: NextResponse.json({ error: "Item not found" }, { status: 404 }),
    }
  }

  return {
    ok: true as const,
    data: {
      id: data.id,
      companyId: data.company_id,
      sku: data.item_number,
      itemNumber: data.item_number,
      description: data.description,
      foreignDescription: data.foreign_description,
      uom: data.unit_of_measure,
      unitOfMeasure: data.unit_of_measure,
      productFamilyId: data.product_family_id,
      isInventoryManaged: data.is_inventory_managed,
      status: data.status,
      minOrderQuantity: Number(data.min_order_quantity ?? 1),
      itemType: data.item_type,
      budgetSubChapter: data.budget_sub_chapter,
      resourceId: data.resource_id,
      budgetSubChapterManualOverride: data.budget_sub_chapter_manual_override,
      resourceIdManualOverride: data.resource_id_manual_override,
    },
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeParams(params)
  const loaded = await loadItem(req, id)
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

  const body = (await req.json().catch(() => null)) as ItemUpdateBody | null
  const patch: Record<string, string | boolean | number | null> = {}
  const sku = sanitizeOptionalString(body?.sku) ?? sanitizeOptionalString(body?.itemNumber)
  const description = sanitizeOptionalString(body?.description)
  const uom = sanitizeOptionalString(body?.uom) ?? sanitizeOptionalString(body?.unitOfMeasure)
  const productFamilyId = sanitizeOptionalString(body?.productFamilyId)
  if (sku) patch.item_number = sku
  if (description) patch.description = description
  if (uom) patch.unit_of_measure = uom
  const foreignDescription = sanitizeOptionalString(body?.foreignDescription)
  if (body?.foreignDescription !== undefined) patch.foreign_description = foreignDescription ?? null
  if (body?.isInventoryManaged !== undefined) {
    patch.is_inventory_managed = body.isInventoryManaged === true
  }
  const status = sanitizeOptionalString(body?.status)?.toUpperCase()
  if (status && ITEM_STATUSES.has(status)) patch.status = status
  if (body?.minOrderQuantity !== undefined) {
    const parsed = Number(body.minOrderQuantity)
    if (Number.isFinite(parsed) && parsed >= 0) patch.min_order_quantity = parsed
  }
  const itemType = sanitizeOptionalString(body?.itemType)?.toUpperCase()
  if (itemType && ["R", "P", "O", "S"].includes(itemType)) patch.item_type = itemType
  if (body?.budgetSubChapter !== undefined) {
    patch.budget_sub_chapter = sanitizeOptionalString(body?.budgetSubChapter) ?? null
  }
  if (body?.resourceId !== undefined) {
    patch.resource_id = sanitizeOptionalString(body?.resourceId) ?? null
  }
  if (body?.budgetSubChapterManualOverride !== undefined) {
    patch.budget_sub_chapter_manual_override = body.budgetSubChapterManualOverride === true
  }
  if (body?.resourceIdManualOverride !== undefined) {
    patch.resource_id_manual_override = body.resourceIdManualOverride === true
  }
  if (productFamilyId) patch.product_family_id = productFamilyId
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No valid fields supplied for update" },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from("erp_md_items")
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
    .from("erp_md_items")
    .delete()
    .eq("id", id)
    .eq("company_id", activeCompanyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
