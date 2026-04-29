import { type NextRequest, NextResponse } from "next/server"

import {
  requireMasterDataApiContext,
  sanitizeDecimalString,
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
  internalSku?: unknown
  skuAliases?: unknown
  uomNormalized?: unknown
  uomSourceText?: unknown
  aiMetadata?: unknown
  ocrMatchTokens?: unknown
  legacyDefaultPrice?: unknown
  legacyLastPrice?: unknown
  factoryUom?: unknown
  conversionFactor?: unknown
  preferredSupplierId?: unknown
  defaultPrice?: unknown
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

export async function GET(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const q = sanitizeOptionalString(req.nextUrl.searchParams.get("q"))
  let query = supabase
    .from("erp_md_items")
    .select("id,company_id,item_number,description,foreign_description,unit_of_measure,product_family_id,is_inventory_managed,status,min_order_quantity,item_type,budget_sub_chapter,resource_id,budget_sub_chapter_manual_override,resource_id_manual_override,internal_sku,sku_aliases,uom_normalized,uom_source_text,ai_metadata,ocr_match_tokens,legacy_default_price,legacy_last_price,factory_uom,conversion_factor,preferred_supplier_id,default_price")
    .eq("company_id", activeCompanyId)
    .order("item_number", { ascending: true })
  if (q) query = query.or(`item_number.ilike.%${q}%,description.ilike.%${q}%`)

  // טעינה מקבילה: פריטים, משפחות מוצר ויחידות מידה. ל-UOM יש מודל היברידי
  // (גלובלי `company_id IS NULL` + ספציפי לחברה) — כאן אני קורא את שניהם ולאחר
  // מכן מחבר ל-Map לפי `code` עם דה-דופ (פרטי-לחברה גובר על גלובלי), כדי שהטבלה
  // תציג תיאור עברית קריא במקום קוד יבש.
  const [itemsResult, familiesResult, uomsResult] = await Promise.all([
    query,
    supabase
      .from("erp_md_product_families")
      .select("id,family_code,name,default_budget_sub_chapter,default_resource_id")
      .eq("company_id", activeCompanyId),
    supabase
      .from("units_of_measure")
      .select("code,description_he,name_en,company_id")
      .or(`company_id.is.null,company_id.eq.${activeCompanyId}`),
  ])
  if (itemsResult.error || familiesResult.error || uomsResult.error) {
    return NextResponse.json(
      {
        error:
          itemsResult.error?.message ??
          familiesResult.error?.message ??
          uomsResult.error?.message ??
          "Query failed",
      },
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

  // דה-דופ UOM לפי code: אם יש גם רשומה גלובלית וגם ספציפית-לחברה — האחרונה גוברת.
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
      internalSku: row.internal_sku,
      skuAliases: row.sku_aliases ?? [],
      uomNormalized: row.uom_normalized,
      uomSourceText: row.uom_source_text,
      aiMetadata: row.ai_metadata ?? {},
      ocrMatchTokens: row.ocr_match_tokens ?? [],
      legacyDefaultPrice:
        row.legacy_default_price === null ? null : Number(row.legacy_default_price),
      legacyLastPrice: row.legacy_last_price === null ? null : Number(row.legacy_last_price),
      factoryUom: row.factory_uom,
      conversionFactor:
        row.conversion_factor === null ? null : Number(row.conversion_factor),
      preferredSupplierId: row.preferred_supplier_id,
      defaultPrice: row.default_price === null ? null : Number(row.default_price),
      productFamily: familyMap.get(row.product_family_id) ?? null,
      // תיאור עברי + שם אנגלי של יחידת המידה — fallback לקוד עצמו אם אין רשומה במאפר.
      uomDescription:
        (row.unit_of_measure && uomMap.get(row.unit_of_measure)?.descriptionHe) ??
        row.unit_of_measure ??
        null,
      uomNameEn:
        (row.unit_of_measure && uomMap.get(row.unit_of_measure)?.nameEn) ?? null,
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
  const internalSku = sanitizeOptionalString(body?.internalSku)
  const skuAliases = normalizeStringArray(body?.skuAliases)
  const uomNormalized = sanitizeOptionalString(body?.uomNormalized)
  const uomSourceText = sanitizeOptionalString(body?.uomSourceText)
  const aiMetadata = normalizeJsonObject(body?.aiMetadata)
  const ocrMatchTokens = normalizeStringArray(body?.ocrMatchTokens)
  const legacyDefaultPrice = normalizeOptionalNumber(body?.legacyDefaultPrice)
  const legacyLastPrice = normalizeOptionalNumber(body?.legacyLastPrice)
  const factoryUom = sanitizeOptionalString(body?.factoryUom)
  // FP-safe: שומרים שעור המרה ומחיר כ-string בפורמט numeric. אין roundtrip דרך JS Number.
  // שגיאת קלט (לא מספר תקני, יותר מ-4 ספרות עשרוניות, אפס/שלילי) → null → ברירת מחדל "1".
  const conversionFactorRaw = sanitizeDecimalString(body?.conversionFactor, {
    maxDecimals: 4,
    minValueExclusive: 0,
  })
  const conversionFactor: string = conversionFactorRaw ?? "1"
  const preferredSupplierId = sanitizeOptionalString(body?.preferredSupplierId)
  // מחיר: עד 4 ספרות אחרי הנקודה, לא שלילי. null אם לא נשלח/לא תקין.
  const defaultPrice: string | null = sanitizeDecimalString(body?.defaultPrice, {
    maxDecimals: 4,
    minValueInclusive: 0,
  })
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

  // הערה: הטבלה מחזיקה שלושה זוגות עמודות NOT NULL ממיגרציות מתלכדות:
  //   • item_number (legacy varchar) + sku (modern text)
  //   • unit_of_measure (legacy varchar) + uom (modern text)
  //   • product_family_id (legacy uuid) + family_id (modern uuid)
  // מתאימים את כולן באותו הערך לקלט ID מהלקוח (זהה לטיפולו של product-families
  // שמזין family_code + code).
  const { data, error } = await supabase
    .from("erp_md_items")
    .insert({
      company_id: activeCompanyId,
      item_number: sku,
      sku,
      description,
      unit_of_measure: uom,
      uom,
      product_family_id: productFamilyId,
      family_id: productFamilyId,
      is_inventory_managed: isInventoryManaged,
      foreign_description: foreignDescription,
      status,
      min_order_quantity: minOrderQuantity,
      item_type: itemType,
      budget_sub_chapter: budgetSubChapter,
      resource_id: resourceId,
      budget_sub_chapter_manual_override: budgetSubChapterManualOverride,
      resource_id_manual_override: resourceIdManualOverride,
      internal_sku: internalSku,
      sku_aliases: skuAliases,
      uom_normalized: uomNormalized,
      uom_source_text: uomSourceText,
      ai_metadata: aiMetadata,
      ocr_match_tokens: ocrMatchTokens,
      legacy_default_price: legacyDefaultPrice ?? defaultPrice,
      legacy_last_price: legacyLastPrice,
      factory_uom: factoryUom,
      conversion_factor: conversionFactor,
      preferred_supplier_id: preferredSupplierId,
      default_price: defaultPrice ?? (legacyDefaultPrice === null ? null : String(legacyDefaultPrice)),
    })
    .select("id,company_id,item_number,description,foreign_description,unit_of_measure,product_family_id,is_inventory_managed,status,min_order_quantity,item_type,budget_sub_chapter,resource_id,budget_sub_chapter_manual_override,resource_id_manual_override,internal_sku,sku_aliases,uom_normalized,uom_source_text,ai_metadata,ocr_match_tokens,legacy_default_price,legacy_last_price,factory_uom,conversion_factor,preferred_supplier_id,default_price")
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
        defaultPrice:
          data.default_price === null ? null : Number(data.default_price),
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
