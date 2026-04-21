import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  mapGoodsReceiptLineRow,
  normalizeRouteParams,
  requireProcurementApiContext,
} from "@/lib/erp/procurement-api"

const createLineSchema = z.object({
  purchaseOrderLineId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid(),
  budgetSubChapter: z.string().trim().min(1),
  resourceId: z.string().trim().min(1),
  description: z.string().trim().min(2),
  quantity: z.coerce.number().min(0),
  unitPrice: z.coerce.number().min(0),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: goodsReceiptId } = await normalizeRouteParams(params)
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { data, error } = await supabase
    .from("erp_goods_receipt_lines")
    .select("*")
    .eq("goods_receipt_id", goodsReceiptId)
    .eq("company_id", activeCompanyId)
    .order("created_at", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: (data ?? []).map(mapGoodsReceiptLineRow) })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: goodsReceiptId } = await normalizeRouteParams(params)
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const body = await req.json().catch(() => null)
  const parsed = createLineSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 })

  const { data, error } = await supabase
    .from("erp_goods_receipt_lines")
    .insert({
      company_id: activeCompanyId,
      goods_receipt_id: goodsReceiptId,
      purchase_order_line_id: parsed.data.purchaseOrderLineId ?? null,
      project_id: parsed.data.projectId,
      budget_sub_chapter: parsed.data.budgetSubChapter,
      resource_id: parsed.data.resourceId,
      description: parsed.data.description,
      quantity: parsed.data.quantity,
      unit_price: parsed.data.unitPrice,
    })
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: mapGoodsReceiptLineRow(data) }, { status: 201 })
}

