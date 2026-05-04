/**
 * `/api/procurement/orders/[id]/lines/[lineId]` — Phase B''' (Line editing)
 * ------------------------------------------------------------------------
 * PATCH — עדכון שורת PO בודדת. השדות הניתנים לעריכה הם **אוצרים בקפידה**:
 * שדות שהם תוצאת חישוב (total_price, line_number) או מקור-אמת חיצוני
 * (received_qty מ-GR rollup, price_deviation_pct מ-Phase 7.5) **לא**
 * מותרים לעדכון ידני — DB triggers/columns יחשבו אותם מחדש.
 *
 * ────────────────── שדות מותרים לעדכון ──────────────────
 *   description           : string ≥ 1 (CHECK constraint)
 *   quantity              : number ≥ 0 (CHECK)
 *   unitPrice             : number ≥ 0 (CHECK)
 *   discountPct           : 0..100  (Phase A)
 *   supplyDate            : date או null (Phase A)
 *   uom                   : string או null (Phase A)
 *   supplierSku           : string או null (Phase A)
 *   supplierSkuDescription: string או null (Phase A)
 *   manufacturerName      : string או null (Phase A)
 *   lineNotes             : string או null (Phase A)
 *
 * ────────────────── שדות החסומים (defense in depth) ──────────────────
 *   total_price           : generated column (quantity*unit_price)
 *   line_number           : מנוהל אוטומטית (Tesla auto-fill ב-POST)
 *   received_qty          : מתעדכן ע"י GR rollup
 *   price_deviation_pct   : מחושב ע"י Phase 7.5 logic
 *   line_status           : מנוהל ע"י triggers
 *   project_id            : שינוי שיוך פרויקט = use case מסוכן; cancel + recreate
 *   budget_sub_chapter,
 *   resource_id           : שינוי תקציב דורש flow ייעודי (re-validation)
 *   item_id, item_sku     : שינוי פריט = שורה אחרת לוגית
 *
 * ────────────────── Status gate ──────────────────
 * הטריגר `erp_po_lines_only_draft` כבר חוסם UPDATE על שורות אם
 * ה-PO לא ב-DRAFT. אנחנו קוראים את הסטטוס מראש כדי להחזיר 409 ידידותי
 * במקום שגיאת DB גנרית. **שים לב**: זה stricter מ-PUT של ה-header
 * (שמשתמש ב-allow_changes flag); שורות נצמדות ל-DRAFT-only.
 *
 * ────────────────── Budget validation ──────────────────
 * הטריגר גם מפעיל `erp_validate_procurement_budget_line` שזורק exception
 * אם `quantity*unit_price` חורג מהתקציב. אנחנו מחזירים את ההודעה במלואה
 * ב-400 (DB exception → response message).
 */

import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string; lineId: string }

function normalizeParams(
  params: Promise<RouteParams> | RouteParams
): Promise<RouteParams> {
  return Promise.resolve(params)
}

// ─────────────────────────────────────────────────────────────────────
// Validation schema. כל השדות optional — נשלח רק delta.
// ─────────────────────────────────────────────────────────────────────

