import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"

const schema = z.object({
  itemId: z.string().uuid(),
  supplierId: z.string().uuid(),
  quantity: z.coerce.number().min(0),
  date: z.string().optional(),
})

type EffectivePriceRow = {
  unit_price: number
  price_source: string
  is_agreed_price: boolean
  price_list_id: string | null
  blanket_purchase_order_line_id: string | null
  applied_min_quantity: number | null
  warning_code: string | null
  warning_message: string | null
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase } = gate.ctx

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }

  const date =
    parsed.data.date && Number.isFinite(Date.parse(parsed.data.date))
      ? parsed.data.date.slice(0, 10)
      : new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase.rpc("erp_get_effective_price", {
    p_item_id: parsed.data.itemId,
    p_supplier_id: parsed.data.supplierId,
    p_quantity: parsed.data.quantity,
    p_date: date,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const row = ((data ?? [])[0] ?? null) as EffectivePriceRow | null
  if (!row) {
    return NextResponse.json({
      data: {
        unitPrice: 0,
        source: "FALLBACK",
        isAgreedPrice: false,
        priceListId: null,
        blanketPurchaseOrderLineId: null,
        appliedMinQuantity: null,
        warningCode: "NO_RESULT",
        warningMessage: "No pricing row returned from RPC.",
      },
    })
  }

  return NextResponse.json({
    data: {
      unitPrice: Number(row.unit_price ?? 0),
      source: row.price_source ?? "FALLBACK",
      isAgreedPrice: row.is_agreed_price === true,
      priceListId: row.price_list_id,
      blanketPurchaseOrderLineId: row.blanket_purchase_order_line_id,
      appliedMinQuantity:
        row.applied_min_quantity === null ? null : Number(row.applied_min_quantity),
      warningCode: row.warning_code,
      warningMessage: row.warning_message,
    },
  })
}
