/**
 * `/api/master-data/items/[id]/suppliers` — Phase 7.14.3
 *
 * איחוד "ספקים של פריט" — מאחד שני מקורות נתונים שהיו עד כה מפוצלים:
 *
 *   1. `erp_md_supplier_items`          — pricing catalog (base_price, net_unit_price,
 *                                         discount, valid_from/to, is_preferred).
 *                                         נכתב ע"י: invoice-ai flow, ידני.
 *   2. `erp_md_supplier_item_mapping`   — semantic AI matching (confidence,
 *                                         matched_by_ai, verified_by_user,
 *                                         supplier_description, source_type).
 *                                         נכתב ע"י: Semantic Matcher (7.10.1).
 *
 * Merge Key: (company_id, supplier_id, supplier_sku). ב-SQL על שתי הטבלאות
 * יש unique constraint על המפתח הזה (active rows), כך שה-merge תמיד 1:1 או 1:0/0:1.
 *
 * פלט: רשימה מאוחדת עם `sources[]` discriminator המציין אילו מקורות תרמו
 * לכל שורה. שורה יכולה להיות:
 *   - pricing-only       — ספק מחיר ללא metadata AI (נכנס דרך הזנה ידנית)
 *   - mapping-only       — mapping AI ללא מחיר פעיל (נכנס דרך semantic matcher בלבד)
 *   - both               — שני המקורות נפגשו (המקרה ה-"בריא")
 *
 * Query params:
 *   - `?includeHistory=1` → כולל שורות ש-valid_to בעבר (inactive). ברירת מחדל: רק פעילים.
 *
 * הערת עיצוב: ה-merge מבוצע ב-TypeScript ולא ב-SQL view כי:
 *   • אין צורך ב-migration חדש (טוב לרולאאוט מדורג).
 *   • קל לבדוק ולהרחיב. ה-N קטן (מספר ספקים פר פריט = יחידות).
 *   • אם יתברר שהביצועים בעייתיים ב-items-comparison-grids → נמיר ל-SQL VIEW.
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string }

function normalizeParams(
  params: Promise<RouteParams> | RouteParams
): Promise<RouteParams> {
  return Promise.resolve(params)
}

// ─────────────────────────────────────────────
// DTO
// ─────────────────────────────────────────────

/** Phase 7.14.3 — שורת ספק מאוחדת לפריט, מאגדת pricing + AI metadata במקום אחד. */
export type UnifiedSupplierRowDto = {
  /** לצרכי React keys. Prefix מציין מאיזה מקור ה-ID. */
  rowKey: string
  /** אילו מקורות תרמו לשורה הזאת. `both` = הגיע מ-2 טבלאות; אחרת שם אחד. */
  sources: Array<"pricing" | "mapping">

  // ── Identity ──
  supplierId: string
  supplierName: string | null
  supplierSku: string

  // ── IDs for edit operations ──
  supplierItemId: string | null // erp_md_supplier_items.id (null אם mapping-only)
  mappingId: string | null // erp_md_supplier_item_mapping.id (null אם pricing-only)

  // ── Pricing (מועדף: erp_md_supplier_items. fallback: mapping.supplier_unit_price) ──
  unitPrice: number | null
  netUnitPrice: number | null // רק pricing — אחרי discount
  basePrice: number | null // רק pricing — לפני discount
  discountPercentage: number | null
  currency: string | null
  isPreferred: boolean | null

  // ── Mapping metadata (רק אם hasMapping) ──
  supplierDescription: string | null
  confidence: number | null
  matchedByAi: boolean
  verifiedByUser: boolean
  sourceType: string | null
  sourceReference: string | null
  modelProvider: string | null
  modelName: string | null

  // ── Common / logistics ──
  uom: string | null
  minQty: number | null
  leadTimeDays: number | null

  // ── Temporal ──
  validFrom: string | null
  validTo: string | null
  isActive: boolean

  createdAt: string | null
}

// ─────────────────────────────────────────────
// DB row shapes (raw supabase select)
// ─────────────────────────────────────────────

type PricingRow = {
  id: string
  supplier_id: string
  supplier_sku: string | null
  base_price: number | string
  discount_percentage: number | string
  net_unit_price: number | string | null
  currency: string | null
  uom: string | null
  is_preferred: boolean
  valid_from: string | null
  valid_to: string | null
  created_at: string | null
}

