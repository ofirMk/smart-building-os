/**
 * GET /api/finance/invoices
 *
 * חשבוניות ספק — כל הסטטוסים, עם join לספק + PO ועם aggregations של
 * 3-Way Match. משמש את מסך "היסטוריית חשבוניות" בפרוקיורמנט.
 *
 * ## הבדל מ-/api/finance/invoices/pending-match
 *   pending-match מסנן לסטטוסי DRAFT/NEW/MATCHED/HAS_VARIANCES/FINAL בלבד
 *   (עבור ה-AP workbench). נתיב זה מחזיר את **כל** החשבוניות כולל
 *   APPROVED/READY_FOR_PAYMENT/CANCELLED — כדי לאפשר מסך היסטוריה מלא.
 *
 * ## Query params
 *   ?status=    — סנן לסטטוס בודד
 *   ?q=         — חיפוש חופשי על invoice_number / supplier_name / po_number
 *   ?page=1     — עמוד (1-indexed, ברירת מחדל 1)
 *   ?limit=50   — גודל עמוד (ברירת מחדל 50, מקסימום 200)
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"
import type {
  ErpInvoiceMatchLineStatus,
  ErpVendorInvoiceStatus,
} from "@/types/erp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ─────────────────────────────────────────────
// DTO
// ─────────────────────────────────────────────

export type InvoiceListDto = {
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
  totalInvoiceLines: number
  matchedLines: number
  perfectLines: number
  varianceLines: number
  unmatchedLines: number
  varianceImpactValue: number
  /** true = חשבונית שמעולם לא הורצה דרך ה-RPC (אין match ב-bridge). */
  needsFirstMatch: boolean
}

// ─────────────────────────────────────────────
// Internal row types
// ─────────────────────────────────────────────

type HeaderRow = {
  id: string
  invoice_number: string
  status: ErpVendorInvoiceStatus
  invoice_date: string | null
  total_amount: number | string
  price_variance_amount: number | string | null
  purchase_order_id: string | null
  supplier: { name: string } | { name: string }[] | null
  purchase_order:
    | { po_number: string; official_po_number: string | null }
    | { po_number: string; official_po_number: string | null }[]
    | null
}

type LineCountRow = { vendor_invoice_id: string }

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

// ─────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const statusParam = req.nextUrl.searchParams.get("status")?.trim() || null
  const q = req.nextUrl.searchParams.get("q")?.trim() || null
  const pageParam = parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10)
  const limitParam = Math.min(
    200,
    Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10)),
  )
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1
  const limit = Number.isFinite(limitParam) ? limitParam : 50
  const from = (page - 1) * limit
  const to = from + limit - 1

  // ── 1) Invoices header + supplier + PO ──────────────────────────────────
  let headersQ = supabase
    .from("erp_vendor_invoices")
    .select(
      [
        "id,invoice_number,status,invoice_date,total_amount,price_variance_amount,purchase_order_id",
        "supplier:erp_md_suppliers!supplier_id(name)",
        "purchase_order:erp_purchase_orders!purchase_order_id(po_number,official_po_number)",
      ].join(","),
      { count: "exact" },
    )
    .eq("company_id", activeCompanyId)
    .order("invoice_date", { ascending: false, nullsFirst: false })
    .range(from, to)

  if (statusParam) headersQ = headersQ.eq("status", statusParam)
  // Free-text search — delegated to client when result set is small;
  // for full-text we filter on invoice_number only (index-friendly).
  if (q) headersQ = headersQ.ilike("invoice_number", `%${q}%`)

  const { data: headersData, error: headersErr, count } = await headersQ
  if (headersErr) {
    return NextResponse.json({ error: headersErr.message }, { status: 500 })
  }
  const headers = (headersData ?? []) as HeaderRow[]

  if (headers.length === 0) {
    return NextResponse.json({
      data: [] satisfies InvoiceListDto[],
      total: count ?? 0,
      page,
      limit,
    })
  }

  const invoiceIds = headers.map((h) => h.id)

  // ── 2) Line counts ───────────────────────────────────────────────────────
  const { data: linesData, error: linesErr } = await supabase
    .from("erp_vendor_invoice_lines")
    .select("vendor_invoice_id")
    .eq("company_id", activeCompanyId)
    .in("vendor_invoice_id", invoiceIds)

  if (linesErr) {
    return NextResponse.json({ error: linesErr.message }, { status: 500 })
  }
  const linesByInvoice = new Map<string, number>()
  for (const row of (linesData ?? []) as LineCountRow[]) {
    linesByInvoice.set(
      row.vendor_invoice_id,
      (linesByInvoice.get(row.vendor_invoice_id) ?? 0) + 1,
    )
  }

  // ── 3) 3-Way Match aggregations ──────────────────────────────────────────
  const { data: matchesData, error: matchesErr } = await supabase
    .from("erp_invoice_po_line_matches")
    .select("invoice_id,match_status,invoice_qty,price_diff")
    .eq("company_id", activeCompanyId)
    .in("invoice_id", invoiceIds)

  if (matchesErr) {
    return NextResponse.json({ error: matchesErr.message }, { status: 500 })
  }

  type Agg = {
    matched: number
    perfect: number
    variance: number
    impactValue: number
  }
  const aggByInvoice = new Map<string, Agg>()
  for (const row of (matchesData ?? []) as MatchAggRow[]) {
    const a = aggByInvoice.get(row.invoice_id) ?? {
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

  // ── 4) Build DTOs ────────────────────────────────────────────────────────
  const dto: InvoiceListDto[] = headers.map((h) => {
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

  return NextResponse.json({ data: dto, total: count ?? 0, page, limit })
}
