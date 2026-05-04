/**
 * `/api/master-data/suppliers/[id]/price-list` — Phase 9.2
 *
 * GET — מחזיר את רשימת **הפריטים** של ספק עם המחיר שלו (ה-flat
 * pricing model הקיים אצלנו, לא header-based כמו ב-Priority).
 *
 * זה data source של ה-tab "מחירונים" במסך Supplier Master/Detail.
 * MVP מציג את הצד הבסיסי: מק"ט + תאור + מחיר. (Priority מציג גם
 * "מחיר ללקוח" — markup שלא קיים אצלנו עדיין; ראה Batch #6 תמונה #27).
 *
 * מקורות נתונים
 *   `erp_md_supplier_items` — pricing הראשי (base_price, net_unit_price,
 *   discount, valid_from/to, is_preferred). זה המקבילה הישירה ביותר
 *   ל-"מחירוני ספק" של Priority. ה-mapping table (`erp_md_supplier_item_mapping`)
 *   נתעלם ממנו כאן — הוא רלוונטי בעיקר ל-AI matching ב-tab "ספקים" של פריט.
 */

import { type NextRequest, NextResponse } from "next/server"
import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeParams(
  params: Promise<{ id: string }> | { id: string },
): Promise<{ id: string }> {
  return Promise.resolve(params)
}

export type SupplierPriceLineDto = {
  id: string
  itemId: string | null
  supplierSku: string | null
  itemSku: string | null
  itemDescription: string | null
  basePrice: number | null
  netUnitPrice: number | null
  discountPct: number | null
  currency: string | null
  uom: string | null
  isPreferred: boolean
  validFrom: string | null
  validTo: string | null
}

type Row = {
  id: string
  item_id: string | null
  supplier_sku: string | null
  base_price: number | string | null
  net_unit_price: number | string | null
  discount_percentage: number | string | null
  currency: string | null
  uom: string | null
  is_preferred: boolean
  valid_from: string | null
  valid_to: string | null
  item:
    | { sku: string | null; description: string | null }
    | { sku: string | null; description: string | null }[]
    | null
}

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function toNumberOrNull(v: number | string | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === "string" ? Number(v) : v
  return Number.isFinite(n) ? n : null
}

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
    .select(
      [
        "id,item_id,supplier_sku,base_price,net_unit_price,discount_percentage,currency,uom,is_preferred,valid_from,valid_to",
        "item:erp_md_items!erp_md_supplier_items_company_item_fk(sku,description)",
      ].join(","),
    )
    .eq("company_id", activeCompanyId)
    .eq("supplier_id", supplierId)
    .order("is_preferred", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const dto: SupplierPriceLineDto[] = ((data ?? []) as unknown as Row[]).map((r) => {
    const item = pickOne(r.item)
    return {
      id: r.id,
      itemId: r.item_id,
      supplierSku: r.supplier_sku,
      itemSku: item?.sku ?? null,
      itemDescription: item?.description ?? null,
      basePrice: toNumberOrNull(r.base_price),
      netUnitPrice: toNumberOrNull(r.net_unit_price),
      discountPct: toNumberOrNull(r.discount_percentage),
      currency: r.currency,
      uom: r.uom,
      isPreferred: r.is_preferred,
      validFrom: r.valid_from,
      validTo: r.valid_to,
    }
  })

  return NextResponse.json({ data: dto })
}
