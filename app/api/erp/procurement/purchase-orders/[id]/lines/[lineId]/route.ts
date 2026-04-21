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

const updateLineSchema = z.object({
  projectId: z.string().uuid().optional(),
  budgetSubChapter: z.string().trim().min(1).optional(),
  resourceId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(2).optional(),
  quantity: z.coerce.number().min(0).optional(),
  unitPrice: z.coerce.number().min(0).optional(),
  requestManagerApproval: z.boolean().optional(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PUT(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; lineId: string }> | { id: string; lineId: string } }
) {
  const { id: purchaseOrderId, lineId } = await normalizeRouteParams(params)
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const body = await req.json().catch(() => null)
  const parsed = updateLineSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 })
  }

  const currentLine = await supabase
    .from("erp_purchase_order_lines")
    .select("id,company_id,item_sku,quantity,unit_price")
    .eq("id", lineId)
    .eq("purchase_order_id", purchaseOrderId)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (currentLine.error) return NextResponse.json({ error: currentLine.error.message }, { status: 500 })
  if (!currentLine.data) return NextResponse.json({ error: "Line not found" }, { status: 404 })

  const poLookup = await supabase
    .from("erp_purchase_orders")
    .select("id,company_id,supplier_id,project_id,po_number,status,issued_at")
    .eq("id", purchaseOrderId)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (poLookup.error) return NextResponse.json({ error: poLookup.error.message }, { status: 500 })
  if (!poLookup.data) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 })

  let computedEffectivePrice: number | null = null
  let managerOverrideApplied = false
  if (
    currentLine.data.item_sku &&
    (parsed.data.unitPrice !== undefined || parsed.data.quantity !== undefined)
  ) {
    const itemLookup = await supabase
      .from("erp_md_items")
      .select("id")
      .eq("company_id", activeCompanyId)
      .eq("item_number", currentLine.data.item_sku)
      .maybeSingle()
    if (itemLookup.error) return NextResponse.json({ error: itemLookup.error.message }, { status: 500 })
    if (itemLookup.data?.id) {
      const enteredPrice = parsed.data.unitPrice ?? Number(currentLine.data.unit_price ?? 0)
      const quantity = parsed.data.quantity ?? Number(currentLine.data.quantity ?? 0)
      const effective = await resolveEffectivePrice({
        supabase,
        companyId: activeCompanyId,
        itemId: itemLookup.data.id,
        supplierId: poLookup.data.supplier_id,
        quantity,
        date: (poLookup.data.issued_at as string | null) ?? new Date().toISOString().slice(0, 10),
      })
      computedEffectivePrice = effective.effectivePrice
      if (isPriceCeilingExceeded({ enteredPrice, effectivePrice: effective.effectivePrice })) {
        const ceilingCheck = validateEnteredPriceMax(enteredPrice, effective.effectivePrice)
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
              lineId,
              enteredPrice,
              effectivePrice: effective.effectivePrice,
              effectiveSource: effective.source,
              zodIssue: ceilingCheck.success ? null : ceilingCheck.error.issues[0]?.message ?? null,
            },
          })

          return NextResponse.json(
            {
              error: "חריגת מחיר ממחירון מאושר",
              code: "PRICE_OVERRIDE_REQUIRED",
              data: {
                enteredPrice,
                effectivePrice: effective.effectivePrice,
                effectiveSource: effective.source,
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
          enteredPrice,
          effectivePrice: effective.effectivePrice,
          effectiveSource: effective.source,
        })
        await supabase
          .from("erp_purchase_orders")
          .update({ price_override_status: "APPROVED" })
          .eq("id", purchaseOrderId)
          .eq("company_id", activeCompanyId)
        managerOverrideApplied = true
      }
    }
  }

  const patch: Record<string, string | number> = {}
  if (parsed.data.projectId !== undefined) patch.project_id = parsed.data.projectId
  if (parsed.data.budgetSubChapter !== undefined) patch.budget_sub_chapter = parsed.data.budgetSubChapter
  if (parsed.data.resourceId !== undefined) patch.resource_id = parsed.data.resourceId
  if (parsed.data.description !== undefined) patch.description = parsed.data.description
  if (parsed.data.quantity !== undefined) patch.quantity = parsed.data.quantity
  if (parsed.data.unitPrice !== undefined) patch.unit_price = parsed.data.unitPrice
  if (computedEffectivePrice !== null) patch.effective_unit_price = computedEffectivePrice
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields supplied" }, { status: 400 })
  }

  const { error } = await supabase
    .from("erp_purchase_order_lines")
    .update(patch)
    .eq("id", lineId)
    .eq("purchase_order_id", purchaseOrderId)
    .eq("company_id", activeCompanyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const loaded = await supabase
    .from("erp_purchase_order_lines")
    .select("*")
    .eq("id", lineId)
    .eq("purchase_order_id", purchaseOrderId)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (loaded.error) return NextResponse.json({ error: loaded.error.message }, { status: 500 })
  if (!loaded.data) return NextResponse.json({ error: "Line not found" }, { status: 404 })

  return NextResponse.json({
    data: mapPurchaseOrderLineRow(loaded.data),
    warning: managerOverrideApplied
      ? {
          code: "PRICE_OVERRIDE_MANAGER",
          message: "חריגת מחיר אושרה ע״י מנהל ונרשמה בלוג ביקורת",
        }
      : null,
  })
}

export async function DELETE(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; lineId: string }> | { id: string; lineId: string } }
) {
  const { id: purchaseOrderId, lineId } = await normalizeRouteParams(params)
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { data, error } = await supabase
    .from("erp_purchase_order_lines")
    .delete()
    .select("id")
    .eq("id", lineId)
    .eq("purchase_order_id", purchaseOrderId)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: "Line not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}

