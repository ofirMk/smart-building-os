import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  mapClientContractLineRow,
  normalizeRouteParams,
  requireClientContractsApiContext,
} from "@/lib/erp/client-contracts-api"
import {
  isManagerRole,
  resolveEffectivePrice,
} from "@/lib/erp/price-ceiling"

const updateLineSchema = z.object({
  lineNumber: z.coerce.number().int().min(1).optional(),
  boqRef: z.string().trim().nullable().optional(),
  description: z.string().trim().min(2).optional(),
  quantity: z.coerce.number().min(0).optional(),
  unitPrice: z.coerce.number().min(0).optional(),
  retainageExempt: z.boolean().optional(),
  isAdvanceLine: z.boolean().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  itemId: z.string().uuid().nullable().optional(),
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
  const { id: clientContractId, lineId } = await normalizeRouteParams(params)
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId, userRole } = ctx

  const body = await req.json().catch(() => null)
  const parsed = updateLineSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }

  const currentLine = await supabase
    .from("erp_client_contract_lines")
    .select("id,company_id,supplier_id,item_id,quantity,unit_price,price_override_status")
    .eq("id", lineId)
    .eq("client_contract_id", clientContractId)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (currentLine.error) return NextResponse.json({ error: currentLine.error.message }, { status: 500 })
  if (!currentLine.data) return NextResponse.json({ error: "Line not found" }, { status: 404 })

  const nextSupplierId =
    parsed.data.supplierId === undefined ? currentLine.data.supplier_id : parsed.data.supplierId
  const nextItemId =
    parsed.data.itemId === undefined ? currentLine.data.item_id : parsed.data.itemId
  const nextUnitPrice =
    parsed.data.unitPrice !== undefined ? parsed.data.unitPrice : Number(currentLine.data.unit_price ?? 0)
  const nextQuantity =
    parsed.data.quantity !== undefined ? parsed.data.quantity : Number(currentLine.data.quantity ?? 0)

  let effectiveCost = 0
  let marginViolation = false
  if (nextSupplierId && nextItemId) {
    try {
      const effective = await resolveEffectivePrice({
        supabase,
        companyId: activeCompanyId,
        itemId: nextItemId,
        supplierId: nextSupplierId,
        quantity: nextQuantity,
        date: new Date().toISOString().slice(0, 10),
      })
      effectiveCost = effective.effectivePrice
      marginViolation = effectiveCost > 0 && nextUnitPrice < effectiveCost
    } catch (error) {
      console.warn("Effective cost lookup failed:", error)
    }
  }

  const manager = isManagerRole(userRole)
  const previouslyApproved = currentLine.data.price_override_status === "APPROVED"
  const blockForApproval =
    marginViolation && !previouslyApproved && (!manager || parsed.data.requestManagerApproval === true)

  if (blockForApproval) {
    return NextResponse.json(
      {
        error: "חריגת רווחיות - מחיר מכירה נמוך מעלות ספק מאושרת",
        code: "PRICE_OVERRIDE_REQUIRED",
        data: {
          lineId,
          unitPrice: nextUnitPrice,
          effectiveCost,
          nextStatus: "PENDING_PRICE_APPROVAL",
        },
      },
      { status: 409 }
    )
  }

  const patch: Record<string, string | number | boolean | null> = {}
  if (parsed.data.lineNumber !== undefined) patch.line_number = parsed.data.lineNumber
  if (parsed.data.boqRef !== undefined) patch.boq_ref = parsed.data.boqRef
  if (parsed.data.description !== undefined) patch.description = parsed.data.description
  if (parsed.data.quantity !== undefined) patch.quantity = parsed.data.quantity
  if (parsed.data.unitPrice !== undefined) patch.unit_price = parsed.data.unitPrice
  if (parsed.data.retainageExempt !== undefined) patch.retainage_exempt = parsed.data.retainageExempt
  if (parsed.data.isAdvanceLine !== undefined) patch.is_advance_line = parsed.data.isAdvanceLine
  if (parsed.data.supplierId !== undefined) patch.supplier_id = parsed.data.supplierId
  if (parsed.data.itemId !== undefined) patch.item_id = parsed.data.itemId
  if (marginViolation && manager && parsed.data.requestManagerApproval !== true) {
    patch.price_override_status = "APPROVED"
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields supplied" }, { status: 400 })
  }

  const updated = await supabase
    .from("erp_client_contract_lines")
    .update(patch)
    .eq("company_id", activeCompanyId)
    .eq("client_contract_id", clientContractId)
    .eq("id", lineId)
    .select("*")
    .maybeSingle()
  if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 400 })
  if (!updated.data) return NextResponse.json({ error: "Line not found" }, { status: 404 })
  return NextResponse.json({ data: mapClientContractLineRow(updated.data) })
}

export async function DELETE(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; lineId: string }> | { id: string; lineId: string } }
) {
  const { id: clientContractId, lineId } = await normalizeRouteParams(params)
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const deleted = await supabase
    .from("erp_client_contract_lines")
    .delete()
    .eq("company_id", activeCompanyId)
    .eq("client_contract_id", clientContractId)
    .eq("id", lineId)
    .select("id")
    .maybeSingle()
  if (deleted.error) return NextResponse.json({ error: deleted.error.message }, { status: 400 })
  if (!deleted.data) return NextResponse.json({ error: "Line not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