type MappingRow = {
  id: string
  supplier_id: string
  supplier_sku: string
  supplier_description: string | null
  supplier_unit_price: number | string | null
  supplier_currency: string | null
  supplier_uom: string | null
  supplier_min_qty: number | string | null
  supplier_lead_time_days: number | null
  confidence: number | string | null
  matched_by_ai: boolean
  verified_by_user: boolean
  valid_from: string
  valid_to: string | null
  source_type: string | null
  source_reference: string | null
  model_provider: string | null
  model_name: string | null
  created_at: string
}

type SupplierProfile = { id: string; name: string }

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value == null) return null
  const n = typeof value === "string" ? Number(value) : value
  return Number.isFinite(n) ? n : null
}

function isActiveDate(
  validFrom: string | null,
  validTo: string | null
): boolean {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  if (validFrom && validFrom > today) return false
  if (validTo && validTo < today) return false
  return true
}

/** Merge key מבוסס (supplier_id + supplier_sku). null/empty SKU → fallback ייחודי לפי ID. */
function mergeKey(supplierId: string, supplierSku: string | null): string {
  return `${supplierId}||${(supplierSku ?? "").trim()}`
}

// ─────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id } = await normalizeParams(params)

  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  // Tenant ownership על הפריט. אם ה-client מנסה פריט של חברה אחרת → 404.
  const itemCheck = await supabase
    .from("erp_md_items")
    .select("id")
    .eq("id", id)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (itemCheck.error) {
    return NextResponse.json({ error: itemCheck.error.message }, { status: 500 })
  }
  if (!itemCheck.data) {
    return NextResponse.json({ error: "פריט לא נמצא" }, { status: 404 })
  }

  const includeHistory = req.nextUrl.searchParams.get("includeHistory") === "1"

  // שאילתות מקבילות לשני מקורות + פרופילי ספקים. 3 round-trips → 1 wave.
  const pricingQuery = supabase
    .from("erp_md_supplier_items")
    .select(
      "id,supplier_id,supplier_sku,base_price,discount_percentage,net_unit_price,currency,uom,is_preferred,valid_from,valid_to,created_at"
    )
    .eq("company_id", activeCompanyId)
    .eq("item_id", id)
    .order("is_preferred", { ascending: false })
    .order("created_at", { ascending: false })

  let mappingQuery = supabase
    .from("erp_md_supplier_item_mapping")
    .select(
      "id,supplier_id,supplier_sku,supplier_description,supplier_unit_price,supplier_currency,supplier_uom,supplier_min_qty,supplier_lead_time_days,confidence,matched_by_ai,verified_by_user,valid_from,valid_to,source_type,source_reference,model_provider,model_name,created_at"
    )
    .eq("company_id", activeCompanyId)
    .eq("master_item_id", id)
    .order("valid_from", { ascending: false })

  if (!includeHistory) {
    // pricing table: valid_to = null OR future. history flag: include כל ה-valid_to בעבר גם.
    // mapping table: valid_to = null = active (pattern פשוט יותר שם).
    mappingQuery = mappingQuery.is("valid_to", null)
  }

  const [pricingResult, mappingResult] = await Promise.all([
    pricingQuery,
    mappingQuery,
  ])

  if (pricingResult.error) {
    return NextResponse.json(
      { error: `pricing: ${pricingResult.error.message}` },
      { status: 500 }
    )
  }
  if (mappingResult.error) {
    return NextResponse.json(
      { error: `mapping: ${mappingResult.error.message}` },
      { status: 500 }
    )
  }

  const pricingRows = (pricingResult.data ?? []) as PricingRow[]
  const mappingRows = (mappingResult.data ?? []) as MappingRow[]

  // ── סינון אקטיבי ברמת pricing (SQL לא מאפשר OR מורכב כאן בלי RPC) ──
  const pricingFiltered = includeHistory
    ? pricingRows
    : pricingRows.filter((r) => isActiveDate(r.valid_from, r.valid_to))

  // שם הספק פעם אחת לכל supplier_id שמופיע.
  const supplierIds = new Set<string>()
  for (const r of pricingFiltered) supplierIds.add(r.supplier_id)
  for (const r of mappingRows) supplierIds.add(r.supplier_id)

  const supplierMap = new Map<string, string>()
  if (supplierIds.size > 0) {
    const { data: suppliers, error: supplierError } = await supabase
      .from("erp_md_suppliers")
      .select("id,name")
      .in("id", Array.from(supplierIds))
    if (supplierError) {
      return NextResponse.json(
        { error: `suppliers: ${supplierError.message}` },
        { status: 500 }
      )
    }
    for (const s of (suppliers ?? []) as SupplierProfile[]) {
      supplierMap.set(s.id, s.name)
    }
  }

  // ── MERGE לפי (supplier_id + supplier_sku) ──
  const byKey = new Map<
    string,
    { pricing: PricingRow | null; mapping: MappingRow | null }
  >()

  for (const p of pricingFiltered) {
    const k = mergeKey(p.supplier_id, p.supplier_sku)
    const slot = byKey.get(k) ?? { pricing: null, mapping: null }
    // אם יש כבר pricing בשורה הזאת, נשמור את הקודם (העליון ב-ORDER BY — is_preferred ואז created_at).
    if (!slot.pricing) slot.pricing = p
    byKey.set(k, slot)
  }
  for (const m of mappingRows) {
    const k = mergeKey(m.supplier_id, m.supplier_sku)
    const slot = byKey.get(k) ?? { pricing: null, mapping: null }
    if (!slot.mapping) slot.mapping = m
    byKey.set(k, slot)
  }

  // ── לבנות DTOs ──
  const dtos: UnifiedSupplierRowDto[] = []
  for (const [key, { pricing, mapping }] of byKey) {
    const supplierId = pricing?.supplier_id ?? mapping?.supplier_id ?? ""
    const supplierSku = pricing?.supplier_sku ?? mapping?.supplier_sku ?? ""
    const sources: Array<"pricing" | "mapping"> = []
    if (pricing) sources.push("pricing")
    if (mapping) sources.push("mapping")

    // מחיר: מעדיף pricing.net_unit_price. fallback ל-mapping.supplier_unit_price.
    const netFromPricing = toNumberOrNull(pricing?.net_unit_price ?? null)
    const priceFromMapping = toNumberOrNull(mapping?.supplier_unit_price ?? null)
    const unitPrice = netFromPricing ?? priceFromMapping

    // UoM: pricing > mapping.
    const uom = pricing?.uom ?? mapping?.supplier_uom ?? null

    // Currency: pricing > mapping.
    const currency = pricing?.currency ?? mapping?.supplier_currency ?? null

    // validFrom/To: pricing אם יש, אחרת mapping.
    const validFrom = pricing?.valid_from ?? mapping?.valid_from ?? null
    const validTo = pricing?.valid_to ?? mapping?.valid_to ?? null

    dtos.push({
      rowKey: pricing ? `pricing:${pricing.id}` : `mapping:${mapping!.id}`,
      sources,
      supplierId,
      supplierName: supplierMap.get(supplierId) ?? null,
      supplierSku,
      supplierItemId: pricing?.id ?? null,
      mappingId: mapping?.id ?? null,
      unitPrice,
      netUnitPrice: netFromPricing,
      basePrice: toNumberOrNull(pricing?.base_price ?? null),
      discountPercentage: toNumberOrNull(pricing?.discount_percentage ?? null),
      currency,
      isPreferred: pricing?.is_preferred ?? null,
      supplierDescription: mapping?.supplier_description ?? null,
      confidence: toNumberOrNull(mapping?.confidence ?? null),
      matchedByAi: Boolean(mapping?.matched_by_ai),
      verifiedByUser: Boolean(mapping?.verified_by_user),
      sourceType: mapping?.source_type ?? null,
      sourceReference: mapping?.source_reference ?? null,
      modelProvider: mapping?.model_provider ?? null,
      modelName: mapping?.model_name ?? null,
      uom,
      minQty: toNumberOrNull(mapping?.supplier_min_qty ?? null),
      leadTimeDays: mapping?.supplier_lead_time_days ?? null,
      validFrom,
      validTo,
      isActive: isActiveDate(validFrom, validTo),
      createdAt: pricing?.created_at ?? mapping?.created_at ?? null,
    })

    // `key` לא בשימוש אחרי היצירה — שומר למקרה של debug.
    void key
  }

  // מיון: preferred קודם, אחרי זה לפי netPrice עולה (זול=בראש), ואז לפי שם.
  dtos.sort((a, b) => {
    if (a.isPreferred !== b.isPreferred) {
      return a.isPreferred ? -1 : 1
    }
    const ap = a.netUnitPrice ?? a.unitPrice ?? Number.POSITIVE_INFINITY
    const bp = b.netUnitPrice ?? b.unitPrice ?? Number.POSITIVE_INFINITY
    if (ap !== bp) return ap - bp
    return (a.supplierName ?? "").localeCompare(b.supplierName ?? "", "he")
  })

  return NextResponse.json({ data: dtos })
}
