import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  mapChangeOrderRow,
  normalizeRouteParams,
  requireClientContractsApiContext,
} from "@/lib/erp/client-contracts-api"
import { ChangeOrderPatchSchema } from "@/lib/erp/change-order-schema"
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

const updateSchema = ChangeOrderPatchSchema.extend({
  requestManagerApproval: z.boolean().optional(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const EPSILON = 0.0001

function isApproximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= EPSILON
}

type SupabaseClient = Awaited<ReturnType<typeof import("@/lib/supabase/server-auth").createSupabaseServerAuthClient>>

async function verifyInheritanceRules(input: {
  supabase: SupabaseClient
  activeCompanyId: string
  clientContractId: string
  inheritanceRules: {
    retentionPct: number
    discountPct: number
    indexationPct: number
  }
}) {
  const { supabase, activeCompanyId, clientContractId, inheritanceRules } = input
  const contractDefaults = await supabase
    .from("erp_client_contracts")
    .select("retention_pct, advance_repayment_pct, indexation_pct")
    .eq("company_id", activeCompanyId)
    .eq("id", clientContractId)
    .maybeSingle()
  if (contractDefaults.error) return contractDefaults.error.message
  if (!contractDefaults.data) return "Parent contract not found"

  const expectedRetention = Number(contractDefaults.data.retention_pct ?? 0)
  const expectedDiscount = Number(contractDefaults.data.advance_repayment_pct ?? 0)
  const expectedIndexation = Number(contractDefaults.data.indexation_pct ?? 0)

  if (!isApproximatelyEqual(inheritanceRules.retentionPct, expectedRetention)) {
    return "Retention rule must inherit parent contract default"
  }
  if (!isApproximatelyEqual(inheritanceRules.discountPct, expectedDiscount)) {
    return "Discount rule must inherit parent contract default"
  }
  if (!isApproximatelyEqual(inheritanceRules.indexationPct, expectedIndexation)) {
    return "Indexation rule must inherit parent contract default"
  }
  return null
}

export async function GET(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; changeOrderId: string }> | { id: string; changeOrderId: string } }
) {
  const { id: clientContractId, changeOrderId } = await normalizeRouteParams(params)
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const loaded = await supabase
    .from("erp_change_orders")
    .select("*")
    .eq("company_id", activeCompanyId)
    .eq("client_contract_id", clientContractId)
    .eq("id", changeOrderId)
    .maybeSingle()
  if (loaded.error) return NextResponse.json({ error: loaded.error.message }, { status: 500 })
  if (!loaded.data) return NextResponse.json({ error: "Change order not found" }, { status: 404 })

  const locked = await supabase.rpc("erp_change_order_is_locked", {
    p_company_id: activeCompanyId,
    p_change_order_id: changeOrderId,
  })
  if (locked.error) return NextResponse.json({ error: locked.error.message }, { status: 500 })

  return NextResponse.json({
    data: mapChangeOrderRow({
      ...loaded.data,
      is_locked: locked.data === true,
    }),
  })
}

