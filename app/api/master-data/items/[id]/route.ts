import { type NextRequest, NextResponse } from "next/server"

import {
  requireMasterDataApiContext,
  sanitizeDecimalString,
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
  // alias מודרני של foreignDescription (Phase 7.13.4).
  descriptionEn?: unknown
  status?: unknown
  minOrderQuantity?: unknown
  itemType?: unknown
  budgetSubChapter?: unknown
  resourceId?: unknown
  budgetSubChapterManualOverride?: unknown
  resourceIdManualOverride?: unknown
  internalSku?: unknown
  skuAliases?: unknown
  uomNormalized?: unknown
  uomSourceText?: unknown
  aiMetadata?: unknown
  ocrMatchTokens?: unknown
  legacyDefaultPrice?: unknown
  legacyLastPrice?: unknown
  // ── Phase 7.13.4 Logistics Enrichment ──
  barcode?: unknown
  isSerialTracked?: unknown
  standardCost?: unknown
  purchasingUom?: unknown
  imageUrl?: unknown
  // שדות יחידת-מידה/מחיר/המרה הקיימים מאפשרים עדכון גם דרך ניהול מלא.
  factoryUom?: unknown
  conversionFactor?: unknown
  preferredSupplierId?: unknown
  defaultPrice?: unknown
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

function normalizeOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => sanitizeOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry))
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

