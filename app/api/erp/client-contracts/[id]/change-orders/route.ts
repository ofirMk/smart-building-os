import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  mapChangeOrderRow,
  normalizeRouteParams,
  requireClientContractsApiContext,
} from "@/lib/erp/client-contracts-api"
import { ChangeOrderSchema } from "@/lib/erp/change-order-schema"
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

const changeOrderSchema = ChangeOrderSchema.extend({
  requestManagerApproval: z.boolean().optional(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const EPSILON = 0.0001

function isApproximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= EPSILON
}

async function verifyInheritanceRules(input: {
  supabase: any
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
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: clientContractId } = await normalizeRouteParams(params)
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const loaded = await supabase
    .from("erp_change_orders")
    .select("*")
    .eq("company_id", activeCompanyId)
    .eq("client_contract_id", clientContractId)
    .order("created_at", { ascending: false })
  if (loaded.error) return NextResponse.json({ error: loaded.error.message }, { status: 500 })

  const rows = loaded.data ?? []
  const contractLineIds = Array.from(
    new Set(
      rows
        .map((row: any) => row.contract_line_id as string | null)
        .filter((value: string | null): value is string => Boolean(value))
    )
  )
  let lockedSet = new Set<string>()
  if (contractLineIds.length > 0) {
    const linked = await supabase
      .from("erp_client_progress_bill_lines")
      .select("contract_line_id,erp_client_progress_bills!inner(status)")
      .eq("company_id", activeCompanyId)
      .in("contract_line_id", contractLineIds)
      .neq("erp_client_progress_bills.status", "CANCELLED")
    if (!linked.error) {
      lockedSet = new Set(
        (linked.data ?? [])
          .map((row: any) => row.contract_line_id as string | null)
          .filter((value: string | null): value is string => Boolean(value))
      )
    }
  }

  return NextResponse.json({
    data: rows.map((row: any) =>
      mapChangeOrderRow({
        ...row,
        is_locked: row.contract_line_id ? lockedSet.has(row.contract_line_id) : false,
      })
    ),
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: clientContractId } = await normalizeRouteParams(params)
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx
  const actorRole = ctx.userRole
  const actorUserId = ctx.userId

  const body = await req.json().catch(() => null)
  const parsed = changeOrderSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 })

  if (parsed.data.contractLineId) {
    const lineExists = await supabase
      .from("erp_client_contract_lines")
      .select("id")
      .eq("company_id", activeCompanyId)
      .eq("client_contract_id", clientContractId)
      .eq("id", parsed.data.contractLineId)
      .maybeSingle()
    if (lineExists.error) return NextResponse.json({ error: lineExists.error.message }, { status: 500 })
    if (!lineExists.data) {
      return NextResponse.json(
        { error: "Source line does not belong to this contract" },
        { status: 400 }
      )
    }
  }

  const inheritanceError = await verifyInheritanceRules({
    supabase,
    activeCompanyId,
    clientContractId,
    inheritanceRules: parsed.data.inheritanceRules,
  })
  if (inheritanceError) return NextResponse.json({ error: inheritanceError }, { status: 400 })

  const contractLookup = await supabase
    .from("erp_client_contracts")
    .select("id,project_id,contract_number,supplier_id")
    .eq("company_id", activeCompanyId)
    .eq("id", clientContractId)
    .maybeSingle()
  if (contractLookup.error) return NextResponse.json({ error: contractLookup.error.message }, { status: 500 })
  if (!contractLookup.data) return NextResponse.json({ error: "Parent contract not found" }, { status: 404 })

  let effectivePrice: number | null = null
  let enforcePendingPriceApproval = false
  let effectiveSource = "FALLBACK"
  if (
    parsed.data.changeType === "PRICE_CHANGE" &&
    parsed.data.newUnitPrice !== null &&
    parsed.data.newUnitPrice !== undefined
  ) {
    const effectiveSupplierId = parsed.data.priceSupplierId ?? contractLookup.data.supplier_id ?? null
    if (!parsed.data.priceItemId || !effectiveSupplierId) {
      enforcePendingPriceApproval = true
      effectiveSource = "MISSING_CONTEXT"
    } else {
      const effective = await resolveEffectivePrice({
        supabase,
        companyId: activeCompanyId,
        itemId: parsed.data.priceItemId,
        supplierId: effectiveSupplierId,
        quantity: Math.max(Math.abs(Number(parsed.data.qtyDelta ?? 1)), 1),
        date: new Date().toISOString().slice(0, 10),
      })
      effectivePrice = effective.effectivePrice
      effectiveSource = effective.source

      if (isPriceCeilingExceeded({ enteredPrice: parsed.data.newUnitPrice, effectivePrice })) {
        const ceilingCheck = validateEnteredPriceMax(parsed.data.newUnitPrice, effectivePrice)
        const manager = isManagerRole(actorRole)
        if (!manager || parsed.data.requestManagerApproval === true) {
          enforcePendingPriceApproval = true
          if (!ceilingCheck.success) {
            // Intentionally evaluated to enforce zod max(effectivePrice) quality gate.
          }
        } else if (actorUserId) {
          await logManagerPriceOverride({
            supabase,
            userId: actorUserId,
            projectId: contractLookup.data.project_id,
            tableName: "erp_change_orders",
            documentId: clientContractId,
            enteredPrice: parsed.data.newUnitPrice,
            effectivePrice,
            effectiveSource,
          })
        }
      }
    }
  }

  const inserted = await supabase
    .from("erp_change_orders")
    .insert({
      company_id: activeCompanyId,
      client_contract_id: clientContractId,
      contract_line_id: parsed.data.contractLineId ?? null,
      change_order_number: parsed.data.changeOrderNumber,
      change_type: parsed.data.changeType,
      new_line_description: parsed.data.newLineDescription ?? null,
      qty_delta: parsed.data.qtyDelta ?? null,
      new_unit_price: parsed.data.newUnitPrice ?? null,
      price_item_id: parsed.data.priceItemId ?? null,
      price_supplier_id: parsed.data.priceSupplierId ?? contractLookup.data.supplier_id ?? null,
      status: enforcePendingPriceApproval ? PENDING_PRICE_APPROVAL_STATUS : parsed.data.status ?? "DRAFT",
      notes: parsed.data.notes ?? null,
      is_extra_work: parsed.data.isExtraWork === true,
      is_additional_work: parsed.data.isAdditionalWork === true,
      effective_unit_price: effectivePrice,
      price_override_status: enforcePendingPriceApproval ? "REQUESTED" : "NONE",
    })
    .select("*")
    .single()
  if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 400 })

  if (enforcePendingPriceApproval) {
    await enqueuePriceOverrideNotifications({
      supabase,
      companyId: activeCompanyId,
      entityName: "erp_change_order",
      entityId: inserted.data.id,
      projectId: contractLookup.data.project_id,
      projectManagerId: null,
      title: "בקשת אישור חריגת מחיר",
      body: `Change order ${inserted.data.change_order_number} ממתין לאישור`,
      payload: {
        eventName: PRICE_OVERRIDE_EVENT,
        changeOrderId: inserted.data.id,
        contractId: clientContractId,
      },
    })
    return NextResponse.json(
      {
        error: "חריגת מחיר ממחירון מאושר",
        code: "PRICE_OVERRIDE_REQUIRED",
        data: mapChangeOrderRow(inserted.data),
      },
      { status: 409 }
    )
  }

  return NextResponse.json({ data: mapChangeOrderRow(inserted.data) }, { status: 201 })
}

