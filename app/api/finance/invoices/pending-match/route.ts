/**
 * `/api/finance/invoices/pending-match` — Phase 8.3 Step 2
 *
 * GET — רשימת חשבוניות ספק שמועמדות ל-3-Way Match.
 *
 * ## Filter policy
 *   • סטטוס שלא ב-{`APPROVED`, `READY_FOR_PAYMENT`, `CANCELLED`}.
 *     APPROVED/READY_FOR_PAYMENT = SOX-locked (סגור פיננסית); CANCELLED = בוטל.
 *   • כולל DRAFT/FINAL/NEW/MATCHED/HAS_VARIANCES — כל מה שעוד נדרש בו אישור.
 *
 * ## Aggregations
 *   לכל חשבונית: סופר את שורות ה-match לפי קטגוריה (PERFECT / variance / unmatched).
 *   זה הופך את הליסט לשימושי מבלי שהמשתמש יצטרך לפתוח כל אחד.
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"
import type {
  ErpInvoiceMatchLineStatus,
  ErpVendorInvoiceStatus,
} from "@/types/erp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PENDING_STATUSES: ErpVendorInvoiceStatus[] = [
  "DRAFT",
  "NEW",
  "MATCHED",
  "HAS_VARIANCES",
  "FINAL",
]

export type PendingMatchInvoiceDto = {
  id: string
  invoiceNumber: string
  status: ErpVendorInvoiceStatus
  invoiceDate: string | null
  totalAmount: number
  priceVarianceAmount: number
  supplierName: string | null
  purchaseOrderId: string | null
  poNumber: string | null
  officialPoNumber: string | null
  /** סך שורות בחשבונית. */
  totalInvoiceLines: number
  /** מתוכן: כמה שורות יש להן match בכלל ב-bridge. */
  matchedLines: number
  /** מתוכן ב-bridge: כמה ב-PERFECT. */
  perfectLines: number
  /** מתוכן ב-bridge: כמה עם variance כלשהי. */
  varianceLines: number
  /** שורות חשבונית בלי match בכלל (totalInvoiceLines - matchedLines). */
  unmatchedLines: number
  /** סך השפעה כספית של variances (qty * price_diff על שורות variance). */
  varianceImpactValue: number
  /** האם החשבונית מעולם לא הורצה דרך ה-RPC (אין שום match ב-bridge). */
  needsFirstMatch: boolean
}

type HeaderRow = {
  id: string
  invoice_number: string
  status: ErpVendorInvoiceStatus
  invoice_date: string | null
  total_amount: number | string
  price_variance_amount: number | string | null
  purchase_order_id: string | null
  supplier: { name: string } | { name: string }[] | null
  purchase_order: { po_number: string; official_po_number: string | null }
    | { po_number: string; official_po_number: string | null }[]
    | null
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

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function num(v: number | string | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === "string" ? Number(v) : v
  return Number.isFinite(n) ? n : 0
}

export async function GET(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  // ── 1) Headers + supplier + PO summary ────────────────────────────────
  const headersQ = await supabase
    .from("erp_vendor_invoices")
    .select(
      [
        "id,invoice_number,status,invoice_date,total_amount,price_variance_amount,purchase_order_id",
        "supplier:erp_md_suppliers!supplier_id(name)",
        "purchase_order:erp_purchase_orders!purchase_order_id(po_number,official_po_number)",
      ].join(","),
    )
    .eq("company_id", activeCompanyId)
    .in("status", PENDING_STATUSES)
    .order("invoice_date", { ascending: false, nullsFirst: false })
    .limit(500)

  if (headersQ.error) {
    return NextResponse.json({ error: headersQ.error.message }, { status: 500 })
  }
  const headers = (headersQ.data ?? []) as HeaderRow[]
  if (headers.length === 0) {
    return NextResponse.json({ data: [] satisfies PendingMatchInvoiceDto[] })
  }

  const invoiceIds = headers.map((h) => h.id)

  // ── 2) Total invoice lines per invoice (count) ─────────────────────────
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

  // ── 3) Match aggregations per invoice ──────────────────────────────────
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
      // השפעה כספית: price_diff * invoice_qty (יחידות שחויבו עליהן ב-Δ מחיר).
      a.impactValue += num(row.price_diff) * num(row.invoice_qty)
    }
    aggByInvoice.set(row.invoice_id, a)
  }

  // ── 4) Build DTOs ──────────────────────────────────────────────────────
  const dto: PendingMatchInvoiceDto[] = headers.map((h) => {
    const supplier = pickOne(h.supplier)
    const po = pickOne(h.purchase_order)
    const totalLines = linesByInvoice.get(h.id) ?? 0
    const agg = aggByInvoice.get(h.id) ?? {
      matched: 0,
      perfect: 0,
      variance: 0,
      impactValue: 0,
    }
    const unmatched = Math.max(0, totalLines - agg.matched)
    return {
      id: h.id,
      invoiceNumber: h.invoice_number,
      status: h.status,
      invoiceDate: h.invoice_date,
      totalAmount: num(h.total_amount),
      priceVarianceAmount: num(h.price_variance_amount),
      supplierName: supplier?.name ?? null,
      purchaseOrderId: h.purchase_order_id,
      poNumber: po?.po_number ?? null,
      officialPoNumber: po?.official_po_number ?? null,
      totalInvoiceLines: totalLines,
      matchedLines: agg.matched,
      perfectLines: agg.perfect,
      varianceLines: agg.variance,
      unmatchedLines: unmatched,
      varianceImpactValue: Math.round(agg.impactValue * 100) / 100,
      needsFirstMatch: agg.matched === 0,
    }
  })

  return NextResponse.json({ data: dto })
}
