/**
 * POST /api/procurement/goods-receipt/[id]/landed-costs
 *
 * Create a Landed Cost document for a specific Goods Receipt.
 *
 * Body: {
 *   reference?: string
 *   currency?: string (default ILS)
 *   notes?: string
 *   lines: Array<{
 *     cost_type: "FREIGHT" | "CUSTOMS" | "INSURANCE" | "AGENT_FEE" | "OTHER"
 *     description?: string
 *     amount: number
 *     allocation_method?: "BY_VALUE" | "BY_QUANTITY"
 *   }>
 * }
 *
 * Returns the created document with its lines and the initial allocation preview.
 */

import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string }

const lineSchema = z.object({
  cost_type: z.enum(["FREIGHT", "CUSTOMS", "INSURANCE", "AGENT_FEE", "OTHER"]),
  description: z.string().max(300).optional(),
  amount: z.number().min(0),
  allocation_method: z.enum(["BY_VALUE", "BY_QUANTITY"]).optional().default("BY_VALUE"),
})

const bodySchema = z.object({
  reference: z.string().max(100).optional(),
  currency: z.string().length(3).optional().default("ILS"),
  notes: z.string().max(1000).optional(),
  lines: z.array(lineSchema).min(1),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id: grId } = await Promise.resolve(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId, userId } = ctx

  // Validate GR exists and belongs to company
  const grQ = await supabase
    .from("erp_goods_receipts")
    .select("id, status")
    .eq("id", grId)
    .eq("company_id", activeCompanyId)
    .single()

  if (grQ.error) {
    return NextResponse.json({ error: "קבלת סחורה לא נמצאה" }, { status: 404 })
  }

  const gr = grQ.data as { id: string; status: string }
  if (gr.status === "CANCELLED") {
    return NextResponse.json(
      { error: "GR_CANCELLED", message: "לא ניתן ליצור עלויות נחיתה על קבלה מבוטלת" },
      { status: 409 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { reference, currency, notes, lines } = parsed.data

  // Create document
  const docInsert = await supabase
    .from("erp_landed_cost_documents")
    .insert({
      company_id: activeCompanyId,
      goods_receipt_id: grId,
      reference: reference ?? null,
      currency,
      notes: notes ?? null,
      status: "DRAFT",
      created_by: userId,
    })
    .select("id")
    .single()

  if (docInsert.error) {
    return NextResponse.json({ error: docInsert.error.message }, { status: 500 })
  }

  const docId = (docInsert.data as { id: string }).id

  // Insert lines
  const lineRows = lines.map((l) => ({
    company_id: activeCompanyId,
    document_id: docId,
    cost_type: l.cost_type,
    description: l.description ?? null,
    amount: l.amount,
    allocation_method: l.allocation_method ?? "BY_VALUE",
  }))

  const linesInsert = await supabase.from("erp_landed_cost_lines").insert(lineRows)
  if (linesInsert.error) {
    return NextResponse.json({ error: linesInsert.error.message }, { status: 500 })
  }

  // Auto-allocate immediately so caller gets preview
  await supabase.rpc("erp_allocate_landed_costs", { p_document_id: docId })

  // Fetch full document with allocations
  const finalQ = await supabase
    .from("erp_landed_cost_documents")
    .select(
      "id, goods_receipt_id, reference, total_amount, currency, status, notes, " +
        "erp_landed_cost_lines(id, cost_type, description, amount, allocation_method), " +
        "erp_landed_cost_allocations(id, gr_line_id, item_id, allocated_amount, allocation_basis_value)"
    )
    .eq("id", docId)
    .single()

  return NextResponse.json({ data: finalQ.data }, { status: 201 })
}

// GET /api/procurement/goods-receipt/[id]/landed-costs — list LC docs for this GR
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id: grId } = await Promise.resolve(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { data, error } = await supabase
    .from("erp_landed_cost_documents")
    .select(
      "id, reference, total_amount, currency, status, notes, posted_at, created_at, " +
        "erp_landed_cost_lines(id, cost_type, amount, allocation_method)"
    )
    .eq("company_id", activeCompanyId)
    .eq("goods_receipt_id", grId)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
