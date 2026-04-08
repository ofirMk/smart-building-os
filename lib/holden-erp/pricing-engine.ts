import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type { CheapestSupplierForItem } from "@/types/holden-procurement"

function roundMoney(n: number): number {
  return Math.round(n * 10000) / 10000
}

function netUnitPrice(price: number, discountPct: number): number {
  const p = Number(price) || 0
  const d = Math.min(100, Math.max(0, Number(discountPct) || 0))
  return roundMoney(p * (1 - d / 100))
}

/**
 * מחזיר את ההצעה הזולה ביותר לפי שורות `erp_supplier_price_lists` בתוקף (לפי תאריך UTC היום).
 * מחיר נטו = מחיר רשימה אחרי הנחה באחוזים.
 */
export async function getCheapestSupplierForItem(
  sku: string
): Promise<CheapestSupplierForItem | null> {
  const itemSku = sku?.trim()
  if (!itemSku) return null

  const supabase = await createSupabaseServerAuthClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data: rows, error } = await supabase
    .from("erp_supplier_price_lists")
    .select(
      "id, supplier_id, price_list_code, item_sku, price, currency_code, discount_pct, valid_from, valid_to"
    )
    .eq("item_sku", itemSku)
    .lte("valid_from", today)
    .or(`valid_to.is.null,valid_to.gte.${today}`)

  if (error || !rows?.length) return null

  type Row = {
    id: string
    supplier_id: string
    price_list_code: string
    item_sku: string
    price: number
    currency_code: string
    discount_pct: number
  }

  let best: { row: Row; net: number } | null = null
  for (const raw of rows as Row[]) {
    const net = netUnitPrice(raw.price, raw.discount_pct)
    if (!best || net < best.net) {
      best = { row: raw, net }
    }
  }

  if (!best) return null

  const r = best.row
  const { data: ent } = await supabase
    .from("entities")
    .select("name")
    .eq("id", r.supplier_id)
    .maybeSingle()

  return {
    supplierId: r.supplier_id,
    supplierName: ent?.name != null ? String(ent.name) : null,
    priceListRowId: r.id,
    itemSku: r.item_sku,
    listPrice: Number(r.price) || 0,
    discountPct: Number(r.discount_pct) || 0,
    netUnitPrice: best.net,
    currencyCode: r.currency_code,
    priceListCode: r.price_list_code,
  }
}
