/**
 * `/api/master-data/items/[id]/purchase-history` — Phase 7.13.3.C
 *
 * GET — מחזיר את כל שורות ה-PO ההיסטוריות שמכילות את ה-master SKU המבוקש,
 * ממיין מהאחרונה לישנה. כולל metadata מהכותרת (PO number / supplier / status
 * / created_at) כדי שה-UI יוכל להציג טבלה משמעותית בלי round-trips נוספים.
 *
 * Tenant isolation דרך RLS על `erp_purchase_order_lines`.
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

const DEFAULT_LIMIT = 100

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

export type ItemPurchaseHistoryEntryDto = {
  lineId: string
  poId: string
  poNumber: string | null
  poStatus: string | null
  poCreatedAt: string | null
  poIssuedAt: string | null
  supplierId: string | null
  supplierName: string | null
  quantity: number
  unitPrice: number
  totalPrice: number
  currency: string | null
  discountPct: number | null
  priceSource: string | null
  priceDeviationPct: number | null
  manufacturerName: string | null
  supplyDate: string | null
}

type LineRow = {
  id: string
  purchase_order_id: string
  quantity: number | string
  unit_price: number | string
  total_price: number | string
  line_currency: string | null
  discount_pct: number | string | null
  price_source: string | null
  price_deviation_pct: number | string | null
  manufacturer_name: string | null
  supply_date: string | null
}

type HeaderRow = {
  id: string
  po_number: string | null
  status: string | null
  created_at: string
  issued_at: string | null
  supplier_id: string | null
  currency: string | null
}

type SupplierProfile = { id: string; name: string }

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0
  const n = typeof value === "string" ? Number(value) : value
  return Number.isFinite(n) ? n : 0
}

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

  // tenant ownership on master item
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

  // Lines (RLS handles company filter through the linked PO).
  const linesQuery = await supabase
    .from("erp_purchase_order_lines")
    .select(
      "id,purchase_order_id,quantity,unit_price,total_price,line_currency,discount_pct,price_source,price_deviation_pct,manufacturer_name,supply_date,created_at"
    )
    .eq("company_id", activeCompanyId)
    .eq("item_id", id)
    .order("created_at", { ascending: false })
    .limit(DEFAULT_LIMIT)
  if (linesQuery.error) {
    return NextResponse.json({ error: linesQuery.error.message }, { status: 500 })
  }

  const lines = (linesQuery.data ?? []) as (LineRow & { created_at: string })[]
  if (lines.length === 0) {
    return NextResponse.json({ data: [] })
  }

  // Headers in one round-trip.
  const poIds = Array.from(new Set(lines.map((l) => l.purchase_order_id)))
  const headersQuery = await supabase
    .from("erp_purchase_orders")
    .select("id,po_number,status,created_at,issued_at,supplier_id,currency")
    .in("id", poIds)
  if (headersQuery.error) {
    return NextResponse.json({ error: headersQuery.error.message }, { status: 500 })
  }
  const headerMap = new Map<string, HeaderRow>()
  for (const h of (headersQuery.data ?? []) as HeaderRow[]) {
    headerMap.set(h.id, h)
  }

  // Suppliers in one round-trip.
  const supplierIds = Array.from(
    new Set(
      Array.from(headerMap.values())
        .map((h) => h.supplier_id)
        .filter((x): x is string => Boolean(x))
    )
  )
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

  const dtos: ItemPurchaseHistoryEntryDto[] = lines.map((line) => {
    const header = headerMap.get(line.purchase_order_id)
    return {
      lineId: line.id,
      poId: line.purchase_order_id,
      poNumber: header?.po_number ?? null,
      poStatus: header?.status ?? null,
      poCreatedAt: header?.created_at ?? null,
      poIssuedAt: header?.issued_at ?? null,
      supplierId: header?.supplier_id ?? null,
      supplierName: header?.supplier_id
        ? supplierMap.get(header.supplier_id) ?? null
        : null,
      quantity: toNumber(line.quantity),
      unitPrice: toNumber(line.unit_price),
      totalPrice: toNumber(line.total_price),
      currency: line.line_currency ?? header?.currency ?? null,
      discountPct: toNumberOrNull(line.discount_pct),
      priceSource: line.price_source,
      priceDeviationPct: toNumberOrNull(line.price_deviation_pct),
      manufacturerName: line.manufacturer_name,
      supplyDate: line.supply_date,
    }
  })

  return NextResponse.json({ data: dtos })
}