export async function PUT(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; changeOrderId: string }> | { id: string; changeOrderId: string } }
) {
  const { id: clientContractId, changeOrderId } = await normalizeRouteParams(params)
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx
  const actorRole = ctx.userRole
  const actorUserId = ctx.userId

  const locked = await supabase.rpc("erp_change_order_is_locked", {
    p_company_id: activeCompanyId,
    p_change_order_id: changeOrderId,
  })
  if (locked.error) return NextResponse.json({ error: locked.error.message }, { status: 500 })
  if (locked.data === true) return NextResponse.json({ error: "Change order is locked by progress billing linkage" }, { status: 409 })

  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 })

  const existing = await supabase
    .from("erp_change_orders")
    .select("id, change_type, contract_line_id, status, price_override_status, new_unit_price, price_item_id, price_supplier_id, qty_delta")
    .eq("company_id", activeCompanyId)
    .eq("client_contract_id", clientContractId)
    .eq("id", changeOrderId)
    .maybeSingle()
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 })
  if (!existing.data) return NextResponse.json({ error: "Change order not found" }, { status: 404 })

  const effectiveChangeType = parsed.data.changeType ?? existing.data.change_type
  const effectiveContractLineId =
    parsed.data.contractLineId !== undefined
      ? parsed.data.contractLineId
      : existing.data.contract_line_id
  if (
    (effectiveChangeType === "QTY_CHANGE" || effectiveChangeType === "PRICE_CHANGE") &&
    !effectiveContractLineId
  ) {
    return NextResponse.json(
      { error: "Source line is required for QTY/PRICE changes" },
      { status: 400 }
    )
  }
  if (effectiveContractLineId) {
    const lineExists = await supabase
      .from("erp_client_contract_lines")
      .select("id")
      .eq("company_id", activeCompanyId)
      .eq("client_contract_id", clientContractId)
      .eq("id", effectiveContractLineId)
      .maybeSingle()
    if (lineExists.error) return NextResponse.json({ error: lineExists.error.message }, { status: 500 })
    if (!lineExists.data) {
      return NextResponse.json(
        { error: "Source line does not belong to this contract" },
        { status: 400 }
      )
    }
  }

  if (parsed.data.inheritanceRules) {
    const inheritanceError = await verifyInheritanceRules({
      supabase,
      activeCompanyId,
      clientContractId,
      inheritanceRules: parsed.data.inheritanceRules,
    })
    if (inheritanceError) return NextResponse.json({ error: inheritanceError }, { status: 400 })
  }

  if (
    (parsed.data.status === "ACTIVE" || parsed.data.status === "APPROVED") &&
    existing.data.price_override_status === "REQUESTED"
  ) {
    return NextResponse.json(
      { error: "לא ניתן לקדם פקודת שינוי לפני אישור חריגת מחיר", code: "PRICE_OVERRIDE_PENDING" },
      { status: 409 }
    )
  }

  const contractLookup = await supabase
    .from("erp_client_contracts")
    .select("id,project_id,contract_number,supplier_id")
    .eq("company_id", activeCompanyId)
    .eq("id", clientContractId)
    .maybeSingle()
  if (contractLookup.error) return NextResponse.json({ error: contractLookup.error.message }, { status: 500 })
  if (!contractLookup.data) return NextResponse.json({ error: "Parent contract not found" }, { status: 404 })

  let effectivePrice: number | null = null
  let shouldRequestOverride = false
  let effectiveSource = "FALLBACK"
  const effectiveNewUnitPrice = parsed.data.newUnitPrice ?? existing.data.new_unit_price
  const effectivePriceItemId = parsed.data.priceItemId ?? existing.data.price_item_id
  const effectivePriceSupplierId =
    parsed.data.priceSupplierId ?? existing.data.price_supplier_id ?? contractLookup.data.supplier_id
  const effectiveQtyForPrice = parsed.data.qtyDelta ?? existing.data.qty_delta
  if (
    effectiveChangeType === "PRICE_CHANGE" &&
    effectiveNewUnitPrice !== null &&
    effectiveNewUnitPrice !== undefined
  ) {
    if (!effectivePriceItemId || !effectivePriceSupplierId) {
      shouldRequestOverride = true
      effectiveSource = "MISSING_CONTEXT"
    } else {
      const effective = await resolveEffectivePrice({
        supabase,
        companyId: activeCompanyId,
        itemId: effectivePriceItemId,
        supplierId: effectivePriceSupplierId,
        quantity: Math.max(Math.abs(Number(effectiveQtyForPrice ?? 1)), 1),
        date: new Date().toISOString().slice(0, 10),
      })
      effectivePrice = effective.effectivePrice
      effectiveSource = effective.source

      if (isPriceCeilingExceeded({ enteredPrice: Number(effectiveNewUnitPrice), effectivePrice })) {
        const ceilingCheck = validateEnteredPriceMax(Number(effectiveNewUnitPrice), effectivePrice)
        const manager = isManagerRole(actorRole)
        if (!manager || parsed.data.requestManagerApproval === true) {
          shouldRequestOverride = true
          if (!ceilingCheck.success) {
            // Enforce zod max(effectivePrice) quality gate.
          }
        } else if (actorUserId) {
          await logManagerPriceOverride({
            supabase,
            userId: actorUserId,
            projectId: contractLookup.data.project_id,
            tableName: "erp_change_orders",
            documentId: changeOrderId,
            enteredPrice: Number(effectiveNewUnitPrice),
            effectivePrice,
            effectiveSource,
          })
        }
      }
    }
  }

  const patch: Record<string, string | number | boolean | null> = {}
  if (parsed.data.contractLineId !== undefined) patch.contract_line_id = parsed.data.contractLineId
  if (parsed.data.changeOrderNumber !== undefined) patch.change_order_number = parsed.data.changeOrderNumber
  if (parsed.data.changeType !== undefined) patch.change_type = parsed.data.changeType
  if (parsed.data.newLineDescription !== undefined) patch.new_line_description = parsed.data.newLineDescription
  if (parsed.data.qtyDelta !== undefined) patch.qty_delta = parsed.data.qtyDelta
  if (parsed.data.newUnitPrice !== undefined) patch.new_unit_price = parsed.data.newUnitPrice
  if (parsed.data.priceItemId !== undefined) patch.price_item_id = parsed.data.priceItemId
  if (parsed.data.priceSupplierId !== undefined) patch.price_supplier_id = parsed.data.priceSupplierId
  if (parsed.data.status !== undefined) patch.status = parsed.data.status
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes
  if (parsed.data.isExtraWork !== undefined) patch.is_extra_work = parsed.data.isExtraWork
  if (parsed.data.isAdditionalWork !== undefined) patch.is_additional_work = parsed.data.isAdditionalWork
  if (effectivePrice !== null) patch.effective_unit_price = effectivePrice
  if (shouldRequestOverride) {
    patch.status = PENDING_PRICE_APPROVAL_STATUS
    patch.price_override_status = "REQUESTED"
  } else if (effectivePrice !== null && isManagerRole(actorRole)) {
    patch.price_override_status = "APPROVED"
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No fields supplied" }, { status: 400 })

  const updated = await supabase
    .from("erp_change_orders")
    .update(patch)
    .eq("company_id", activeCompanyId)
    .eq("client_contract_id", clientContractId)
    .eq("id", changeOrderId)
    .select("*")
    .maybeSingle()
  if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 400 })
  if (!updated.data) return NextResponse.json({ error: "Change order not found" }, { status: 404 })

  if (shouldRequestOverride) {
    await enqueuePriceOverrideNotifications({
      supabase,
      companyId: activeCompanyId,
      entityName: "erp_change_order",
      entityId: changeOrderId,
      projectId: contractLookup.data.project_id,
      projectManagerId: null,
      title: "בקשת אישור חריגת מחיר",
      body: `Change order ${updated.data.change_order_number} ממתין לאישור`,
      payload: {
        eventName: PRICE_OVERRIDE_EVENT,
        changeOrderId,
        contractId: clientContractId,
      },
    })
    return NextResponse.json(
      {
        error: "חריגת מחיר ממחירון מאושר",
        code: "PRICE_OVERRIDE_REQUIRED",
        data: mapChangeOrderRow({ ...updated.data, is_locked: false }),
      },
      { status: 409 }
    )
  }

  return NextResponse.json({ data: mapChangeOrderRow({ ...updated.data, is_locked: false }) })
}

export async function DELETE(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; changeOrderId: string }> | { id: string; changeOrderId: string } }
) {
  const { id: clientContractId, changeOrderId } = await normalizeRouteParams(params)
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const locked = await supabase.rpc("erp_change_order_is_locked", {
    p_company_id: activeCompanyId,
    p_change_order_id: changeOrderId,
  })
  if (locked.error) return NextResponse.json({ error: locked.error.message }, { status: 500 })
  if (locked.data === true) return NextResponse.json({ error: "Change order is locked by progress billing linkage" }, { status: 409 })

  const deleted = await supabase
    .from("erp_change_orders")
    .delete()
    .eq("company_id", activeCompanyId)
    .eq("client_contract_id", clientContractId)
    .eq("id", changeOrderId)
    .select("id")
    .maybeSingle()
  if (deleted.error) return NextResponse.json({ error: deleted.error.message }, { status: 400 })
  if (!deleted.data) return NextResponse.json({ error: "Change order not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}

