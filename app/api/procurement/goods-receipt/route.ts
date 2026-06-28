/**
 * `/api/procurement/goods-receipt` — Phase 8.2
 *
 * POST — קליטת סחורה במחסן.
 *
 * ## Flow
 *   1. אימות ה-body (PO id + רשימת שורות עם receivedQty / rejectedQty).
 *   2. שליפת ה-PO ושורותיו מהעבר שלו — כדי למפות את השדות ה-NOT NULL
 *      הישנים (project_id / budget_sub_chapter / resource_id / unit_price)
 *      אוטומטית משורת ה-PO המקבילה. המחסנאי לא צריך לדעת על הבקרה הזו.
 *   3. יצירת `erp_goods_receipts` עם gr_number מורכב: `GR-YYYYMMDD-XXXX`
 *      (fallback אם יש collision — retry עד 3 פעמים עם random שונה).
 *   4. יצירת `erp_goods_receipt_lines` לכל שורה ש-`receivedQty > 0` או
 *      שיש לה `rejectedQty > 0` (שורות עם 0/0 מדולגות — לא מעניין
 *      לתעד שורה שלא נגענו בה).
 *   5. קריאה ל-RPC `erp_complete_goods_receipt(gr_id)` שמבצע rollup
 *      אטומי: מוסיף את `quantity` ל-`erp_purchase_order_lines.received_qty`
 *      של שורות ה-PO המתאימות, וקובע סטטוס PO חדש (PARTIALLY/FULLY).
 *
 * ## למה לא הכל ב-RPC אחד
 *   הוולידציה + המיפוי של שדות-NOT-NULL נוח יותר ב-TypeScript (טיפוסים,
 *   Zod, logging). ה-RPC עצמו מטפל רק בחלק הלא-טריוויאלי (rollup + status).
 */

