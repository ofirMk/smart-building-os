/**
 * `/api/master-data/suppliers/[id]/purchase-orders` — Phase 9.2
 *
 * GET — מחזיר את הזמנות הרכש של ספק עם בקרת סטטוס:
 *   ?status=open    → ממתינות/אושרו/הונפקו/חלקיות (open for receipt)
 *   ?status=closed  → נסגרו/בוטלו/התקבלו במלואן
 *   (default)       → כל ההזמנות, חדשות→ישנות
 *
 * זה data source של ה-tab "הזמנות פתוחות" ב-Supplier Master/Detail
 * (Batch #5, תמונה #25 ב-`docs/priority-suppliers-reference.md`).
 *
 * שימוש בטבלה הקנונית `erp_purchase_orders`. ה-API של POs הקיים
 * (`/api/procurement/orders`) תומך ב-status בודד; כאן אנו מקבצים
 * סטטוסים לקטגוריה לוגית ("open"/"closed") כי זה מה שהמשתמש מצפה.
 */

import { type NextRequest, NextResponse } from "next/server"
import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ----------------------------------------------------------------------------
// קבוצות סטטוסים — חייב להיות סינכרון מול orders-list-scaffold/PO API
// ----------------------------------------------------------------------------

const OPEN_STATUSES = [
  "DRAFT",
  "PENDING",
  "PENDING_APPROVAL",
  "PENDING_PRICE_APPROVAL",
  "PENDING_CEO_APPROVAL",
  "APPROVED",
  "ISSUED",
  "SENT_TO_SUPPLIER",
  "PARTIALLY_RECEIVED",
] as const

const CLOSED_STATUSES = [
  "FULLY_RECEIVED",
  "RECEIVED",
  "CLOSED",
  "CANCELED",
  "CANCELLED",
] as const

function normalizeParams(
  params: Promise<{ id: string }> | { id: string },
): Promise<{ id: string }> {
  return Promise.resolve(params)
}

export type SupplierPoDto = {
  id: string
  poNumber: string
  title: string
  status: string
  totalAmount: number
  currency: string
  issuedAt: string | null
  createdAt: string
}

type Row = {
  id: string
  po_number: string
  title: string
  status: string
  total_amount: number | string
  total_amount_gross: number | string | null
  currency: string | null
  issued_at: string | null
  created_at: string
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  const { id: supplierId } = await normalizeParams(params)
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const filter = req.nextUrl.searchParams.get("status")?.trim().toLowerCase()

  let query = supabase
    .from("erp_purchase_orders")
    .select(
      "id,po_number,title,status,total_amount,total_amount_gross,currency,issued_at,created_at",
    )
    .eq("company_id", activeCompanyId)
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: false })

  if (filter === "open") {
    query = query.in("status", OPEN_STATUSES as unknown as string[])
  } else if (filter === "closed") {
    query = query.in("status", CLOSED_STATUSES as unknown as string[])
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const dto: SupplierPoDto[] = ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    poNumber: r.po_number,
    title: r.title,
    status: r.status,
    totalAmount: Number(r.total_amount_gross ?? r.total_amount),
    currency: r.currency ?? "ILS",
    issuedAt: r.issued_at,
    createdAt: r.created_at,
  }))

  return NextResponse.json({ data: dto })
}
