/** Server action payloads — `lib/holden-erp/procurement-actions.ts` */

export type ProcurementLineInput = {
  partId: string
  quantity: number
  unitPrice: number
  uomId: string
}

export type SaveDraftPurchaseOrderInput = {
  poId: string | null
  projectId: string
  masterSupplierId: string
  orderDate?: string
  lines: ProcurementLineInput[]
}

export type ReceiveGoodsLineInput = {
  purchaseOrderLineId: string
  quantityReceived: number
}

export type ReceiveGoodsInput = {
  poId: string
  receiptDate: string
  warehouseLocation: string
  lines: ReceiveGoodsLineInput[]
  idempotencyKey?: string | null
  deliveryNoteImageUrl?: string | null
  verificationNotes?: string | null
}

/** תוצאת `getCheapestSupplierForItem` — מנוע תמחור רשימות מחירים */
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
