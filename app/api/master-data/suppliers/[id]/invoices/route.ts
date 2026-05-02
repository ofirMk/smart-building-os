/**
 * `/api/master-data/suppliers/[id]/invoices` — Phase 9.2
 *
 * GET — מחזיר את חשבוניות הספק הכלולות במסך Supplier Master/Detail
 * (tab "חשבוניות ספק (AP)"). זה ה-AP-side complement ל-3-Way Match.
 *
 * עובד מול הטבלה הקנונית `erp_vendor_invoices` (Phase 6 + הרחבת
 * 3-Way Match). מחזיר גם aggregations של match לכל חשבונית כדי
 * שהטאב יוכל להציג סטטוס "מאושר/יש סטיות/לא הותאם" בלי round-trip.
 *
 * הערה: בניגוד ל-`/api/finance/invoices/pending-match` שמחזיר רק
 * חשבוניות לא-סגורות, כאן מחזירים **את כולן** — כי באוכלוסיית הספק
 * חשוב לראות גם חשבוניות שכבר אושרו/שולמו.
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"
import type {
  ErpInvoiceMatchLineStatus,
  ErpVendorInvoiceStatus,
} from "@/types/erp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeParams(
  params: Promise<{ id: string }> | { id: string },
): Promise<{ id: string }> {
  return Promise.resolve(params)
}

export type SupplierInvoiceDto = {
  id: string
  invoiceNumber: string
  status: ErpVendorInvoiceStatus
  invoiceDate: string | null
  totalAmount: number
  priceVarianceAmount: number
  purchaseOrderId: string | null
  poNumber: string | null
  /** סך שורות בחשבונית. */
  totalLines: number
  /** מתוכן עם match כלשהו ב-bridge. */
  matchedLines: number
  /** מתוכן ב-PERFECT. */
  perfectLines: number
  /** מתוכן עם variance. */
  varianceLines: number
}

type HeaderRow = {
  id: string
  invoice_number: string
  status: ErpVendorInvoiceStatus
  invoice_date: string | null
  total_amount: number | string
  price_variance_amount: number | string | null
  purchase_order_id: string | null
  purchase_order:
    | { po_number: string }
    | { po_number: string }[]
    | null
}

type LineRow = { vendor_invoice_id: string }

type MatchRow = {
  invoice_id: string
  match_status: ErpInvoiceMatchLineStatus
}

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function num(v: number | string | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === "string" ? Number(v) : v
  return Number.isFinite(n) ? n : 0
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  const { id: supplierId } = await normalizeParams(params)
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  // ── 1) Headers ─────────────────────────────────────────────────────────
  const headersQ = await supabase
    .from("erp_vendor_invoices")
    .select(
      [
        "id,invoice_number,status,invoice_date,total_amount,price_variance_amount,purchase_order_id",
        "purchase_order:erp_purchase_orders!purchase_order_id(po_number)",
      ].join(","),
    )
    .eq("company_id", activeCompanyId)
    .eq("supplier_id", supplierId)
    .order("invoice_date", { ascending: false, nullsFirst: false })
    .limit(500)

  if (headersQ.error) {
    return NextResponse.json({ error: headersQ.error.message }, { status: 500 })
  }
  const headers = (headersQ.data ?? []) as HeaderRow[]
  if (headers.length === 0) {
    return NextResponse.json({ data: [] satisfies SupplierInvoiceDto[] })
  }
  const ids = headers.map((h) => h.id)

  // ── 2) Lines count ─────────────────────────────────────────────────────
  const linesQ = await supabase
    .from("erp_vendor_invoice_lines")
    .select("vendor_invoice_id")
    .eq("company_id", activeCompanyId)
    .in("vendor_invoice_id", ids)

  if (linesQ.error) {
    return NextResponse.json({ error: linesQ.error.message }, { status: 500 })
  }
  const linesByInvoice = new Map<string, number>()
  for (const r of (linesQ.data ?? []) as LineRow[]) {
    linesByInvoice.set(
      r.vendor_invoice_id,
      (linesByInvoice.get(r.vendor_invoice_id) ?? 0) + 1,
    )
  }

  // ── 3) Match aggregations ──────────────────────────────────────────────
  const matchQ = await supabase
    .from("erp_invoice_po_line_matches")
    .select("invoice_id,match_status")
    .eq("company_id", activeCompanyId)
    .in("invoice_id", ids)

  if (matchQ.error) {
    return NextResponse.json({ error: matchQ.error.message }, { status: 500 })
  }
  type Agg = { matched: number; perfect: number; variance: number }
  const aggBy = new Map<string, Agg>()
  for (const r of (matchQ.data ?? []) as MatchRow[]) {
    const a = aggBy.get(r.invoice_id) ?? { matched: 0, perfect: 0, variance: 0 }
    a.matched += 1
    if (r.match_status === "PERFECT") a.perfect += 1
    else a.variance += 1
    aggBy.set(r.invoice_id, a)
  }

  // ── 4) DTOs ────────────────────────────────────────────────────────────
  const dto: SupplierInvoiceDto[] = headers.map((h) => {
    const po = pickOne(h.purchase_order)
    const totalLines = linesByInvoice.get(h.id) ?? 0
    const agg = aggBy.get(h.id) ?? { matched: 0, perfect: 0, variance: 0 }
    return {
      id: h.id,
      invoiceNumber: h.invoice_number,
      status: h.status,
      invoiceDate: h.invoice_date,
      totalAmount: num(h.total_amount),
      priceVarianceAmount: num(h.price_variance_amount),
      purchaseOrderId: h.purchase_order_id,
      poNumber: po?.po_number ?? null,
      totalLines,
      matchedLines: agg.matched,
      perfectLines: agg.perfect,
      varianceLines: agg.variance,
    }
  })

  return NextResponse.json({ data: dto })
}
