/**
 * `/api/procurement/orders/open-for-receipt` — Phase 8.2
 *
 * GET — רשימת הזמנות רכש פתוחות לקליטה במחסן.
 *
 * ## Filter policy
 *   המחסנאי רואה **רק** הזמנות בסטטוס `SENT_TO_SUPPLIER` או
 *   `PARTIALLY_RECEIVED`. הזמנות APPROVED לא שיצאו עדיין לספק — לא נקלטות;
 *   FULLY_RECEIVED — כבר נסגרו פיזית. זה דפוס "עבודה הפעילה של המחסן".
 *
 * ## Shape
 *   כל שורה: מספיק לאתר ולהציג את ה-PO (poNumber, officialPoNumber, שם
 *   ספק, שם פרויקט, כמה שורות פתוחות עדיין לקליטה).
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export type OpenForReceiptPoDto = {
  id: string
  poNumber: string
  officialPoNumber: string | null
  title: string
  status: "SENT_TO_SUPPLIER" | "PARTIALLY_RECEIVED"
  issuedAt: string | null
  supplierName: string | null
  projectName: string | null
  /** מספר שורות שעדיין לא התקבלו במלואן. */
  openLineCount: number
}

type PoRow = {
  id: string
  po_number: string
  official_po_number: string | null
  title: string
  status: string
  issued_at: string | null
  supplier: { name: string } | { name: string }[] | null
  project: { name: string | null } | { name: string | null }[] | null
  lines: Array<{ quantity: number | string; received_qty: number | string | null }>
}

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  if (Array.isArray(v)) return v[0] ?? null
  return v
}

export async function GET(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { data, error } = await supabase
    .from("erp_purchase_orders")
    .select(
      [
        "id,po_number,official_po_number,title,status,issued_at",
        "supplier:erp_md_suppliers!supplier_id(name)",
        "project:erp_proj_projects!project_id(name)",
        "lines:erp_purchase_order_lines!purchase_order_id(quantity,received_qty)",
      ].join(","),
    )
    .eq("company_id", activeCompanyId)
    .in("status", ["SENT_TO_SUPPLIER", "PARTIALLY_RECEIVED"])
    .order("issued_at", { ascending: false, nullsFirst: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const dto: OpenForReceiptPoDto[] = ((data ?? []) as PoRow[]).map((row) => {
    const supplier = pickOne(row.supplier)
    const project = pickOne(row.project)
    const openLineCount = (row.lines ?? []).reduce((count, line) => {
      const qty = Number(line.quantity ?? 0)
      const rec = Number(line.received_qty ?? 0)
      return rec < qty ? count + 1 : count
    }, 0)
    return {
      id: row.id,
      poNumber: row.po_number,
      officialPoNumber: row.official_po_number,
      title: row.title,
      status:
        row.status === "PARTIALLY_RECEIVED"
          ? "PARTIALLY_RECEIVED"
          : "SENT_TO_SUPPLIER",
      issuedAt: row.issued_at,
      supplierName: supplier?.name ?? null,
      projectName: project?.name ?? null,
      openLineCount,
    }
  })

  return NextResponse.json({ data: dto })
}