import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ── GET — list goods receipts for this company ───────────────────────────────
export async function GET(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { data, error } = await supabase
    .from("erp_goods_receipts")
    .select(
      "id,gr_number,status,receipt_date,vendor_delivery_note,notes,created_at," +
        "purchase_order:erp_purchase_orders!purchase_order_id(id,po_number,supplier:erp_md_suppliers!supplier_id(id,name))",
    )
    .eq("company_id", activeCompanyId)
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

const lineSchema = z.object({
  purchaseOrderLineId: z.string().uuid(),
  receivedQty: z.number().finite().min(0),
  rejectedQty: z.number().finite().min(0).default(0),
  rejectReason: z.string().trim().max(500).optional().nullable(),
})

const bodySchema = z.object({
  purchaseOrderId: z.string().uuid(),
  vendorDeliveryNote: z.string().trim().max(128).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  lines: z.array(lineSchema).min(1, "חייבת להיות לפחות שורה אחת נקלטת"),
})

type PoLineMapRow = {
  id: string
  item_id: string | null
  project_id: string
  budget_sub_chapter: string
  resource_id: string
  description: string
  unit_price: number | string
  quantity: number | string
  received_qty: number | string | null
}

export type CompleteGoodsReceiptResponse = {
  goodsReceiptId: string
  grNumber: string
  newGrStatus: string
  purchaseOrderId: string
  newPoStatus: string
  totalOrderedQty: number
  totalReceivedQty: number
}

function buildGrNumber(attempt: number): string {
  const d = new Date()
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`
  // 4 תווים base36 = ~1.6M אפשרויות; עם retry זה מספיק בהחלט.
  const suffix =
    Math.random().toString(36).slice(2, 6).toUpperCase() +
    (attempt > 0 ? String(attempt) : "")
  return `GR-${ymd}-${suffix}`
}

export async function POST(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId, userId } = ctx

  const json = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Body לא תקין" },
      { status: 400 },
    )
  }
  const body = parsed.data

  // ── 1) PO + שורות ה-PO הרלוונטיות ─────────────────────────────────────────
  const poQuery = await supabase
    .from("erp_purchase_orders")
    .select("id,status")
    .eq("company_id", activeCompanyId)
    .eq("id", body.purchaseOrderId)
    .maybeSingle()

  if (poQuery.error) {
    return NextResponse.json({ error: poQuery.error.message }, { status: 500 })
  }
  if (!poQuery.data) {
    return NextResponse.json({ error: "הזמנה לא נמצאה" }, { status: 404 })
  }
  const poStatus = (poQuery.data as { status: string }).status
  if (
    !["SENT_TO_SUPPLIER", "PARTIALLY_RECEIVED", "APPROVED"].includes(poStatus)
  ) {
    return NextResponse.json(
      { error: `לא ניתן לקלוט סחורה מ-PO במצב ${poStatus}` },
      { status: 409 },
    )
  }

  const lineIds = body.lines.map((l) => l.purchaseOrderLineId)
  const poLinesQuery = await supabase
    .from("erp_purchase_order_lines")
    .select(
      "id,item_id,project_id,budget_sub_chapter,resource_id,description,unit_price,quantity,received_qty",
    )
    .eq("company_id", activeCompanyId)
    .eq("purchase_order_id", body.purchaseOrderId)
    .in("id", lineIds)

  if (poLinesQuery.error) {
    return NextResponse.json(
      { error: poLinesQuery.error.message },
      { status: 500 },
    )
  }

  const poLineMap = new Map<string, PoLineMapRow>(
    ((poLinesQuery.data ?? []) as PoLineMapRow[]).map((row) => [row.id, row]),
  )

  // בדיקות עסקיות פר-שורה:
  for (const line of body.lines) {
    const poLine = poLineMap.get(line.purchaseOrderLineId)
    if (!poLine) {
      return NextResponse.json(
        {
          error: `שורה ${line.purchaseOrderLineId} לא שייכת ל-PO ${body.purchaseOrderId}`,
        },
        { status: 400 },
      )
    }
    const ordered = Number(poLine.quantity ?? 0)
    const alreadyReceived = Number(poLine.received_qty ?? 0)
    const remaining = Math.max(0, ordered - alreadyReceived)
    const totalNow = line.receivedQty + line.rejectedQty
    if (totalNow > remaining + 1e-6) {
      return NextResponse.json(
        {
          error: `שורה "${poLine.description}": נשאר לקליטה ${remaining} אך הוזן סה"כ ${totalNow}`,
        },
        { status: 422 },
      )
    }
  }

  // סינון שורות ריקות — נסף את אלו עם activity בלבד.
  const activeLines = body.lines.filter(
    (l) => l.receivedQty > 0 || l.rejectedQty > 0,
  )
  if (activeLines.length === 0) {
    return NextResponse.json(
      { error: "לא הוזנה כמות נקלטת או נדחית בשום שורה" },
      { status: 400 },
    )
  }

  // ── 2) יצירת GR header עם retry על gr_number collisions ─────────────────
  let grRow: { id: string; gr_number: string } | null = null
  let lastInsertError: string | null = null
  for (let attempt = 0; attempt < 3 && !grRow; attempt++) {
    const grNumber = buildGrNumber(attempt)
    const ins = await supabase
      .from("erp_goods_receipts")
      .insert({
        company_id: activeCompanyId,
        purchase_order_id: body.purchaseOrderId,
        gr_number: grNumber,
        status: "DRAFT",
        vendor_delivery_note: body.vendorDeliveryNote?.trim() || null,
        notes: body.notes?.trim() || null,
        received_by: userId ?? null,
        receipt_date: new Date().toISOString().slice(0, 10),
      })
      .select("id,gr_number")
      .single()

    if (ins.error) {
      lastInsertError = ins.error.message
      // ייחודיות על gr_number — ננסה שוב עם random אחר.
      if (
        ins.error.code === "23505" &&
        ins.error.message.includes("gr_number")
      ) {
        continue
      }
      return NextResponse.json({ error: ins.error.message }, { status: 500 })
    }
    grRow = ins.data as { id: string; gr_number: string }
  }
  if (!grRow) {
    return NextResponse.json(
      { error: `לא ניתן להקצות מספר תעודת קבלה ייחודי: ${lastInsertError}` },
      { status: 500 },
    )
  }

  // ── 3) שורות ה-GR ───────────────────────────────────────────────────────
  const linesToInsert = activeLines.map((line) => {
    const po = poLineMap.get(line.purchaseOrderLineId)!
    return {
      company_id: activeCompanyId,
      goods_receipt_id: grRow!.id,
      purchase_order_line_id: po.id,
      item_id: po.item_id,
      project_id: po.project_id,
      budget_sub_chapter: po.budget_sub_chapter,
      resource_id: po.resource_id,
      description: po.description,
      quantity: line.receivedQty,
      rejected_qty: line.rejectedQty,
      reject_reason: line.rejectReason?.trim() || null,
      unit_price: Number(po.unit_price ?? 0),
    }
  })

  const linesInsert = await supabase
    .from("erp_goods_receipt_lines")
    .insert(linesToInsert)

  if (linesInsert.error) {
    // rollback ידני: מחיקת ה-GR header כדי שלא יישאר יתום.
    await supabase
      .from("erp_goods_receipts")
      .delete()
      .eq("id", grRow.id)
      .eq("company_id", activeCompanyId)
    return NextResponse.json(
      { error: `שמירת שורות נכשלה: ${linesInsert.error.message}` },
      { status: 500 },
    )
  }

  // ── 4) סגירה + rollup ───────────────────────────────────────────────────
  const rpc = await supabase.rpc("erp_complete_goods_receipt", {
    p_gr_id: grRow.id,
  })

  if (rpc.error) {
    return NextResponse.json(
      {
        error: `ה-GR נוצר אך סגירה נכשלה: ${rpc.error.message}. ה-GR נשאר במצב DRAFT — אפשר לבדוק ידנית ב-DB.`,
      },
      { status: 500 },
    )
  }

  const rpcRow = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data
  const response: CompleteGoodsReceiptResponse = {
    goodsReceiptId: grRow.id,
    grNumber: grRow.gr_number,
    newGrStatus: rpcRow?.new_gr_status ?? "COMPLETED",
    purchaseOrderId: body.purchaseOrderId,
    newPoStatus: rpcRow?.new_po_status ?? poStatus,
    totalOrderedQty: Number(rpcRow?.total_ordered_qty ?? 0),
    totalReceivedQty: Number(rpcRow?.total_received_qty ?? 0),
  }

  return NextResponse.json({ data: response })
}
