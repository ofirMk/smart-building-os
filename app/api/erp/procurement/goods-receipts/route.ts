import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { mapGoodsReceiptRow, requireProcurementApiContext } from "@/lib/erp/procurement-api"

const createGoodsReceiptSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  grNumber: z.string().trim().min(1),
  receiptDate: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const status = req.nextUrl.searchParams.get("status")

  let query = supabase
    .from("erp_goods_receipts")
    .select("*")
    .eq("company_id", activeCompanyId)
    .order("created_at", { ascending: false })
  if (status) query = query.eq("status", status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: (data ?? []).map(mapGoodsReceiptRow) })
}

export async function POST(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const body = await req.json().catch(() => null)
  const parsed = createGoodsReceiptSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("erp_goods_receipts")
    .insert({
      company_id: activeCompanyId,
      purchase_order_id: parsed.data.purchaseOrderId,
      gr_number: parsed.data.grNumber,
      receipt_date: parsed.data.receiptDate ?? null,
      notes: parsed.data.notes ?? null,
      status: "DRAFT",
    })
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: mapGoodsReceiptRow(data) }, { status: 201 })
}

