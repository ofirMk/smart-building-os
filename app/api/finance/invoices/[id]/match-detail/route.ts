/**
 * `/api/finance/invoices/[id]/match-detail` — Phase 8.3 Step 2
 *
 * GET — מחזיר את כל מה שצריך כדי לרנדר עמוד התאמה לחשבונית אחת:
 *   • header (חשבונית + ספק + PO + GR)
 *   • lines: כל שורת חשבונית, עם match-row המקושר אליה (אם קיים) ועם
 *     metadata של שורת ה-PO + שורת ה-GR לקריאה אנושית.
 *   • summary של variances (לפני ה-UI יחשב את זה שוב, אבל זה משמש להצגה
 *     מהירה וגם כ-source of truth לתצוגה).
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

export type MatchDetailLineDto = {
  invoiceLineId: string
  description: string
  invoiceQty: number
  invoiceUnitPrice: number
  invoiceLineTotal: number
  /** present iff the RPC ran and a po_line was resolved. */
  match: {
    matchId: string
    matchStatus: ErpInvoiceMatchLineStatus
    poLineId: string
    poDescription: string | null
    poOrderedQty: number
    poUnitPrice: number
    grLineId: string | null
    grReceivedQty: number
    qtyDiff: number
    priceDiff: number
    /** סך ההשפעה הכספית של ה-Δ מחיר על השורה הזאת. */
    priceImpactValue: number
    notes: string | null
  } | null
}

export type MatchDetailDto = {
  id: string
  invoiceNumber: string
  status: ErpVendorInvoiceStatus
  invoiceDate: string | null
  totalAmount: number
  priceVarianceAmount: number
  notes: string | null
  supplier: { id: string; name: string } | null
  purchaseOrder: {
    id: string
    poNumber: string
    officialPoNumber: string | null
    status: string
  } | null
  goodsReceipt: {
    id: string
    grNumber: string
    status: string
  } | null
  lines: MatchDetailLineDto[]
  summary: {
    totalLines: number
    matchedLines: number
    perfectLines: number
    qtyVarianceLines: number
    priceVarianceLines: number
    mixedVarianceLines: number
    unmatchedLines: number
    totalQtyDiff: number
    totalPriceImpactValue: number
  }
}

type HeaderRow = {
  id: string
  invoice_number: string
  status: ErpVendorInvoiceStatus
  invoice_date: string | null
  total_amount: number | string
  price_variance_amount: number | string | null
  notes: string | null
  supplier: { id: string; name: string } | { id: string; name: string }[] | null
  purchase_order:
    | {
        id: string
        po_number: string
        official_po_number: string | null
        status: string
      }
    | {
        id: string
        po_number: string
        official_po_number: string | null
        status: string
      }[]
    | null
  goods_receipt:
    | { id: string; gr_number: string; status: string }
    | { id: string; gr_number: string; status: string }[]
    | null
}

type InvoiceLineRow = {
  id: string
  description: string
  quantity: number | string
  unit_price: number | string
  total_price: number | string | null
  purchase_order_line_id: string | null
  goods_receipt_line_id: string | null
}

