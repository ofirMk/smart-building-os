/**
 * `/api/procurement/orders/[id]/invoices` — Phase 8.3.X (Master/Detail adoption on POs list)
 *
 * GET — מחזיר את חשבוניות הספק (`erp_vendor_invoices`) שקשורות ל-PO
 *       מסוים, עם aggregations קלים של 3-Way Match (מ-`erp_invoice_po_line_matches`).
 *
 * ## Why a new endpoint
 *   כבר קיים `/api/finance/invoices/pending-match` שמחזיר את *כל* החשבוניות
 *   הפתוחות ב-company — שימושי למסך 3-Way Match של ה-AP, אבל משיג
 *   N חשבוניות בכל קריאה גם כשאנחנו צריכים רק את זו-ואחת של PO ספציפי.
 *
 *   ב-Master/Detail של מסך ה-POs, כשהמשתמש בוחר שורה הוא רוצה לראות
 *   **רק** את החשבוניות של אותה הזמנה. לשלוף 500 ולסנן בלקוח זה יקר,
 *   לא scalable, וגם גורם ל-UI-flicker. לכן endpoint ייעודי עם index
 *   טבעי על `purchase_order_id` (קיים במיגרציה של invoice-matching).
 *
 * ## Aggregations
 *   לכל חשבונית: לספור שורות match לפי קטגוריה (matched / perfect /
 *   variance / unmatched) — אותו חישוב כמו ב-pending-match, רק מצומצם
 *   ל-PO אחד.
 *
 * Tenant: דרך `requireProcurementApiContext` (RLS + `x-active-company-id`).
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"
import type {
  ErpInvoiceMatchLineStatus,
  ErpVendorInvoiceStatus,
} from "@/types/erp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string }

function normalizeParams(
  params: Promise<RouteParams> | RouteParams,
): Promise<RouteParams> {
  return Promise.resolve(params)
}

// ─────────────────────────────────────────────────────────────────────────────
// DTO
// ─────────────────────────────────────────────────────────────────────────────

export type PoInvoiceRowDto = {
  id: string
  invoiceNumber: string
  status: ErpVendorInvoiceStatus
  invoiceDate: string | null
  totalAmount: number
  priceVarianceAmount: number
  /** סך שורות חשבונית. */
  totalInvoiceLines: number
  matchedLines: number
  perfectLines: number
  varianceLines: number
  unmatchedLines: number
  /** השפעת Variance בש״ח (price_diff × invoice_qty על שורות variance). */
  varianceImpactValue: number
  /** true אם מעולם לא רצה התאמה (אין רשומות ב-bridge). */
  needsFirstMatch: boolean
}

type HeaderRow = {
  id: string
  invoice_number: string
  status: ErpVendorInvoiceStatus
  invoice_date: string | null
  total_amount: number | string
  price_variance_amount: number | string | null
}

type LineCountRow = {
  vendor_invoice_id: string
}

type MatchAggRow = {
  invoice_id: string
  match_status: ErpInvoiceMatchLineStatus
  invoice_qty: number | string
  price_diff: number | string
}

function num(v: number | string | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === "string" ? Number(v) : v
  return Number.isFinite(n) ? n : 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams },
) {
  const { id: poId } = await normalizeParams(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  // ── 1) Headers of invoices linked to this PO ─────────────────────────────
  //    סינון ב-`purchase_order_id` (קיים index). אין צורך בסטטוס filter פה —
  //    המשתמש רוצה לראות גם חשבוניות שכבר אושרו (APPROVED/READY_FOR_PAYMENT)
  //    כחלק מההיסטוריה של ה-PO, בניגוד ל-pending-match של ה-AP workbench.
  const headersQ = await supabase
    .from("erp_vendor_invoices")
    .select(
      [
        "id,invoice_number,status,invoice_date",
        "total_amount,price_variance_amount",
      ].join(","),
    )
    .eq("company_id", activeCompanyId)
    .eq("purchase_order_id", poId)
    .order("invoice_date", { ascending: false, nullsFirst: false })

  if (headersQ.error) {
    return NextResponse.json({ error: headersQ.error.message }, { status: 500 })
  }

  const headers = (headersQ.data ?? []) as HeaderRow[]
  if (headers.length === 0) {
    return NextResponse.json({ data: [] satisfies PoInvoiceRowDto[] })
  }

  const invoiceIds = headers.map((h) => h.id)

  // ── 2) Total invoice lines per invoice ───────────────────────────────────
  const linesCountQ = await supabase
    .from("erp_vendor_invoice_lines")
    .select("vendor_invoice_id")
    .eq("company_id", activeCompanyId)
    .in("vendor_invoice_id", invoiceIds)

  if (linesCountQ.error) {
    return NextResponse.json(
      { error: linesCountQ.error.message },
      { status: 500 },
    )
  }
  const linesByInvoice = new Map<string, number>()
  for (const row of (linesCountQ.data ?? []) as LineCountRow[]) {
    linesByInvoice.set(
      row.vendor_invoice_id,
      (linesByInvoice.get(row.vendor_invoice_id) ?? 0) + 1,
    )
  }

  // ── 3) Match aggregations ─────────────────────────────────────────────────
  const matchesQ = await supabase
    .from("erp_invoice_po_line_matches")
    .select("invoice_id,match_status,invoice_qty,price_diff")
    .eq("company_id", activeCompanyId)
    .in("invoice_id", invoiceIds)

  if (matchesQ.error) {
    return NextResponse.json(
      { error: matchesQ.error.message },
      { status: 500 },
    )
  }

  type Agg = {
    matched: number
    perfect: number
    variance: number
    impactValue: number
  }
  const aggByInvoice = new Map<string, Agg>()
  for (const row of (matchesQ.data ?? []) as MatchAggRow[]) {
    const a =
      aggByInvoice.get(row.invoice_id) ?? {
        matched: 0,
        perfect: 0,
        variance: 0,
        impactValue: 0,
      }
    a.matched += 1
    if (row.match_status === "PERFECT") {
      a.perfect += 1
    } else {
      a.variance += 1
      a.impactValue += num(row.price_diff) * num(row.invoice_qty)
    }
    aggByInvoice.set(row.invoice_id, a)
  }

  // ── 4) Build DTOs ─────────────────────────────────────────────────────────
  const dto: PoInvoiceRowDto[] = headers.map((h) => {
    const totalLines = linesByInvoice.get(h.id) ?? 0
    const agg =
      aggByInvoice.get(h.id) ?? {
        matched: 0,
        perfect: 0,
        variance: 0,
        impactValue: 0,
      }
    return {
      id: h.id,
      invoiceNumber: h.invoice_number,
      status: h.status,
      invoiceDate: h.invoice_date,
      totalAmount: num(h.total_amount),
      priceVarianceAmount: num(h.price_variance_amount),
      totalInvoiceLines: totalLines,
      matchedLines: agg.matched,
      perfectLines: agg.perfect,
      varianceLines: agg.variance,
      unmatchedLines: Math.max(0, totalLines - agg.matched),
      varianceImpactValue: Math.round(agg.impactValue * 100) / 100,
      needsFirstMatch: agg.matched === 0,
    }
  })

  return NextResponse.json({ data: dto })
}
