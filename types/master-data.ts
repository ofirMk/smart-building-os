/** Master Data — `currencies`, `units_of_measure`, `supplier_parts`, extended `suppliers` */

export type MasterDataCurrencyRow = {
  id: string
  code: string
  name_he: string
  symbol: string
  created_at: string
  updated_at: string
}

export type MasterDataUomRow = {
  id: string
  code: string
  description_he: string
  name_en: string
  created_at: string
  updated_at: string
}

export type MasterDataSupplierPartRow = {
  id: string
  supplier_id: string
  part_number_supplier: string
  manufacturer: string
  supplier_name_text: string
  description_32_chars: string
  description_48_chars: string
  created_at: string
  updated_at: string
  /** ברזל/בטון — דורש צילום תעודת משלוח */
  material_risk?: string
}

export type MasterDataSupplierV2Row = {
  id: string
  name: string
  supplier_type: string
  tax_id: string | null
  bank_details: Record<string, unknown>
  vat_status: string | null
  balance: number
  payment_term_code: string | null
  currency_id: string | null
  /** קישור ל־`entities` ליצירת הזמנות רכש */
  entity_id?: string | null
  created_at: string
  updated_at: string
}

export type ErpPaymentTermOption = {
  code: string
  description: string
}