type MatchRow = {
  id: string
  invoice_line_id: string
  po_line_id: string
  gr_line_id: string | null
  invoice_qty: number | string
  invoice_unit_price: number | string
  po_unit_price: number | string
  po_ordered_qty: number | string
  gr_received_qty: number | string
  qty_diff: number | string
  price_diff: number | string
  match_status: ErpInvoiceMatchLineStatus
  notes: string | null
  po_line: { description: string } | { description: string }[] | null
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
  { params }: { params: Promise<RouteParams> | RouteParams },
) {
  const { id } = await Promise.resolve(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  // ── 1) Header ──────────────────────────────────────────────────────────
  const headerQ = await supabase
    .from("erp_vendor_invoices")
    .select(
      [
        "id,invoice_number,status,invoice_date,total_amount,price_variance_amount,notes",
        "supplier:erp_md_suppliers!supplier_id(id,name)",
        "purchase_order:erp_purchase_orders!purchase_order_id(id,po_number,official_po_number,status)",
        "goods_receipt:erp_goods_receipts!goods_receipt_id(id,gr_number,status)",
      ].join(","),
    )
    .eq("company_id", activeCompanyId)
    .eq("id", id)
    .maybeSingle()

  if (headerQ.error) {
    return NextResponse.json({ error: headerQ.error.message }, { status: 500 })
  }
  if (!headerQ.data) {
    return NextResponse.json({ error: "חשבונית לא נמצאה" }, { status: 404 })
  }
  const header = headerQ.data as HeaderRow

  // ── 2) Invoice lines ───────────────────────────────────────────────────
  const linesQ = await supabase
    .from("erp_vendor_invoice_lines")
    .select(
      "id,description,quantity,unit_price,total_price,purchase_order_line_id,goods_receipt_line_id",
    )
    .eq("company_id", activeCompanyId)
    .eq("vendor_invoice_id", id)
    .order("created_at", { ascending: true })

  if (linesQ.error) {
    return NextResponse.json({ error: linesQ.error.message }, { status: 500 })
  }
  const invoiceLines = (linesQ.data ?? []) as InvoiceLineRow[]

  // ── 3) Match rows + PO line description for nicer display ──────────────
  const matchesQ = await supabase
    .from("erp_invoice_po_line_matches")
    .select(
      [
        "id,invoice_line_id,po_line_id,gr_line_id",
        "invoice_qty,invoice_unit_price,po_unit_price,po_ordered_qty,gr_received_qty",
        "qty_diff,price_diff,match_status,notes",
        "po_line:erp_purchase_order_lines!po_line_id(description)",
      ].join(","),
    )
    .eq("company_id", activeCompanyId)
    .eq("invoice_id", id)

  if (matchesQ.error) {
    return NextResponse.json({ error: matchesQ.error.message }, { status: 500 })
  }
  const matchByInvoiceLine = new Map<string, MatchRow>()
  for (const row of (matchesQ.data ?? []) as MatchRow[]) {
    matchByInvoiceLine.set(row.invoice_line_id, row)
  }

  // ── 4) Build line DTOs ─────────────────────────────────────────────────
  const lineDtos: MatchDetailLineDto[] = invoiceLines.map((line) => {
    const m = matchByInvoiceLine.get(line.id) ?? null
    let match: MatchDetailLineDto["match"] = null
    if (m) {
      const po = pickOne(m.po_line)
      match = {
        matchId: m.id,
        matchStatus: m.match_status,
        poLineId: m.po_line_id,
        poDescription: po?.description ?? null,
        poOrderedQty: num(m.po_ordered_qty),
        poUnitPrice: num(m.po_unit_price),
        grLineId: m.gr_line_id,
        grReceivedQty: num(m.gr_received_qty),
        qtyDiff: num(m.qty_diff),
        priceDiff: num(m.price_diff),
        priceImpactValue:
          Math.round(num(m.price_diff) * num(m.invoice_qty) * 100) / 100,
        notes: m.notes,
      }
    }
    return {
      invoiceLineId: line.id,
      description: line.description,
      invoiceQty: num(line.quantity),
      invoiceUnitPrice: num(line.unit_price),
      invoiceLineTotal: num(line.total_price ?? null),
      match,
    }
  })

  // ── 5) Summary ────────────────────────────────────────────────────────
  let perfect = 0,
    qty = 0,
    price = 0,
    mixed = 0,
    matched = 0,
    totalQtyDiff = 0,
    totalPriceImpactValue = 0
  for (const l of lineDtos) {
    if (!l.match) continue
    matched += 1
    totalQtyDiff += l.match.qtyDiff
    totalPriceImpactValue += l.match.priceImpactValue
    if (l.match.matchStatus === "PERFECT") perfect += 1
    else if (l.match.matchStatus === "QTY_VARIANCE") qty += 1
    else if (l.match.matchStatus === "PRICE_VARIANCE") price += 1
    else mixed += 1
  }

  const supplier = pickOne(header.supplier)
  const po = pickOne(header.purchase_order)
  const gr = pickOne(header.goods_receipt)

  const dto: MatchDetailDto = {
    id: header.id,
    invoiceNumber: header.invoice_number,
    status: header.status,
    invoiceDate: header.invoice_date,
    totalAmount: num(header.total_amount),
    priceVarianceAmount: num(header.price_variance_amount),
    notes: header.notes,
    supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
    purchaseOrder: po
      ? {
          id: po.id,
          poNumber: po.po_number,
          officialPoNumber: po.official_po_number,
          status: po.status,
        }
      : null,
    goodsReceipt: gr
      ? { id: gr.id, grNumber: gr.gr_number, status: gr.status }
      : null,
    lines: lineDtos,
    summary: {
      totalLines: lineDtos.length,
      matchedLines: matched,
      perfectLines: perfect,
      qtyVarianceLines: qty,
      priceVarianceLines: price,
      mixedVarianceLines: mixed,
      unmatchedLines: lineDtos.length - matched,
      totalQtyDiff: Math.round(totalQtyDiff * 1000) / 1000,
      totalPriceImpactValue: Math.round(totalPriceImpactValue * 100) / 100,
    },
  }

  return NextResponse.json({ data: dto })
}
