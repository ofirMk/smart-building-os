/**
 * POST /api/procurement/orders/[id]/copy
 *
 * P1 #9 — Copy PO: duplicates an existing PO header + all its lines as a new DRAFT.
 *
 * Generates a fresh PO number and resets financial/audit fields.
 * The caller may pass optional overrides in the body:
 *   { title?: string, notes?: string }
 *
 * Returns the new PO id and po_number.
 */

import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string }

const bodySchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    notes: z.string().optional(),
  })
  .optional()
  .default({})

function generatePoNumber(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const date = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`
  const time = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`
  const rand = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")
  return `PO-${date}-${time}${rand}`
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id: sourcePOId } = await Promise.resolve(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId, userId } = ctx

  // Load source PO
  const sourceQ = await supabase
    .from("erp_purchase_orders")
    .select(
      "id, supplier_id, project_id, currency, notes, title, urgency_level, " +
        "urgency_justification, contact_id, receiving_warehouse_code, order_date, " +
        "payment_terms_code, vat_code, withholding_pct, shipping_addr_he, shipping_addr_en, " +
        "is_confidential, affects_planning, contract_id, is_release_order, " +
        "requested_delivery_date, total_amount_net, vat_amount, total_amount_gross"
    )
    .eq("id", sourcePOId)
    .eq("company_id", activeCompanyId)
    .single()

  if (sourceQ.error) {
    return NextResponse.json({ error: "הזמנת רכש מקור לא נמצאה" }, { status: 404 })
  }

  const src = sourceQ.data as Record<string, unknown>

  // Load source lines
  const linesQ = await supabase
    .from("erp_purchase_order_lines")
    .select(
      "item_id, description, quantity, unit_price, budget_sub_chapter, resource_id, " +
        "project_id, uom, supplier_sku, discount_pct, supply_date, line_currency, " +
        "exchange_rate, manufacturer_name, line_notes, price_source, budget_item_code, " +
        "import_cost_type, line_number"
    )
    .eq("purchase_order_id", sourcePOId)
    .eq("company_id", activeCompanyId)
    .order("line_number", { ascending: true })

  if (linesQ.error) {
    return NextResponse.json({ error: linesQ.error.message }, { status: 500 })
  }

  const todayIso = new Date().toISOString().slice(0, 10)
  const newPoNumber = generatePoNumber()

  let bodyRaw: unknown
  try {
    bodyRaw = await req.json()
  } catch {
    bodyRaw = {}
  }
  const overrides = bodySchema.parse(bodyRaw)

  // Create new PO header (copy with resets)
  const newHeaderInsert = await supabase
    .from("erp_purchase_orders")
    .insert({
      company_id: activeCompanyId,
      supplier_id: src.supplier_id,
      project_id: src.project_id,
      po_number: newPoNumber,
      title: overrides?.title ?? `${src.title as string} (העתק)`,
      status: "DRAFT",
      currency: src.currency,
      total_amount_net: src.total_amount_net,
      vat_amount: src.vat_amount,
      total_amount_gross: src.total_amount_gross,
      notes: overrides?.notes ?? (src.notes as string | null),
      urgency_level: src.urgency_level ?? "NORMAL",
      urgency_justification: src.urgency_justification,
      contact_id: src.contact_id,
      receiving_warehouse_code: src.receiving_warehouse_code,
      order_date: todayIso,
      payment_terms_code: src.payment_terms_code,
      vat_code: src.vat_code,
      withholding_pct: src.withholding_pct,
      shipping_addr_he: src.shipping_addr_he,
      shipping_addr_en: src.shipping_addr_en,
      is_confidential: src.is_confidential ?? false,
      affects_planning: src.affects_planning ?? true,
      contract_id: src.contract_id,
      is_release_order: src.is_release_order ?? false,
      requested_delivery_date: src.requested_delivery_date,
      created_by: userId,
      // Reset approval/versioning fields
      revision_number: 1,
      ai_negotiation_status: "NOT_ATTEMPTED",
      po_total_deviation_pct: null,
      requires_po_escalation: false,
    })
    .select("id, po_number")
    .single()

  if (newHeaderInsert.error) {
    return NextResponse.json({ error: newHeaderInsert.error.message }, { status: 500 })
  }

  const newPoId = (newHeaderInsert.data as { id: string }).id
  const newPoNumber2 = (newHeaderInsert.data as { po_number: string }).po_number

  // Copy lines
  if (linesQ.data?.length) {
    const linesToInsert = linesQ.data.map((l: Record<string, unknown>) => ({
      ...l,
      company_id: activeCompanyId,
      purchase_order_id: newPoId,
      // Reset delivery-specific fields
      received_qty: 0,
      invoiced_qty: 0,
      line_status: "OPEN",
      escalation_justification: null,
      escalation_category: null,
      requires_escalation: false,
      deviation_pct: null,
    }))

    const linesInsert = await supabase.from("erp_purchase_order_lines").insert(linesToInsert)
    if (linesInsert.error) {
      // Compensating delete to avoid orphan header
      await supabase.from("erp_purchase_orders").delete().eq("id", newPoId)
      return NextResponse.json({ error: linesInsert.error.message }, { status: 500 })
    }
  }

  return NextResponse.json(
    {
      data: {
        id: newPoId,
        poNumber: newPoNumber2,
        copiedFromId: sourcePOId,
      },
    },
    { status: 201 }
  )
}
