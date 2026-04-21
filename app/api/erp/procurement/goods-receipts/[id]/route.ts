import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  mapGoodsReceiptRow,
  normalizeRouteParams,
  requireProcurementApiContext,
} from "@/lib/erp/procurement-api"

const updateGoodsReceiptSchema = z.object({
  status: z.enum(["DRAFT", "FINAL"]).optional(),
  receiptDate: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeRouteParams(params)
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { data, error } = await supabase
    .from("erp_goods_receipts")
    .select("*")
    .eq("id", id)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Goods receipt not found" }, { status: 404 })
  return NextResponse.json({ data: mapGoodsReceiptRow(data) })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeRouteParams(params)
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const body = await req.json().catch(() => null)
  const parsed = updateGoodsReceiptSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 })

  const patch: Record<string, string | null> = {}
  if (parsed.data.status !== undefined) patch.status = parsed.data.status
  if (parsed.data.receiptDate !== undefined) patch.receipt_date = parsed.data.receiptDate
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No fields supplied" }, { status: 400 })

  const { error } = await supabase
    .from("erp_goods_receipts")
    .update(patch)
    .eq("id", id)
    .eq("company_id", activeCompanyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const loaded = await supabase
    .from("erp_goods_receipts")
    .select("*")
    .eq("id", id)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (loaded.error) return NextResponse.json({ error: loaded.error.message }, { status: 500 })
  if (!loaded.data) return NextResponse.json({ error: "Goods receipt not found" }, { status: 404 })
  return NextResponse.json({ data: mapGoodsReceiptRow(loaded.data) })
}