const updateLineSchema = z
  .object({
    description: z.string().trim().min(1).optional(),
    quantity: z.number().min(0).optional(),
    unitPrice: z.number().min(0).optional(),
    discountPct: z.number().min(0).max(100).optional(),
    supplyDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך חייב בפורמט YYYY-MM-DD")
      .nullable()
      .optional(),
    uom: z.string().trim().min(1).max(32).nullable().optional(),
    supplierSku: z.string().trim().min(1).max(64).nullable().optional(),
    supplierSkuDescription: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .nullable()
      .optional(),
    manufacturerName: z.string().trim().min(1).max(128).nullable().optional(),
    lineNotes: z.string().nullable().optional(),
  })
  .strict()

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id: poId, lineId } = await normalizeParams(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  // 1) Parse + validate
  const body = await req.json().catch(() => null)
  const parsed = updateLineSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }
  const input = parsed.data

  // 2) Verify ownership: השורה שייכת ל-PO ול-company.
  //    קוראים גם את ה-status של ה-PO כדי להחזיר 409 idiomatic לפני שנגיע
  //    לטריגר. (Defense in depth — הטריגר עדיין יחסום במקרה של race.)
  const lineQuery = await supabase
    .from("erp_purchase_order_lines")
    .select("id, purchase_order_id")
    .eq("company_id", activeCompanyId)
    .eq("purchase_order_id", poId)
    .eq("id", lineId)
    .maybeSingle()

  if (lineQuery.error) {
    return NextResponse.json({ error: lineQuery.error.message }, { status: 500 })
  }
  if (!lineQuery.data) {
    return NextResponse.json({ error: "שורת ההזמנה לא נמצאה" }, { status: 404 })
  }

  const poQuery = await supabase
    .from("erp_purchase_orders")
    .select("status")
    .eq("company_id", activeCompanyId)
    .eq("id", poId)
    .maybeSingle()

  if (poQuery.error) {
    return NextResponse.json({ error: poQuery.error.message }, { status: 500 })
  }
  if (!poQuery.data) {
    return NextResponse.json({ error: "הזמנת הרכש לא נמצאה" }, { status: 404 })
  }

  const currentStatus = (poQuery.data as { status: string }).status
  if (currentStatus !== "DRAFT") {
    return NextResponse.json(
      {
        error: `שורות ההזמנה ניתנות לעריכה רק במצב טיוטה (סטטוס נוכחי: ${currentStatus}).`,
        code: "STATUS_LOCKED",
      },
      { status: 409 }
    )
  }

  // 3) בנייה דינמית של ה-patch — רק שדות שסופקו במפורש.
  //    null = "נקה את הערך"; undefined = "אל תיגע".
  const patch: Record<string, unknown> = {}
  if (input.description !== undefined) patch.description = input.description
  if (input.quantity !== undefined) patch.quantity = input.quantity
  if (input.unitPrice !== undefined) patch.unit_price = input.unitPrice
  if (input.discountPct !== undefined) patch.discount_pct = input.discountPct
  if (input.supplyDate !== undefined) patch.supply_date = input.supplyDate
  if (input.uom !== undefined) patch.uom = input.uom
  if (input.supplierSku !== undefined) patch.supplier_sku = input.supplierSku
  if (input.supplierSkuDescription !== undefined)
    patch.supplier_sku_description = input.supplierSkuDescription
  if (input.manufacturerName !== undefined)
    patch.manufacturer_name = input.manufacturerName
  if (input.lineNotes !== undefined) patch.line_notes = input.lineNotes

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "אף שדה לא סופק לעדכון" }, { status: 400 })
  }

  // 4) UPDATE. ה-DB:
  //    - יחשב מחדש את total_price (generated column).
  //    - יפעיל erp_po_lines_only_draft (status guard).
  //    - יפעיל erp_validate_procurement_budget_line (תקציב).
  //    - יפעיל triggers של recalc PO totals + Phase 7.5 deviation.
  const updateRes = await supabase
    .from("erp_purchase_order_lines")
    .update(patch)
    .eq("company_id", activeCompanyId)
    .eq("purchase_order_id", poId)
    .eq("id", lineId)

  if (updateRes.error) {
    // 23xxx = constraint violation, P0001 = raise exception (budget/status guard)
    const msg = updateRes.error.message ?? "עדכון שורת ההזמנה נכשל"
    const status =
      updateRes.error.code === "23514"
        ? 400 // CHECK constraint
        : updateRes.error.code === "P0001"
        ? 409 // raise exception (budget overrun / status guard race)
        : 500
    return NextResponse.json({ error: msg }, { status })
  }

  // 5) מינימלית — UI יבצע refetch של ה-DTO כדי לקבל את total_price המעודכן
  //    + price_deviation_pct + PO totals.
  return NextResponse.json({
    data: {
      id: lineId,
      updated: Object.keys(patch),
    },
  })
}