async function loadItem(req: NextRequest, id: string) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate
  const { supabase, activeCompanyId } = gate.ctx

  // קוראים במקביל: הפריט + רשימת יחידות מידה (גלובלי + פרטי לחברה) — כדי להשניק תיאורי עברי של
  // יחידת הבסיס ויחידת הקנייה דרך קוד (uomDescription / purchasingUomDescription).
  const [itemResult, uomsResult, pricingResult] = await Promise.all([
    supabase
      .from("erp_md_items")
      .select("id,company_id,item_number,description,foreign_description,unit_of_measure,product_family_id,is_inventory_managed,status,min_order_quantity,item_type,budget_sub_chapter,resource_id,budget_sub_chapter_manual_override,resource_id_manual_override,internal_sku,sku_aliases,uom_normalized,uom_source_text,ai_metadata,ocr_match_tokens,legacy_default_price,legacy_last_price,factory_uom,conversion_factor,preferred_supplier_id,default_price,barcode,is_serial_tracked,standard_cost,purchasing_uom,image_url")
      .eq("id", id)
      .eq("company_id", activeCompanyId)
      .maybeSingle(),
    supabase
      .from("units_of_measure")
      .select("code,description_he,name_en,company_id")
      .or(`company_id.is.null,company_id.eq.${activeCompanyId}`),
    // Phase 7.14.2 — Resolved pricing (single-row lookup על ה-VIEW).
    supabase
      .from("erp_md_items_resolved_pricing")
      .select("preferred_unit_price,preferred_currency,cheapest_supplier_id,cheapest_unit_price,cheapest_currency,resolved_unit_price,resolved_price_source,resolved_supplier_id,resolved_currency,preferred_is_optimal,preferred_premium,active_supplier_count")
      .eq("item_id", id)
      .eq("company_id", activeCompanyId)
      .maybeSingle(),
  ])
  const { data, error } = itemResult
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

  // דה-דופ UOM לפי code: פרטי-חברה גובר על גלובלי (אותה תבנית כמו ב-list route).
  const uomMap = new Map<string, { descriptionHe: string; nameEn: string }>()
  for (const row of uomsResult.data ?? []) {
    const existing = uomMap.get(row.code)
    if (!existing || row.company_id !== null) {
      uomMap.set(row.code, {
        descriptionHe: row.description_he,
        nameEn: row.name_en,
      })
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
      // alias מודרני של foreign_description (Phase 7.13.4).
      descriptionEn: data.foreign_description,
      uom: data.unit_of_measure,
      unitOfMeasure: data.unit_of_measure,
      uomDescription:
        (data.unit_of_measure && uomMap.get(data.unit_of_measure)?.descriptionHe) ??
        data.unit_of_measure ??
        null,
      uomNameEn:
        (data.unit_of_measure && uomMap.get(data.unit_of_measure)?.nameEn) ?? null,
      productFamilyId: data.product_family_id,
      isInventoryManaged: data.is_inventory_managed,
      status: data.status,
      minOrderQuantity: Number(data.min_order_quantity ?? 1),
      itemType: data.item_type,
      budgetSubChapter: data.budget_sub_chapter,
      resourceId: data.resource_id,
      budgetSubChapterManualOverride: data.budget_sub_chapter_manual_override,
      resourceIdManualOverride: data.resource_id_manual_override,
      internalSku: data.internal_sku,
      skuAliases: data.sku_aliases ?? [],
      uomNormalized: data.uom_normalized,
      uomSourceText: data.uom_source_text,
      aiMetadata: data.ai_metadata ?? {},
      ocrMatchTokens: data.ocr_match_tokens ?? [],
      legacyDefaultPrice:
        data.legacy_default_price === null ? null : Number(data.legacy_default_price),
      legacyLastPrice: data.legacy_last_price === null ? null : Number(data.legacy_last_price),
      factoryUom: data.factory_uom,
      conversionFactor:
        data.conversion_factor === null ? null : Number(data.conversion_factor),
      preferredSupplierId: data.preferred_supplier_id,
      defaultPrice: data.default_price === null ? null : Number(data.default_price),
      // ── Phase 7.14.2 — Resolved Pricing ──
      preferredUnitPrice:
        pricingResult.data?.preferred_unit_price == null
          ? null
          : Number(pricingResult.data.preferred_unit_price),
      preferredCurrency: pricingResult.data?.preferred_currency ?? null,
      cheapestSupplierId: pricingResult.data?.cheapest_supplier_id ?? null,
      cheapestUnitPrice:
        pricingResult.data?.cheapest_unit_price == null
          ? null
          : Number(pricingResult.data.cheapest_unit_price),
      cheapestCurrency: pricingResult.data?.cheapest_currency ?? null,
      resolvedUnitPrice:
        pricingResult.data?.resolved_unit_price == null
          ? null
          : Number(pricingResult.data.resolved_unit_price),
      resolvedPriceSource:
        (pricingResult.data?.resolved_price_source as
          | "preferred"
          | "cheapest"
          | "none") ?? "none",
      resolvedSupplierId: pricingResult.data?.resolved_supplier_id ?? null,
      resolvedCurrency: pricingResult.data?.resolved_currency ?? null,
      preferredIsOptimal: pricingResult.data?.preferred_is_optimal ?? null,
      preferredPremium:
        pricingResult.data?.preferred_premium == null
          ? null
          : Number(pricingResult.data.preferred_premium),
      activeSupplierCount: Number(pricingResult.data?.active_supplier_count ?? 0),
      // ── Phase 7.13.4 Logistics Enrichment ──
      barcode: data.barcode,
      isSerialTracked: data.is_serial_tracked,
      standardCost:
        data.standard_cost === null ? null : Number(data.standard_cost),
      purchasingUom: data.purchasing_uom,
      purchasingUomDescription:
        (data.purchasing_uom && uomMap.get(data.purchasing_uom)?.descriptionHe) ??
        data.purchasing_uom ??
        null,
      imageUrl: data.image_url,
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
  const patch: Record<string, string | boolean | number | string[] | Record<string, unknown> | null> =
    {}
  const sku = sanitizeOptionalString(body?.sku) ?? sanitizeOptionalString(body?.itemNumber)
  const description = sanitizeOptionalString(body?.description)
  const uom = sanitizeOptionalString(body?.uom) ?? sanitizeOptionalString(body?.unitOfMeasure)
  const productFamilyId = sanitizeOptionalString(body?.productFamilyId)
  // הערה: ראה את ההערה ב-POST. שלושה זוגות עמודות NOT NULL חיים במקביל בטבלה
  // (item_number+sku, unit_of_measure+uom, product_family_id+family_id) וכולן
  // חייבות להישאר עקביות זו עם זו אחרי כל UPDATE.
  if (sku) {
    patch.item_number = sku
    patch.sku = sku
  }
  if (description) patch.description = description
  if (uom) {
    patch.unit_of_measure = uom
    patch.uom = uom
  }
  // foreign_description מתקבל תחת שני שמות: foreignDescription (legacy) ו-descriptionEn (חדש, Phase 7.13.4).
  // אם נשלחו שניהם — `descriptionEn` גובר. שימוש explicit undefined-check כדי להשאיר את ה-UPDATE
  // partial: שדה שלא נשלח לא יעודכן ל-null בטעות.
  const descriptionEnProvided = body?.descriptionEn !== undefined
  const foreignDescriptionProvided = body?.foreignDescription !== undefined
  if (descriptionEnProvided || foreignDescriptionProvided) {
    const foreignDescription = descriptionEnProvided
      ? sanitizeOptionalString(body?.descriptionEn)
      : sanitizeOptionalString(body?.foreignDescription)
    patch.foreign_description = foreignDescription ?? null
  }
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
  if (body?.internalSku !== undefined) {
    patch.internal_sku = sanitizeOptionalString(body.internalSku) ?? null
  }
  if (body?.skuAliases !== undefined) {
    patch.sku_aliases = normalizeStringArray(body.skuAliases)
  }
  if (body?.uomNormalized !== undefined) {
    patch.uom_normalized = sanitizeOptionalString(body.uomNormalized) ?? null
  }
  if (body?.uomSourceText !== undefined) {
    patch.uom_source_text = sanitizeOptionalString(body.uomSourceText) ?? null
  }
  if (body?.aiMetadata !== undefined) {
    patch.ai_metadata = normalizeJsonObject(body.aiMetadata)
  }
  if (body?.ocrMatchTokens !== undefined) {
    patch.ocr_match_tokens = normalizeStringArray(body.ocrMatchTokens)
  }
  if (body?.legacyDefaultPrice !== undefined) {
    patch.legacy_default_price = normalizeOptionalNumber(body.legacyDefaultPrice)
  }
  if (body?.legacyLastPrice !== undefined) {
    patch.legacy_last_price = normalizeOptionalNumber(body.legacyLastPrice)
  }
  // ── Phase 7.13.4 Logistics Enrichment ──
  if (body?.barcode !== undefined) {
    patch.barcode = sanitizeOptionalString(body.barcode) ?? null
  }
  if (body?.isSerialTracked !== undefined) {
    patch.is_serial_tracked = body.isSerialTracked === true
  }
  if (body?.standardCost !== undefined) {
    // FP-safe: string numeric, עד 4 ספרות עשרוניות, לא שלילי. פסול → לא מעדכן (שומר ערך קיים).
    const parsed = sanitizeDecimalString(body.standardCost, {
      maxDecimals: 4,
      minValueInclusive: 0,
    })
    if (parsed !== null) patch.standard_cost = parsed
  }
  if (body?.purchasingUom !== undefined) {
    patch.purchasing_uom = sanitizeOptionalString(body.purchasingUom) ?? null
  }
  if (body?.imageUrl !== undefined) {
    patch.image_url = sanitizeOptionalString(body.imageUrl) ?? null
  }
  // ── שדות יחידת-מידה/מחיר/המרה קיימים — תמיכה מלאה ל-PUT (צריך לעריכת פריט קיים) ──
  if (body?.factoryUom !== undefined) {
    patch.factory_uom = sanitizeOptionalString(body.factoryUom) ?? null
  }
  if (body?.conversionFactor !== undefined) {
    const parsed = sanitizeDecimalString(body.conversionFactor, {
      maxDecimals: 4,
      minValueExclusive: 0,
    })
    if (parsed !== null) patch.conversion_factor = parsed
  }
  if (body?.preferredSupplierId !== undefined) {
    patch.preferred_supplier_id = sanitizeOptionalString(body.preferredSupplierId) ?? null
  }
  if (body?.defaultPrice !== undefined) {
    const parsed = sanitizeDecimalString(body.defaultPrice, {
      maxDecimals: 4,
      minValueInclusive: 0,
    })
    patch.default_price = parsed
  }
  if (productFamilyId) {
    patch.product_family_id = productFamilyId
    patch.family_id = productFamilyId
  }
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
