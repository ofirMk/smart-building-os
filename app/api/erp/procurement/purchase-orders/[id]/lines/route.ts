import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  mapPurchaseOrderLineRow,
  normalizeRouteParams,
  requireProcurementApiContext,
} from "@/lib/erp/procurement-api"
import {
  PENDING_PRICE_APPROVAL_STATUS,
  PRICE_OVERRIDE_EVENT,
  enqueuePriceOverrideNotifications,
  isManagerRole,
  isPriceCeilingExceeded,
  logManagerPriceOverride,
  resolveEffectivePrice,
  validateEnteredPriceMax,
} from "@/lib/erp/price-ceiling"

const createLineSchema = z.object({
  itemId: z.string().uuid().optional(),
  projectId: z.string().uuid(),
  budgetSubChapter: z.string().trim().min(1),
  resourceId: z.string().trim().min(1),
  description: z.string().trim().min(2),
  quantity: z.coerce.number().min(0),
  unitPrice: z.coerce.number().min(0),
  requestManagerApproval: z.boolean().optional(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: purchaseOrderId } = await normalizeRouteParams(params)
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { data, error } = await supabase
    .from("erp_purchase_order_lines")
    .select("*")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("company_id", activeCompanyId)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: (data ?? []).map(mapPurchaseOrderLineRow) })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: purchaseOrderId } = await normalizeRouteParams(params)
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const body = await req.json().catch(() => null)
  const parsed = createLineSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 })
  }

  const poLookup = await supabase
    .from("erp_purchase_orders")
    .select("id,company_id,supplier_id,project_id,po_number,status,issued_at")
    .eq("id", purchaseOrderId)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (poLookup.error) {
    return NextResponse.json({ error: poLookup.error.message }, { status: 500 })
  }
  if (!poLookup.data) {
    return NextResponse.json({ error: "Purchase order not found for active company" }, { status: 404 })
  }

  let itemSku: string | null = null
  let effectivePrice = 0
  let effectiveSource = "FALLBACK"
  let managerOverrideApplied = false
  if (parsed.data.itemId) {
    const itemLookup = await supabase
      .from("erp_md_items")
      .select("id,item_number")
      .eq("id", parsed.data.itemId)
      .eq("company_id", activeCompanyId)
      .maybeSingle()
    if (itemLookup.error) {
      return NextResponse.json({ error: itemLookup.error.message }, { status: 500 })
    }
    if (!itemLookup.data) {
      return NextResponse.json({ error: "Item not found for active company" }, { status: 400 })
    }
    itemSku = itemLookup.data.item_number ?? null

    const effective = await resolveEffectivePrice({
      supabase,
      companyId: activeCompanyId,
      itemId: parsed.data.itemId,
      supplierId: poLookup.data.supplier_id,
      quantity: parsed.data.quantity,
      date: (poLookup.data.issued_at as string | null) ?? new Date().toISOString().slice(0, 10),
    })
    effectivePrice = effective.effectivePrice
    effectiveSource = effective.source

    if (isPriceCeilingExceeded({ enteredPrice: parsed.data.unitPrice, effectivePrice })) {
      const ceilingCheck = validateEnteredPriceMax(parsed.data.unitPrice, effectivePrice)
      const manager = isManagerRole(ctx.userRole)
      if (!manager || parsed.data.requestManagerApproval === true) {
        await supabase
          .from("erp_purchase_orders")
          .update({
            status: PENDING_PRICE_APPROVAL_STATUS,
            price_override_status: "REQUESTED",
          })
          .eq("id", purchaseOrderId)
          .eq("company_id", activeCompanyId)

        await supabase.from("erp_procurement_status_events").insert({
          company_id: activeCompanyId,
          entity_type: "PURCHASE_ORDER",
          entity_id: purchaseOrderId,
          from_status: poLookup.data.status,
          to_status: PENDING_PRICE_APPROVAL_STATUS,
          action_name: PRICE_OVERRIDE_EVENT,
        })

        await enqueuePriceOverrideNotifications({
          supabase,
          companyId: activeCompanyId,
          entityName: "erp_purchase_order",
          entityId: purchaseOrderId,
          projectId: poLookup.data.project_id,
          projectManagerId: null,
          title: "חריגת מחיר דורשת אישור",
          body: `PO ${poLookup.data.po_number} נחסם עקב חריגת מחיר וממתין לאישור`,
          payload: {
            purchaseOrderId,
            enteredPrice: parsed.data.unitPrice,
            effectivePrice,
            effectiveSource,
            zodIssue: ceilingCheck.success ? null : ceilingCheck.error.issues[0]?.message ?? null,
          },
        })

        return NextResponse.json(
          {
            error: "חריגת מחיר ממחירון מאושר",
            code: "PRICE_OVERRIDE_REQUIRED",
            data: {
              enteredPrice: parsed.data.unitPrice,
              effectivePrice,
              effectiveSource,
              nextStatus: PENDING_PRICE_APPROVAL_STATUS,
            },
          },
          { status: 409 }
        )
      }

      await logManagerPriceOverride({
        supabase,
        userId: ctx.userId,
        projectId: poLookup.data.project_id,
        tableName: "erp_purchase_order_lines",
        documentId: purchaseOrderId,
        enteredPrice: parsed.data.unitPrice,
        effectivePrice,
        effectiveSource,
      })
      await supabase
        .from("erp_purchase_orders")
        .update({ price_override_status: "APPROVED" })
        .eq("id", purchaseOrderId)
        .eq("company_id", activeCompanyId)
      managerOverrideApplied = true
    }
  }

  const { data, error } = await supabase
    .from("erp_purchase_order_lines")
    .insert({
      company_id: activeCompanyId,
      purchase_order_id: purchaseOrderId,
      project_id: parsed.data.projectId,
      item_sku: itemSku,
      budget_sub_chapter: parsed.data.budgetSubChapter,
      resource_id: parsed.data.resourceId,
      description: parsed.data.description,
      quantity: parsed.data.quantity,
      unit_price: parsed.data.unitPrice,
      effective_unit_price: effectivePrice > 0 ? effectivePrice : null,
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(
    {
      data: mapPurchaseOrderLineRow(data),
      warning: managerOverrideApplied
        ? {
            code: "PRICE_OVERRIDE_MANAGER",
            message: "חריגת מחיר אושרה ע״י מנהל ונרשמה בלוג ביקורת",
          }
        : null,
    },
    { status: 201 }
  )
}

