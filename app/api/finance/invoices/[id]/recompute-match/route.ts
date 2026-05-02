/**
 * `/api/finance/invoices/[id]/recompute-match` — Phase 8.3 Step 2
 *
 * POST — מפעיל את ה-RPC `erp_perform_3way_match(p_invoice_id)` ומחזיר את
 * תוצאתו ב-camelCase. הפונקציה ב-DB אטומית ו-idempotent — ניתן לקרוא
 * שוב ושוב בלי לכפול נתונים.
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"
import type { ErpPerform3WayMatchResult } from "@/types/erp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string }

type RpcRow = {
  invoice_id: string
  new_invoice_status: string
  total_invoice_lines: number | string
  matched_lines: number | string
  perfect_lines: number | string
  qty_variance_lines: number | string
  price_variance_lines: number | string
  mixed_variance_lines: number | string
  unmatched_lines: number | string
  total_qty_diff: number | string
  total_price_diff_value: number | string
}

function num(v: number | string | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === "string" ? Number(v) : v
  return Number.isFinite(n) ? n : 0
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams },
) {
  const { id } = await Promise.resolve(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  // וידוא שהחשבונית בכלל שייכת לחברה הפעילה (ה-RPC עצמו עושה את זה,
  // אבל החזרת 404 ידידותית בלי להפעיל את ה-RPC חוסכת לוג מיותר).
  const ownership = await supabase
    .from("erp_vendor_invoices")
    .select("id,status")
    .eq("company_id", activeCompanyId)
    .eq("id", id)
    .maybeSingle()

  if (ownership.error) {
    return NextResponse.json(
      { error: ownership.error.message },
      { status: 500 },
    )
  }
  if (!ownership.data) {
    return NextResponse.json({ error: "חשבונית לא נמצאה" }, { status: 404 })
  }
  if ((ownership.data as { status: string }).status === "CANCELLED") {
    return NextResponse.json(
      { error: "לא ניתן להריץ התאמה לחשבונית שבוטלה" },
      { status: 409 },
    )
  }

  const rpc = await supabase.rpc("erp_perform_3way_match", { p_invoice_id: id })
  if (rpc.error) {
    return NextResponse.json({ error: rpc.error.message }, { status: 500 })
  }
  const row = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as RpcRow | null
  if (!row) {
    return NextResponse.json(
      { error: "ה-RPC לא החזיר תוצאה — בדוק לוגים" },
      { status: 500 },
    )
  }

  const result: ErpPerform3WayMatchResult = {
    invoiceId: row.invoice_id,
    newInvoiceStatus: row.new_invoice_status as ErpPerform3WayMatchResult["newInvoiceStatus"],
    totalInvoiceLines: num(row.total_invoice_lines),
    matchedLines: num(row.matched_lines),
    perfectLines: num(row.perfect_lines),
    qtyVarianceLines: num(row.qty_variance_lines),
    priceVarianceLines: num(row.price_variance_lines),
    mixedVarianceLines: num(row.mixed_variance_lines),
    unmatchedLines: num(row.unmatched_lines),
    totalQtyDiff: num(row.total_qty_diff),
    totalPriceDiffValue: num(row.total_price_diff_value),
  }

  return NextResponse.json({ data: result })
}
