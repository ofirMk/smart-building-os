/**
 * Holden ERP — רכש ומלאי (מבנה public.erp_*)
 */

export type ErpCurrencyRow = {
  code: string
  name: string
  created_at: string
  updated_at: string
}

export type ErpUomRow = {
  code: string
  name: string
  english_name: string
  created_at: string
  updated_at: string
}

export type ErpItemFamilyRow = {
  code: string
  name: string
  created_at: string
  updated_at: string
}

/** Master item — פריט (מק״ט) כולל שדות MDM מ- Priority / מילון נתונים */
export type ErpItemRow = {
  sku: string
  description: string
  family_code: string
  uom_code: string
  base_price: number
  currency_code: string
  is_active: boolean
  status_he: string | null
  part_type: string | null
  is_inventory_managed: boolean | null
  abc_classification: string | null
  primary_supplier_sku: string | null
  standard_cost_ils: number | null
  lead_time_days: number | null
  default_warehouse: string | null
  created_at: string
  updated_at: string
}

export type ErpSupplierItemRow = {
  id: string
  supplier_id: string
  internal_sku: string
  supplier_sku: string
  supplier_item_description: string
  created_at: string
  updated_at: string
}

export type ErpSupplierPriceListRow = {
  id: string
  supplier_id: string
  price_list_code: string
  item_sku: string
  price: number
  currency_code: string
  discount_pct: number
  valid_from: string
  valid_to: string | null
  created_at: string
  updated_at: string
}

/** תוצאת מנוע מחיר — ספק זול ביותר לפי מחירון בתוקף */
export type CheapestSupplierForItem = {
  supplierId: string
  supplierName: string | null
  priceListRowId: string
  itemSku: string
  listPrice: number
  discountPct: number
  netUnitPrice: number
  currencyCode: string
  priceListCode: string
}
