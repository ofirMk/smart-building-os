/**
 * POST `/api/procurement/orders/[id]/lines` — הוספת שורה לפירוט הזמנת רכש
 *
 * פועל רק על PO ב-DRAFT (מאומת מול erp_po_status_types.allow_changes).
 *
 * שדות חובה  : description, quantity, unitPrice
 * שדות אופציה: discountPct, uom, supplyDate, itemId, supplierSku,
 *              supplierSkuDescription, manufacturerName, lineNotes,
 *              budgetSubChapter, resourceId, listPrice, priceSource
 *
 * DB triggers רצים אוטומטית:
 *   • total_price = quantity × unit_price (GENERATED STORED)
 *   • line_number מוקצה לפי MAX+1 ב-company (erp_po_line_number_seq trigger)
 *   • erp_validate_procurement_budget_line — budget overrun → exception
 *   • erp_po_lines_only_draft — חוסם אם PO לא DRAFT
 */

import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string }

function normalizeParams(
  params: Promise<RouteParams> | RouteParams
): Promise<RouteParams> {
  return Promise.resolve(params)
}

// ─────────────────────────────────────────────────────────────────────
// Validation schema
// ─────────────────────────────────────────────────────────────────────

const createLineSchema = z
  .object({
    // ── Required ──
    description: z.string().trim().min(1, "תיאור חובה"),
    quantity: z.number().min(0, "כמות לא יכולה להיות שלילית"),
    unitPrice: z.number().min(0, "מחיר לא יכול להיות שלילי"),
    // ── Optional — pricing ──
    discountPct: z.number().min(0).max(100).optional().default(0),
    listPrice: z.number().min(0).nullable().optional(),
    priceSource: z
      .enum(["MANUAL", "PRICELIST", "LAST_PURCHASE", "AI_SUGGESTED", "CONTRACTUAL"])
      .optional()
      .default("MANUAL"),
    // ── Optional — item ──
    itemId: z.string().uuid().nullable().optional(),
    itemSku: z.string().trim().min(1).max(128).nullable().optional(),
    supplierSku: z.string().trim().min(1).max(128).nullable().optional(),
    supplierSkuDescription: z.string().trim().min(1).max(512).nullable().optional(),
    manufacturerName: z.string().trim().min(1).max(256).nullable().optional(),
    // ── Optional — logistics ──
    uom: z.string().trim().min(1).max(32).nullable().optional(),
    supplyDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך בפורמט YYYY-MM-DD")
      .nullable()
      .optional(),
    lineNotes: z.string().nullable().optional(),
    // ── Optional — budget ──
    budgetSubChapter: z.string().trim().min(1).max(128).nullable().optional(),
    resourceId: z.string().trim().min(1).max(128).nullable().optional(),
  })
  .strict()

// ─────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id: poId } = await normalizeParams(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  // 1) Parse + validate
  const body = await req.json().catch(() => null)
  const parsed = createLineSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }
  const input = parsed.data

  // 2) שלוף את ה-PO: company_id, status, project_id
  const poQuery = await supabase
    .from("erp_purchase_orders")
    .select("id,company_id,status,project_id")
    .eq("company_id", activeCompanyId)
    .eq("id", poId)
    .maybeSingle()

  if (poQuery.error) {
    return NextResponse.json({ error: poQuery.error.message }, { status: 500 })
  }
  if (!poQuery.data) {
    return NextResponse.json({ error: "הזמנת רכש לא נמצאה" }, { status: 404 })
  }

  const po = poQuery.data as {
    id: string
    company_id: string
    status: string
    project_id: string | null
  }

  // 3) Status gate — רק DRAFT מאפשר הוספת שורות
  if (po.status !== "DRAFT") {
    // בדוק דרך metadata table
    const statusMeta = await supabase
      .from("erp_po_status_types")
      .select("allow_changes")
      .eq("status", po.status)
      .maybeSingle()

    const allowChanges = statusMeta.data
      ? Boolean((statusMeta.data as { allow_changes: boolean }).allow_changes)
      : po.status === "DRAFT"

    if (!allowChanges) {
      return NextResponse.json(
        {
          error: `לא ניתן להוסיף שורות ל-PO בסטטוס ${po.status}`,
          code: "STATUS_LOCKED",
        },
        { status: 409 }
      )
    }
  }

  // 4) ולידציה של itemId אם סופק
  if (input.itemId) {
    const itemCheck = await supabase
      .from("erp_md_items")
      .select("id")
      .eq("company_id", activeCompanyId)
      .eq("id", input.itemId)
      .maybeSingle()
    if (itemCheck.error || !itemCheck.data) {
      return NextResponse.json({ error: "מוצר לא נמצא" }, { status: 400 })
    }
  }

  // 5) INSERT
  const insertPayload: Record<string, unknown> = {
    company_id: activeCompanyId,
    purchase_order_id: poId,
    project_id: po.project_id,
    description: input.description,
    quantity: input.quantity,
    unit_price: input.unitPrice,
    discount_pct: input.discountPct,
  }

  if (input.listPrice != null) insertPayload.list_price = input.listPrice
  if (input.priceSource) insertPayload.price_source = input.priceSource
  if (input.itemId != null) insertPayload.item_id = input.itemId
  if (input.itemSku != null) insertPayload.item_sku = input.itemSku
  if (input.supplierSku != null) insertPayload.supplier_sku = input.supplierSku
  if (input.supplierSkuDescription != null)
    insertPayload.supplier_sku_description = input.supplierSkuDescription
  if (input.manufacturerName != null)
    insertPayload.manufacturer_name = input.manufacturerName
  if (input.uom != null) insertPayload.uom = input.uom
  if (input.supplyDate != null) insertPayload.supply_date = input.supplyDate
  if (input.lineNotes != null) insertPayload.line_notes = input.lineNotes
  if (input.budgetSubChapter != null)
    insertPayload.budget_sub_chapter = input.budgetSubChapter
  if (input.resourceId != null) insertPayload.resource_id = input.resourceId

  const { data: newLine, error: insertError } = await supabase
    .from("erp_purchase_order_lines")
    .insert(insertPayload)
    .select(
      "id,description,quantity,unit_price,total_price,discount_pct,uom,supply_date,item_id,item_sku,supplier_sku,line_number,line_status,price_source,list_price,manufacturer_name,line_notes,created_at"
    )
    .single()

  if (insertError) {
    // budget validation trigger message comes through as DB error
    if (insertError.message.includes("budget")) {
      return NextResponse.json(
        { error: insertError.message, code: "BUDGET_EXCEEDED" },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: insertError.message }, { status: 400 })
  }

  return NextResponse.json({ data: newLine }, { status: 201 })
}
