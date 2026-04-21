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

const createLineSchema = z.object({
  lineNumber: z.coerce.number().int().min(1),
  boqRef: z.string().trim().optional().nullable(),
  description: z.string().trim().min(2),
  quantity: z.coerce.number().min(0),
  unitPrice: z.coerce.number().min(0),
  retainageExempt: z.boolean().optional(),
  isAdvanceLine: z.boolean().optional(),
  supplierId: z.string().uuid().optional().nullable(),
  itemId: z.string().uuid().optional().nullable(),
  requestManagerApproval: z.boolean().optional(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: clientContractId } = await normalizeRouteParams(params)
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const loaded = await supabase
    .from("erp_client_contract_lines")
    .select("*")
    .eq("company_id", activeCompanyId)
    .eq("client_contract_id", clientContractId)
    .order("line_number", { ascending: true })
  if (loaded.error) return NextResponse.json({ error: loaded.error.message }, { status: 500 })

  return NextResponse.json({ data: (loaded.data ?? []).map(mapClientContractLineRow) })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: clientContractId } = await normalizeRouteParams(params)
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId, userRole } = ctx
  const body = await req.json().catch(() => null)
  const parsed = createLineSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }

  const contractLookup = await supabase
    .from("erp_client_contracts")
    .select("id,company_id,supplier_id,contract_number")
    .eq("id", clientContractId)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (contractLookup.error) {
    return NextResponse.json({ error: contractLookup.error.message }, { status: 500 })
  }
  if (!contractLookup.data) {
    return NextResponse.json({ error: "Client contract not found for active company" }, { status: 404 })
  }

  const supplierId = parsed.data.supplierId ?? contractLookup.data.supplier_id ?? null
  const itemId = parsed.data.itemId ?? null

  let effectiveCost = 0
  let marginViolation = false
  if (supplierId && itemId) {
    try {
      const effective = await resolveEffectivePrice({
        supabase,
        companyId: activeCompanyId,
        itemId,
        supplierId,
        quantity: parsed.data.quantity,
        date: new Date().toISOString().slice(0, 10),
      })
      effectiveCost = effective.effectivePrice
      marginViolation = effectiveCost > 0 && parsed.data.unitPrice < effectiveCost
    } catch (error) {
      console.warn("Effective cost lookup failed:", error)
    }
  }

  const manager = isManagerRole(userRole)
  const blockForApproval =
    marginViolation && (!manager || parsed.data.requestManagerApproval === true)

  if (blockForApproval) {
    return NextResponse.json(
      {
        error: "חריגת רווחיות - מחיר מכירה נמוך מעלות ספק מאושרת",
        code: "PRICE_OVERRIDE_REQUIRED",
        data: {
          unitPrice: parsed.data.unitPrice,
          effectiveCost,
          contractNumber: contractLookup.data.contract_number,
          nextStatus: "PENDING_PRICE_APPROVAL",
        },
      },
      { status: 409 }
    )
  }

  const inserted = await supabase
    .from("erp_client_contract_lines")
    .insert({
      company_id: activeCompanyId,
      client_contract_id: clientContractId,
      line_number: parsed.data.lineNumber,
      boq_ref: parsed.data.boqRef ?? null,
      description: parsed.data.description,
      quantity: parsed.data.quantity,
      unit_price: parsed.data.unitPrice,
      retainage_exempt: parsed.data.retainageExempt === true,
      is_advance_line: parsed.data.isAdvanceLine === true,
      supplier_id: supplierId,
      item_id: itemId,
      price_override_status:
        marginViolation && manager && parsed.data.requestManagerApproval !== true
          ? "APPROVED"
          : "NONE",
    })
    .select("*")
    .single()
  if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 400 })
  return NextResponse.json({ data: mapClientContractLineRow(inserted.data) }, { status: 201 })
}
