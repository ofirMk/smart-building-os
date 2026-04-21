import { type NextRequest, NextResponse } from "next/server"

import {
  requireMasterDataApiContext,
  sanitizeOptionalString,
} from "@/lib/erp/master-data-api"

type ItemCreateBody = {
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

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ITEM_STATUSES = new Set([
  "ACTIVE",
  "INACTIVE",
  "PURCHASE_ONLY",
  "INTERNAL_ONLY",
  "OBSOLETE",
])

function normalizeItemStatus(value: unknown): string {
  const status = sanitizeOptionalString(value)?.toUpperCase()
  if (status && ITEM_STATUSES.has(status)) return status
  return "ACTIVE"
}

function normalizeMinOrderQuantity(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  return 1
}

export async function GET(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const q = sanitizeOptionalString(req.nextUrl.searchParams.get("q"))
  let query = supabase
    .from("erp_md_items")
    .select("id,company_id,item_number,description,foreign_description,unit_of_measure,product_family_id,is_inventory_managed,status,min_order_quantity,item_type,budget_sub_chapter,resource_id,budget_sub_chapter_manual_override,resource_id_manual_override")
    .eq("company_id", activeCompanyId)
    .order("item_number", { ascending: true })
  if (q) query = query.or(`item_number.ilike.%${q}%,description.ilike.%${q}%`)

  const [itemsResult, familiesResult] = await Promise.all([
    query,
    supabase
      .from("erp_md_product_families")
      .select("id,family_code,name,default_budget_sub_chapter,default_resource_id")
      .eq("company_id", activeCompanyId),
  ])
  if (itemsResult.error || familiesResult.error) {
    return NextResponse.json(
      { error: itemsResult.error?.message ?? familiesResult.error?.message ?? "Query failed" },
      { status: 500 }
    )
  }

  const familyMap = new Map(
    (familiesResult.data ?? []).map((family) => [
      family.id,
      {
        id: family.id,
        familyCode: family.family_code,
        familyName: family.name,
        defaultBudgetSubChapter: family.default_budget_sub_chapter,
        defaultResourceId: family.default_resource_id,
      },
    ])
  )
  return NextResponse.json({
    data: (itemsResult.data ?? []).map((row) => ({
      id: row.id,
      companyId: row.company_id,
      sku: row.item_number,
      itemNumber: row.item_number,
      description: row.description,
      foreignDescription: row.foreign_description,
      uom: row.unit_of_measure,
      unitOfMeasure: row.unit_of_measure,
      productFamilyId: row.product_family_id,
      isInventoryManaged: row.is_inventory_managed,
      status: row.status,
      minOrderQuantity: Number(row.min_order_quantity ?? 1),
      itemType: row.item_type,
      budgetSubChapter: row.budget_sub_chapter,
      resourceId: row.resource_id,
      budgetSubChapterManualOverride: row.budget_sub_chapter_manual_override,
      resourceIdManualOverride: row.resource_id_manual_override,
      productFamily: familyMap.get(row.product_family_id) ?? null,
    })),
  })
}

export async function POST(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const body = (await req.json().catch(() => null)) as ItemCreateBody | null
  const sku = sanitizeOptionalString(body?.sku) ?? sanitizeOptionalString(body?.itemNumber)
  const description = sanitizeOptionalString(body?.description)
  const uom = sanitizeOptionalString(body?.uom) ?? sanitizeOptionalString(body?.unitOfMeasure)
  const productFamilyId = sanitizeOptionalString(body?.productFamilyId)
  const isInventoryManaged = body?.isInventoryManaged === true
  const foreignDescription = sanitizeOptionalString(body?.foreignDescription)
  const status = normalizeItemStatus(body?.status)
  const minOrderQuantity = normalizeMinOrderQuantity(body?.minOrderQuantity)
  const itemType = sanitizeOptionalString(body?.itemType)?.toUpperCase() || "R"
  const budgetSubChapter = sanitizeOptionalString(body?.budgetSubChapter)
  const resourceId = sanitizeOptionalString(body?.resourceId)
  const budgetSubChapterManualOverride = body?.budgetSubChapterManualOverride === true
  const resourceIdManualOverride = body?.resourceIdManualOverride === true
  if (!sku || !description || !uom || !productFamilyId) {
    return NextResponse.json(
      { error: "sku, description, uom and productFamilyId are required" },
      { status: 400 }
    )
  }

  const familyLookup = await supabase
    .from("erp_md_product_families")
    .select("id,family_code,name,default_budget_sub_chapter,default_resource_id")
    .eq("id", productFamilyId)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (familyLookup.error || !familyLookup.data) {
    return NextResponse.json(
      { error: familyLookup.error?.message ?? "Invalid productFamilyId for active company" },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("erp_md_items")
    .insert({
      company_id: activeCompanyId,
      item_number: sku,
      description,
      unit_of_measure: uom,
      product_family_id: productFamilyId,
      is_inventory_managed: isInventoryManaged,
      foreign_description: foreignDescription,
      status,
      min_order_quantity: minOrderQuantity,
      item_type: itemType,
      budget_sub_chapter: budgetSubChapter,
      resource_id: resourceId,
      budget_sub_chapter_manual_override: budgetSubChapterManualOverride,
      resource_id_manual_override: resourceIdManualOverride,
    })
    .select("id,company_id,item_number,description,foreign_description,unit_of_measure,product_family_id,is_inventory_managed,status,min_order_quantity,item_type,budget_sub_chapter,resource_id,budget_sub_chapter_manual_override,resource_id_manual_override")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json(
    {
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
        productFamily: {
          id: familyLookup.data.id,
          familyCode: familyLookup.data.family_code,
          familyName: familyLookup.data.name,
          defaultBudgetSubChapter: familyLookup.data.default_budget_sub_chapter,
          defaultResourceId: familyLookup.data.default_resource_id,
        },
      },
    },
    { status: 201 }
  )
}
