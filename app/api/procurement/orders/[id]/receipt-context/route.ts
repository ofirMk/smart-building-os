/**
 * `/api/procurement/orders/[id]/receipt-context` — Phase 8.2
 *
 * GET — מחזיר את כל המידע שהמחסנאי צריך כדי לקלוט PO אחת ספציפית:
 *   - פרטי ה-PO (מספר רשמי, ספק, פרויקט, סטטוס)
 *   - כל השורות: כמה הוזמן, כמה כבר נקלט בעבר (מצטבר מ-POL.received_qty),
 *     וכמה "נותר לקבלה" — זה הנתון הקריטי שברירת המחדל של שדה הקלט
 *     תציג כדי לאפשר "קליטה מלאה בקליק" במסלול המהיר.
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string }

function normalizeParams(
  params: Promise<RouteParams> | RouteParams,
): Promise<RouteParams> {
  return Promise.resolve(params)
}

export type ReceiptContextLineDto = {
  id: string
  itemId: string | null
  itemNumber: string | null
  itemSku: string | null
  description: string
  orderedQty: number
  receivedQty: number
  remainingQty: number
}

export type ReceiptContextDto = {
  id: string
  poNumber: string
  officialPoNumber: string | null
  title: string
  status: string
  currency: string
  supplier: { id: string; name: string } | null
  project: { id: string; name: string | null } | null
  lines: ReceiptContextLineDto[]
}

type ItemJoin = {
  id: string
  item_number: string
} | null

type LineRow = {
  id: string
  item_id: string | null
  item_sku: string | null
  description: string
  quantity: number | string
  received_qty: number | string | null
  created_at: string
  item: ItemJoin | ItemJoin[]
}

type HeaderRow = {
  id: string
  po_number: string
  official_po_number: string | null
  title: string
  status: string
  currency: string | null
  supplier: { id: string; name: string } | { id: string; name: string }[] | null
  project:
    | { id: string; name: string | null }
    | { id: string; name: string | null }[]
    | null
}

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  if (Array.isArray(v)) return v[0] ?? null
  return v
}

function n(v: number | string | null | undefined): number {
  if (v == null) return 0
  const x = typeof v === "string" ? Number(v) : v
  return Number.isFinite(x) ? x : 0
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams },
) {
  const { id } = await normalizeParams(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const headerQuery = await supabase
    .from("erp_purchase_orders")
    .select(
      [
        "id,po_number,official_po_number,title,status,currency",
        "supplier:erp_md_suppliers!supplier_id(id,name)",
        "project:erp_proj_projects!project_id(id,name)",
      ].join(","),
    )
    .eq("company_id", activeCompanyId)
    .eq("id", id)
    .maybeSingle()

  if (headerQuery.error) {
    return NextResponse.json({ error: headerQuery.error.message }, { status: 500 })
  }
  if (!headerQuery.data) {
    return NextResponse.json({ error: "הזמנה לא נמצאה" }, { status: 404 })
  }
  const header = headerQuery.data as HeaderRow

  // רק הזמנות פתוחות ל-GR נעטפות פה (softening גם APPROVED מאפשר קליטה
  // טרם שליחה — אבל ה-UI מסתיר זאת; ה-API נועל רק מצבי terminal).
  if (!["SENT_TO_SUPPLIER", "PARTIALLY_RECEIVED", "APPROVED"].includes(header.status)) {
    return NextResponse.json(
      { error: `לא ניתן לקלוט סחורה מ-PO במצב ${header.status}` },
      { status: 409 },
    )
  }

  const linesQuery = await supabase
    .from("erp_purchase_order_lines")
    .select(
      [
        "id,item_id,item_sku,description,quantity,received_qty,created_at",
        "item:erp_md_items!item_id(id,item_number)",
      ].join(","),
    )
    .eq("company_id", activeCompanyId)
    .eq("purchase_order_id", id)
    .order("created_at", { ascending: true })

  if (linesQuery.error) {
    return NextResponse.json({ error: linesQuery.error.message }, { status: 500 })
  }

  const supplier = pickOne(header.supplier)
  const project = pickOne(header.project)
  const lines = ((linesQuery.data ?? []) as LineRow[]).map(
    (line): ReceiptContextLineDto => {
      const item = pickOne(line.item)
      const ordered = n(line.quantity)
      const received = n(line.received_qty)
      const remaining = Math.max(0, ordered - received)
      return {
        id: line.id,
        itemId: line.item_id,
        itemNumber: item?.item_number ?? null,
        itemSku: line.item_sku,
        description: line.description,
        orderedQty: ordered,
        receivedQty: received,
        remainingQty: remaining,
      }
    },
  )

  const dto: ReceiptContextDto = {
    id: header.id,
    poNumber: header.po_number,
    officialPoNumber: header.official_po_number,
    title: header.title,
    status: header.status,
    currency: header.currency ?? "ILS",
    supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
    project: project ? { id: project.id, name: project.name } : null,
    lines,
  }

  return NextResponse.json({ data: dto })
}
