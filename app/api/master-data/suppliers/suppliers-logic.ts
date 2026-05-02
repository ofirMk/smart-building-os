import { type NextRequest, NextResponse } from "next/server"

import {
  requireMasterDataApiContext,
  sanitizeOptionalString,
} from "@/lib/erp/master-data-api"
import type { CreateSupplierInput, ErpSupplier, ErpSupplierType } from "@/types/erp"

// סטים לקטלוג סטטוסי PO — חייב להיות בסינכרון עם orders-list-scaffold
// ואיתם /api/master-data/suppliers/[id]/purchase-orders. שינוי כאן ←
// שינוי שם.
const OPEN_PO_STATUSES = [
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

const PAID_INVOICE_STATUSES = ["APPROVED", "READY_FOR_PAYMENT"] as const

type SupplierCreateBody = Partial<CreateSupplierInput> & {
  supplierNumber?: unknown
  supplierNum?: unknown
  supplierKind?: unknown
  foreignName?: unknown
  address?: unknown
  phone?: unknown
  email?: unknown
  taxVatId?: unknown
  paymentTerms?: unknown
}

function normalizeSupplierKind(value: unknown): "supplier" | "subcontractor" {
  return sanitizeOptionalString(value) === "subcontractor"
    ? "subcontractor"
    : "supplier"
}

function toErpSupplierType(kind: "supplier" | "subcontractor"): ErpSupplierType {
  return kind === "subcontractor" ? "SUBCONTRACTOR" : "STANDARD"
}

function mapSupplierRow(row: {
  id: string
  company_id: string
  supplier_number: string
  name: string
  supplier_kind: "supplier" | "subcontractor"
  tax_vat_id: string | null
  payment_terms: string | null
}): ErpSupplier {
  return {
    id: row.id,
    companyId: row.company_id,
    supplierNum: row.supplier_number,
    name: row.name,
    taxId: row.tax_vat_id,
    type: toErpSupplierType(row.supplier_kind),
    paymentTerms: row.payment_terms,
  }
}

/** Aggregates ל-master grid של מסך הספקים (Phase 9.1). */
export type SupplierAggregateDto = {
  /** סך POs פתוחים (סטטוסים שלא סגורים/בוטלים). */
  openPoCount: number
  /** סכום ברוטו של POs פתוחים במטבע הדומיננטי. ריק אם אין. */
  openPoValue: number | null
  /** מטבע דומיננטי של POs פתוחים — null אם אין POs בכלל. */
  openPoCurrency: string | null
  /** סך חשבוניות שעוד לא שולמו (לא APPROVED/READY_FOR_PAYMENT/CANCELLED). */
  unpaidInvoiceCount: number
  /** חוב נוכחי לספק לפי חשבוניות לא-משולמות (ILS, סכום total_amount). */
  unpaidInvoiceValue: number
  /** תאריך הפעולה האחרונה — max מ-issued_at של POs ו-invoice_date של חשבוניות. */
  lastActivityAt: string | null
}

export type ErpSupplierWithAggregates = ErpSupplier & {
  aggregates?: SupplierAggregateDto
}

type PoRow = {
  supplier_id: string
  status: string
  total_amount_gross: number | string | null
  total_amount: number | string
  currency: string | null
  issued_at: string | null
}

type InvoiceRow = {
  supplier_id: string
  status: string
  total_amount: number | string
  invoice_date: string | null
}

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === "string" ? Number(v) : v
  return Number.isFinite(n) ? n : 0
}

