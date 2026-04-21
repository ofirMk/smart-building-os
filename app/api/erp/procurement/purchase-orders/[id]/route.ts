import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  mapPurchaseOrderRow,
  normalizeRouteParams,
  requireProcurementApiContext,
} from "@/lib/erp/procurement-api"
import {
  PENDING_PRICE_APPROVAL_STATUS,
  PRICE_OVERRIDE_EVENT,
  isPriceCeilingExceeded,
  resolveEffectivePrice,
} from "@/lib/erp/price-ceiling"

const updatePurchaseOrderSchema = z.object({
  title: z.string().trim().min(2).optional(),
  notes: z.string().trim().nullable().optional(),
  issuedAt: z.string().trim().nullable().optional(),
  status: z.enum(["DRAFT", "PENDING_PRICE_APPROVAL", "APPROVED", "SENT", "CLOSED", "CANCELLED"]).optional(),
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
    .from("erp_purchase_orders")
    .select("*")
    .eq("id", id)
    .eq("company_id", activeCompanyId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 })
  return NextResponse.json({ data: mapPurchaseOrderRow(data) })
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
  const parsed = updatePurchaseOrderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 })
  }

  const patch: Record<string, string | null> = {}
  if (parsed.data.title !== undefined) patch.title = parsed.data.title
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes
  if (parsed.data.issuedAt !== undefined) patch.issued_at = parsed.data.issuedAt
  if (parsed.data.status !== undefined) patch.status = parsed.data.status
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields supplied" }, { status: 400 })
  }

  if (parsed.data.status === "APPROVED" || parsed.data.status === "SENT") {
    const pendingOverride = await supabase
      .from("erp_purchase_orders")
      .select("id,price_override_status")
      .eq("id", id)
      .eq("company_id", activeCompanyId)
      .maybeSingle()
    if (pendingOverride.error) {
      return NextResponse.json({ error: pendingOverride.error.message }, { status: 500 })
    }
    if (pendingOverride.data?.price_override_status === "REQUESTED") {
      return NextResponse.json(
        {
          error: "לא ניתן לקדם הזמנה כאשר חריגת מחיר ממתינה לאישור",
          code: "PRICE_OVERRIDE_PENDING",
        },
        { status: 409 }
      )
    }
  }

  if (parsed.data.status === "APPROVED") {
    const poWithLines = await supabase
      .from("erp_purchase_orders")
      .select("id,supplier_id,issued_at,status,project_id,po_number,erp_purchase_order_lines(id,item_sku,quantity,unit_price)")
      .eq("id", id)
      .eq("company_id", activeCompanyId)
      .maybeSingle()
    if (poWithLines.error) return NextResponse.json({ error: poWithLines.error.message }, { status: 500 })
    if (!poWithLines.data) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 })

    const lines = (poWithLines.data.erp_purchase_order_lines ?? []) as Array<{
      id: string
      item_sku: string | null
      quantity: number | null
      unit_price: number | null
    }>
    const skus = Array.from(new Set(lines.map((line) => line.item_sku).filter((sku): sku is string => Boolean(sku))))
    let itemIdBySku = new Map<string, string>()
    if (skus.length > 0) {
      const itemLookup = await supabase
        .from("erp_md_items")
        .select("id,item_number")
        .eq("company_id", activeCompanyId)
        .in("item_number", skus)
      if (itemLookup.error) return NextResponse.json({ error: itemLookup.error.message }, { status: 500 })
      itemIdBySku = new Map((itemLookup.data ?? []).map((row: any) => [row.item_number as string, row.id as string]))
    }

    for (const line of lines) {
      if (!line.item_sku) continue
      const itemId = itemIdBySku.get(line.item_sku)
      if (!itemId) continue
      const effective = await resolveEffectivePrice({
        supabase,
        companyId: activeCompanyId,
        itemId,
        supplierId: poWithLines.data.supplier_id,
        quantity: Number(line.quantity ?? 0),
        date: (poWithLines.data.issued_at as string | null) ?? new Date().toISOString().slice(0, 10),
      })
      const enteredPrice = Number(line.unit_price ?? 0)
      if (isPriceCeilingExceeded({ enteredPrice, effectivePrice: effective.effectivePrice })) {
        await supabase
          .from("erp_purchase_orders")
          .update({
            status: PENDING_PRICE_APPROVAL_STATUS,
            price_override_status: "REQUESTED",
          })
          .eq("id", id)
          .eq("company_id", activeCompanyId)
        await supabase.from("erp_procurement_status_events").insert({
          company_id: activeCompanyId,
          entity_type: "PURCHASE_ORDER",
          entity_id: id,
          from_status: poWithLines.data.status,
          to_status: PENDING_PRICE_APPROVAL_STATUS,
          action_name: PRICE_OVERRIDE_EVENT,
        })
        return NextResponse.json(
          {
            error: "Cannot approve PO with price above effective agreed price; manager approval required.",
            code: "PRICE_OVERRIDE_REQUIRED",
            data: {
              lineId: line.id,
              enteredPrice,
              effectivePrice: effective.effectivePrice,
              effectiveSource: effective.source,
            },
          },
          { status: 409 }
        )
      }
    }
  }

  const { error } = await supabase
    .from("erp_purchase_orders")
    .update(patch)
    .eq("id", id)
    .eq("company_id", activeCompanyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const loaded = await supabase
    .from("erp_purchase_orders")
    .select("*")
    .eq("id", id)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (loaded.error) return NextResponse.json({ error: loaded.error.message }, { status: 500 })
  if (!loaded.data) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 })

  return NextResponse.json({ data: mapPurchaseOrderRow(loaded.data) })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeRouteParams(params)
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { data, error } = await supabase
    .from("erp_purchase_orders")
    .delete()
    .select("id")
    .eq("id", id)
    .eq("company_id", activeCompanyId)
    .eq("status", "DRAFT")
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) {
    return NextResponse.json(
      { error: "Only DRAFT purchase orders can be deleted" },
      { status: 409 }
    )
  }
  return NextResponse.json({ ok: true })
}

