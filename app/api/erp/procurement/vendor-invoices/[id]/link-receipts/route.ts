/* eslint-disable @typescript-eslint/no-explicit-any -- TODO(tech-debt): refactor DB row types; tracked for Sprint 3 cleanup. */
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { normalizeRouteParams, requireProcurementApiContext } from "@/lib/erp/procurement-api"

const linkReceiptsSchema = z.object({
  goodsReceiptIds: z.array(z.string().uuid()).min(1),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: invoiceId } = await normalizeRouteParams(params)
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { data, error } = await supabase
    .from("erp_vendor_invoice_receipts")
    .select("goods_receipt_id")
    .eq("vendor_invoice_id", invoiceId)
    .eq("company_id", activeCompanyId)
    .order("created_at", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: (data ?? []).map((row: any) => row.goods_receipt_id) })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: invoiceId } = await normalizeRouteParams(params)
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const body = await req.json().catch(() => null)
  const parsed = linkReceiptsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 })

  const existingDelete = await supabase
    .from("erp_vendor_invoice_receipts")
    .delete()
    .eq("vendor_invoice_id", invoiceId)
    .eq("company_id", activeCompanyId)
  if (existingDelete.error) return NextResponse.json({ error: existingDelete.error.message }, { status: 500 })

  const insertRows = parsed.data.goodsReceiptIds.map((goodsReceiptId) => ({
    company_id: activeCompanyId,
    vendor_invoice_id: invoiceId,
    goods_receipt_id: goodsReceiptId,
  }))
  const inserted = await supabase.from("erp_vendor_invoice_receipts").insert(insertRows)
  if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 400 })

  const variance = await supabase.rpc("erp_recalculate_invoice_variance", {
    p_company_id: activeCompanyId,
    p_invoice_id: invoiceId,
  })
  if (variance.error) return NextResponse.json({ error: variance.error.message }, { status: 500 })

  return NextResponse.json({ ok: true, variance: variance.data })
}

