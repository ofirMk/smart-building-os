import { z } from "zod"

/** Single GR line — mirrors approved PO line + received qty for this receipt */
export const goodsReceiptLineSchema = z.object({
  sku: z.string().min(1),
  itemName: z.string().min(1),
  orderedQty: z.number().nonnegative(),
  receivedQty: z.number(),
})

export type GoodsReceiptLineInput = z.infer<typeof goodsReceiptLineSchema>

export const goodsReceiptFormSchema = z.object({
  /** Selected PO id (from mock / future API) */
  poNumber: z.string().min(1, "נא לבחור הזמנת רכש"),
  deliveryNoteNumber: z
    .string()
    .min(1, "חובה להזין מספר תעודת משלוח")
    .transform((s) => s.trim()),
  /** HTML `input[type=date]` value (yyyy-mm-dd) */
  receiptDate: z.string().min(1, "נא לבחור תאריך קליטה"),
  lines: z.array(goodsReceiptLineSchema).min(1, "אין שורות לקליטה"),
})

export type GoodsReceiptFormInput = z.input<typeof goodsReceiptFormSchema>
export type GoodsReceiptFormOutput = z.output<typeof goodsReceiptFormSchema>

export type GoodsReceiptMockPoLine = {
  sku: string
  itemName: string
  orderedQty: number
}

export type GoodsReceiptMockPurchaseOrder = {
  id: string
  label: string
  lines: GoodsReceiptMockPoLine[]
}

/**
 * Phase 2.2 — mock open POs for קליטת סחורה (GR).
 * Primary demo: PO-10042 — כבלי מתח עיר היין · כהן חשמל
 */
export const GOODS_RECEIPT_MOCK_PURCHASE_ORDERS: GoodsReceiptMockPurchaseOrder[] = [
  {
    id: "po-10042",
    label: "PO-10042: כבלי מתח עיר היין - ספק: כהן חשמל",
    lines: [
      {
        sku: "MO-CAB-NYY-3x2.5",
        itemName: "כבל NYY 3×2.5 מ״מ — סליל 100 מ׳",
        orderedQty: 100,
      },
      {
        sku: "MO-CAB-NYY-5x4",
        itemName: "כבל NYY 5×4 מ״מ — סליל 100 מ׳",
        orderedQty: 100,
      },
      {
        sku: "MO-MCB-C16-1P",
        itemName: "מפסק אוטומטי חד-פאזי 16A — יח׳",
        orderedQty: 5,
      },
      {
        sku: "MO-BOX-2G-DP",
        itemName: "קופסת שקע כפולה + מסגרת — יח׳",
        orderedQty: 12,
      },
    ],
  },
  {
    id: "po-10088",
    label: "PO-10088: ציוד הידוק יבוא - ספק: א.מ. ברגים בע״מ",
    lines: [
      {
        sku: "MO-BOLT-M16-80",
        itemName: "בורג הידוק ‎M16×80 דגם A4 — יח׳",
        orderedQty: 240,
      },
      {
        sku: "MO-WASH-50",
        itemName: "דיסקית מייצבת ‎50 מ״מ — יח׳",
        orderedQty: 480,
      },
      {
        sku: "MO-NUT-M12-GV",
        itemName: "אומים מגולוונים ‎M12 — יח׳",
        orderedQty: 96,
      },
    ],
  },
]

export function getGoodsReceiptMockPoById(
  id: string
): GoodsReceiptMockPurchaseOrder | undefined {
  return GOODS_RECEIPT_MOCK_PURCHASE_ORDERS.find((p) => p.id === id)
}

export function defaultGoodsReceiptValues(
  poId: string = GOODS_RECEIPT_MOCK_PURCHASE_ORDERS[0]?.id ?? ""
): GoodsReceiptFormInput {
  const po = getGoodsReceiptMockPoById(poId) ?? GOODS_RECEIPT_MOCK_PURCHASE_ORDERS[0]
  const today = new Date().toISOString().slice(0, 10)
  return {
    poNumber: po?.id ?? "",
    deliveryNoteNumber: "",
    receiptDate: today,
    lines:
      po?.lines.map((l) => ({
        sku: l.sku,
        itemName: l.itemName,
        orderedQty: l.orderedQty,
        receivedQty: 0,
      })) ?? [],
  }
}
