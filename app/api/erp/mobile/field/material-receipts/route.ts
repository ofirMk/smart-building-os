import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  assertMobileProjectAccess,
  requireMobileFieldApiContext,
} from "@/lib/erp/mobile-field-api"

const createMaterialReceiptSchema = z.object({
  projectId: z.string().uuid(),
  purchaseOrderId: z.string().uuid(),
  purchaseOrderLineId: z.string().uuid(),
  receivedQty: z.coerce.number().min(0.001),
  note: z.string().trim().max(500).optional().nullable(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const ctx = await requireMobileFieldApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId, userId, siteManagerOnly } = ctx

  const body = await req.json().catch(() => null)
  const parsed = createMaterialReceiptSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }

  const access = await assertMobileProjectAccess({
    supabase,
    activeCompanyId,
    projectId: parsed.data.projectId,
    userId,
    siteManagerOnly,
  })
  if (!access.ok) return access.response

  const poLine = await supabase
    .from("erp_purchase_order_lines")
    .select("id,purchase_order_id,project_id,item_sku,unit_price,description")
    .eq("company_id", activeCompanyId)
    .eq("id", parsed.data.purchaseOrderLineId)
    .eq("purchase_order_id", parsed.data.purchaseOrderId)
    .eq("project_id", parsed.data.projectId)
    .maybeSingle()
  if (poLine.error) {
    return NextResponse.json({ error: poLine.error.message }, { status: 500 })
  }
  if (!poLine.data) {
    return NextResponse.json(
      { error: "PO line not found for active company/project" },
      { status: 404 }
    )
  }

  const receipt = await supabase
    .from("erp_field_material_receipts")
    .insert({
      company_id: activeCompanyId,
      project_id: parsed.data.projectId,
      purchase_order_id: parsed.data.purchaseOrderId,
      purchase_order_line_id: parsed.data.purchaseOrderLineId,
      received_qty: parsed.data.receivedQty,
      receipt_note: parsed.data.note ?? null,
      received_by_user_id: userId,
    })
    .select("id")
    .single()
  if (receipt.error) {
    return NextResponse.json({ error: receipt.error.message }, { status: 500 })
  }

  const movement = await supabase
    .from("erp_inventory_movements")
    .insert({
      company_id: activeCompanyId,
      project_id: parsed.data.projectId,
      movement_type: "IN",
      source_type: "PO_RECEIPT",
      source_id: parsed.data.purchaseOrderId,
      source_line_id: parsed.data.purchaseOrderLineId,
      item_sku: poLine.data.item_sku ?? null,
      quantity: parsed.data.receivedQty,
      unit_cost: Number(poLine.data.unit_price ?? 0),
      note:
        parsed.data.note ??
        `Receipt from PO line ${poLine.data.description ?? parsed.data.purchaseOrderLineId}`,
      moved_by_user_id: userId,
    })
    .select("id,total_value")
    .single()
  if (movement.error) {
    return NextResponse.json({ error: movement.error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      receiptId: String(receipt.data.id),
      movementId: String(movement.data.id),
      totalValue: Number(movement.data.total_value ?? 0),
    },
  })
}
