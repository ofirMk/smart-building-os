/**
 * `/api/master-data/items/[id]/supplier-mappings` — Phase 7.13.3.B
 *
 * GET — מחזיר את ה-supplier↔master mappings ב-`erp_md_supplier_item_mapping`
 * עבור ה-master SKU המבוקש. ברירת מחדל: רק mappings אקטיביים (valid_to=null);
 * ניתן להוסיף `?includeHistory=1` כדי לראות גם expired.
 *
 * ה-Tenant isolation מתבצע ע"י RLS policy על הטבלה (Phase 7.4.5).
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
// DTOs
// ─────────────────────────────────────────────

export type SupplierMappingDto = {
  id: string
  supplierId: string
  supplierName: string | null
  supplierSku: string
  supplierDescription: string | null
  unitPrice: number | null
  currency: string | null
  uom: string | null
  minQty: number | null
  leadTimeDays: number | null
  confidence: number | null
  matchedByAi: boolean
  verifiedByUser: boolean
  validFrom: string
  validTo: string | null
  sourceType: string | null
  sourceReference: string | null
  modelProvider: string | null
  modelName: string | null
  createdAt: string
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

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value == null) return null
  const n = typeof value === "string" ? Number(value) : value
  return Number.isFinite(n) ? n : null
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

  // tenant ownership check on the master item
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

  let query = supabase
    .from("erp_md_supplier_item_mapping")
    .select(
      "id,supplier_id,supplier_sku,supplier_description,supplier_unit_price,supplier_currency,supplier_uom,supplier_min_qty,supplier_lead_time_days,confidence,matched_by_ai,verified_by_user,valid_from,valid_to,source_type,source_reference,model_provider,model_name,created_at"
    )
    .eq("company_id", activeCompanyId)
    .eq("master_item_id", id)
    .order("valid_from", { ascending: false })

  if (!includeHistory) {
    query = query.is("valid_to", null)
  }

  const { data: mappingData, error: mappingError } = await query
  if (mappingError) {
    return NextResponse.json({ error: mappingError.message }, { status: 500 })
  }

  const mappings = (mappingData ?? []) as MappingRow[]

  // Resolve supplier names in one round-trip.
  const supplierIds = Array.from(new Set(mappings.map((m) => m.supplier_id)))
  const supplierMap = new Map<string, string>()
  if (supplierIds.length > 0) {
    const { data: suppliers } = await supabase
      .from("erp_md_suppliers")
      .select("id,name")
      .in("id", supplierIds)
    if (suppliers) {
      for (const s of suppliers as SupplierProfile[]) {
        supplierMap.set(s.id, s.name)
      }
    }
  }

  const dtos: SupplierMappingDto[] = mappings.map((row) => ({
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: supplierMap.get(row.supplier_id) ?? null,
    supplierSku: row.supplier_sku,
    supplierDescription: row.supplier_description,
    unitPrice: toNumberOrNull(row.supplier_unit_price),
    currency: row.supplier_currency,
    uom: row.supplier_uom,
    minQty: toNumberOrNull(row.supplier_min_qty),
    leadTimeDays: row.supplier_lead_time_days,
    confidence: toNumberOrNull(row.confidence),
    matchedByAi: Boolean(row.matched_by_ai),
    verifiedByUser: Boolean(row.verified_by_user),
    validFrom: row.valid_from,
    validTo: row.valid_to,
    sourceType: row.source_type,
    sourceReference: row.source_reference,
    modelProvider: row.model_provider,
    modelName: row.model_name,
    createdAt: row.created_at,
  }))

  return NextResponse.json({ data: dtos })
}
