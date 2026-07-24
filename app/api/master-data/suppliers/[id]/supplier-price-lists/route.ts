/**
 * `/api/master-data/suppliers/[id]/supplier-price-lists` — Priority parity
 *
 * GET — header-based מחירוני ספק list + items (if ?include=items).
 * POST — create new price list.
 */

import { type NextRequest, NextResponse } from "next/server"
import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"
import type { ErpSupplierPriceList, ErpSupplierPriceListItem } from "@/types/erp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeParams(
  params: Promise<{ id: string }> | { id: string },
): Promise<{ id: string }> {
  return Promise.resolve(params)
}

function mapItem(row: Record<string, unknown>): ErpSupplierPriceListItem {
  const unitPrice = Number(row.unit_price ?? 0)
  const discountPct = Number(row.discount_pct ?? 0)
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    priceListId: row.price_list_id as string,
    supplierPartCode: row.supplier_part_code as string,
    description: (row.description as string | null) ?? null,
    itemId: (row.item_id as string | null) ?? null,
    quantity: Number(row.quantity ?? 1),
    unitOfMeasure: (row.unit_of_measure as string | null) ?? null,
    unitPrice,
    discountPct,
    priceAfterDiscount: unitPrice * (1 - discountPct / 100),
    customerPrice: row.customer_price != null ? Number(row.customer_price) : null,
    sortOrder: (row.sort_order as number | null) ?? null,
  }
}

function mapPriceList(
  row: Record<string, unknown>,
  items?: ErpSupplierPriceListItem[],
): ErpSupplierPriceList {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    supplierId: row.supplier_id as string,
    priceListCode: row.price_list_code as string,
    description: (row.description as string | null) ?? null,
    validFrom: row.valid_from as string,
    currencyCode: (row.currency_code as string | null) ?? null,
    isCancelled: (row.is_cancelled as boolean) ?? false,
    quoteValidUntil: (row.quote_valid_until as string | null) ?? null,
    manufacturerName: (row.manufacturer_name as string | null) ?? null,
    manufacturerShort: (row.manufacturer_short as string | null) ?? null,
    priceMultiplier: row.price_multiplier != null ? Number(row.price_multiplier) : null,
    items,
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  const { id: supplierId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response

  const { supabase, activeCompanyId } = gate.ctx
  const includeItems = req.nextUrl.searchParams.get("include")?.includes("items")

  const { data, error } = await supabase
    .from("erp_supplier_price_lists")
    .select("*")
    .eq("company_id", activeCompanyId)
    .eq("supplier_id", supplierId)
    .order("valid_from", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!includeItems) {
    return NextResponse.json((data ?? []).map((r) => mapPriceList(r as Record<string, unknown>)))
  }

  // Fetch items for all price lists in one query
  const listIds = (data ?? []).map((r) => r.id)
  const itemMap: Record<string, ErpSupplierPriceListItem[]> = {}

  if (listIds.length > 0) {
    const { data: itemRows, error: itemsError } = await supabase
      .from("erp_md_supplier_pricelist_items")
      .select("*")
      .eq("company_id", activeCompanyId)
      .in("price_list_id", listIds)
      .order("sort_order", { ascending: true })

    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })

    for (const row of itemRows ?? []) {
      const listId = row.price_list_id as string
      if (!itemMap[listId]) itemMap[listId] = []
      itemMap[listId].push(mapItem(row as Record<string, unknown>))
    }
  }

  const result = (data ?? []).map((r) =>
    mapPriceList(r as Record<string, unknown>, itemMap[r.id] ?? []),
  )

  return NextResponse.json(result)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  const { id: supplierId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response

  const { supabase, activeCompanyId } = gate.ctx
  const body = await req.json()

  const { data, error } = await supabase
    .from("erp_md_supplier_pricelist_hdrs")
    .insert({
      company_id: activeCompanyId,
      supplier_id: supplierId,
      price_list_code: body.priceListCode,
      description: body.description ?? null,
      valid_from: body.validFrom,
      currency_code: body.currencyCode ?? null,
      is_cancelled: body.isCancelled ?? false,
      quote_valid_until: body.quoteValidUntil ?? null,
      manufacturer_name: body.manufacturerName ?? null,
      manufacturer_short: body.manufacturerShort ?? null,
      price_multiplier: body.priceMultiplier ?? null,
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 422 })

  return NextResponse.json(mapPriceList(data as Record<string, unknown>), { status: 201 })
}