// supabase מועבר כ-unknown כדי לעקוף type-instantiation עמוק; שימוש פנימי בלבד.
async function loadAggregates(
  supabaseUnknown: unknown,
  activeCompanyId: string,
  supplierIds: string[],
): Promise<Map<string, SupplierAggregateDto>> {
  const supabase = supabaseUnknown as {
    from: (tbl: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          in: (
            col: string,
            vals: readonly string[],
          ) => Promise<{
            data: unknown
            error: { message: string } | null
          }> & {
            in: (
              col: string,
              vals: readonly string[],
            ) => Promise<{
              data: unknown
              error: { message: string } | null
            }>
          }
        }
      }
    }
  }
  const out = new Map<string, SupplierAggregateDto>()
  if (supplierIds.length === 0) return out

  // ── POs פתוחים בלבד — לחישוב open value & dominant currency. ──────────
  const posQ = await supabase
    .from("erp_purchase_orders")
    .select(
      "supplier_id,status,total_amount_gross,total_amount,currency,issued_at",
    )
    .eq("company_id", activeCompanyId)
    .in("supplier_id", supplierIds)
    .in("status", OPEN_PO_STATUSES as unknown as string[])

  // ── Invoices לא-משולמות (לא APPROVED/READY/CANCELLED). ────────────────
  // מסננים בקוד לאחר השליפה — Postgres-supabase לא תומך טוב ב-NOT IN ארוך.
  const invQ = await supabase
    .from("erp_vendor_invoices")
    .select("supplier_id,status,total_amount,invoice_date")
    .eq("company_id", activeCompanyId)
    .in("supplier_id", supplierIds)

  const pos = (posQ.data ?? []) as PoRow[]
  const invs = (invQ.data ?? []) as InvoiceRow[]

  type Bucket = {
    openPoCount: number
    poValueByCcy: Map<string, number>
    unpaidInvoiceCount: number
    unpaidInvoiceValue: number
    lastActivityAt: string | null
  }
  const bySup = new Map<string, Bucket>()
  function get(sid: string): Bucket {
    let b = bySup.get(sid)
    if (!b) {
      b = {
        openPoCount: 0,
        poValueByCcy: new Map(),
        unpaidInvoiceCount: 0,
        unpaidInvoiceValue: 0,
        lastActivityAt: null,
      }
      bySup.set(sid, b)
    }
    return b
  }
  function bumpDate(b: Bucket, d: string | null) {
    if (!d) return
    if (!b.lastActivityAt || d > b.lastActivityAt) b.lastActivityAt = d
  }

  for (const p of pos) {
    const b = get(p.supplier_id)
    b.openPoCount += 1
    const ccy = p.currency ?? "ILS"
    const val = toNum(p.total_amount_gross ?? p.total_amount)
    b.poValueByCcy.set(ccy, (b.poValueByCcy.get(ccy) ?? 0) + val)
    bumpDate(b, p.issued_at)
  }

  for (const inv of invs) {
    const b = get(inv.supplier_id)
    bumpDate(b, inv.invoice_date)
    if (
      (PAID_INVOICE_STATUSES as readonly string[]).includes(inv.status) ||
      inv.status === "CANCELLED"
    ) {
      continue
    }
    b.unpaidInvoiceCount += 1
    b.unpaidInvoiceValue += toNum(inv.total_amount)
  }

  for (const [sid, b] of bySup) {
    let dominantCcy: string | null = null
    let dominantValue = 0
    for (const [ccy, v] of b.poValueByCcy) {
      if (v > dominantValue) {
        dominantCcy = ccy
        dominantValue = v
      }
    }
    out.set(sid, {
      openPoCount: b.openPoCount,
      openPoValue: dominantCcy ? Math.round(dominantValue * 100) / 100 : null,
      openPoCurrency: dominantCcy,
      unpaidInvoiceCount: b.unpaidInvoiceCount,
      unpaidInvoiceValue: Math.round(b.unpaidInvoiceValue * 100) / 100,
      lastActivityAt: b.lastActivityAt,
    })
  }

  return out
}

export async function GET(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response

  const { supabase, activeCompanyId } = gate.ctx
  const q = sanitizeOptionalString(req.nextUrl.searchParams.get("q"))
  const kind = sanitizeOptionalString(req.nextUrl.searchParams.get("supplierKind"))
  const include = req.nextUrl.searchParams.get("include") ?? ""
  const includeAggregates = include.includes("aggregates")

  let query = supabase
    .from("erp_md_suppliers")
    .select("id,company_id,supplier_number,name,supplier_kind,tax_vat_id,payment_terms")
    .eq("company_id", activeCompanyId)
    .order("name", { ascending: true })

  if (kind === "supplier" || kind === "subcontractor") {
    query = query.eq("supplier_kind", kind)
  }
  if (q) {
    query = query.or(
      `name.ilike.%${q}%,supplier_number.ilike.%${q}%,tax_vat_id.ilike.%${q}%`
    )
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const suppliers = (data ?? []).map(mapSupplierRow)

  if (!includeAggregates) {
    return NextResponse.json({ data: suppliers })
  }

  const aggMap = await loadAggregates(
    supabase,
    activeCompanyId,
    suppliers.map((s) => s.id),
  )

  const enriched: ErpSupplierWithAggregates[] = suppliers.map((s) => ({
    ...s,
    aggregates: aggMap.get(s.id) ?? {
      openPoCount: 0,
      openPoValue: null,
      openPoCurrency: null,
      unpaidInvoiceCount: 0,
      unpaidInvoiceValue: 0,
      lastActivityAt: null,
    },
  }))

  return NextResponse.json({ data: enriched })
}

export async function POST(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response

  const { supabase, activeCompanyId } = gate.ctx
  const body = (await req.json().catch(() => null)) as SupplierCreateBody | null

  const supplierNum =
    sanitizeOptionalString(body?.supplierNum) ??
    sanitizeOptionalString(body?.supplierNumber)
  const name = sanitizeOptionalString(body?.name)
  const supplierKind = normalizeSupplierKind(body?.supplierKind)
  const taxVatId = sanitizeOptionalString(body?.taxVatId) ?? sanitizeOptionalString(body?.taxId)
  const paymentTerms = sanitizeOptionalString(body?.paymentTerms)

  if (!supplierNum || !name) {
    return NextResponse.json(
      { error: "supplierNum and name are required" },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("erp_md_suppliers")
    .insert({
      company_id: activeCompanyId,
      supplier_number: supplierNum,
      supplier_kind: supplierKind,
      name,
      foreign_name: sanitizeOptionalString(body?.foreignName),
      address: sanitizeOptionalString(body?.address),
      phone: sanitizeOptionalString(body?.phone),
      email: sanitizeOptionalString(body?.email),
      tax_vat_id: taxVatId,
      payment_terms: paymentTerms,
    })
    .select("id,company_id,supplier_number,name,supplier_kind,tax_vat_id,payment_terms")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: mapSupplierRow(data) }, { status: 201 })
}
