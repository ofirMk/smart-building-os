/**
 * `/api/procurement/orders/[id]` — Phase 7.13.1.A
 *
 * GET — מחזיר PO מלא עם שורות + ספק + פרויקט. בסיס למסך פרט עם 6 טאבים.
 *
 * משתמש ב-RLS דרך `requireProcurementApiContext` (`x-active-company-id`).
 * מחזיר את כל שדות ה-Phase 7.4 enrichment + 7.5 governance + 7.6 body_html.
 * הקבצים/אישורים/revisions מוחזרים בנקודות-קצה אחיות (`/attachments`,
 * `/approvals`, `/revisions`) כדי לאפשר polling נפרד והקטנת payload ראשי.
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string }

function normalizeParams(
  params: Promise<RouteParams> | RouteParams
): Promise<RouteParams> {
  return Promise.resolve(params)
}

// ─────────────────────────────────────────────────────────────────────
// DTOs — כל מה שהלקוח צריך לטאב "כללי" + "שורות". טאבים נוספים יביאו
// נתונים בנקודות-קצה אחיות.
// ─────────────────────────────────────────────────────────────────────

export type ProcurementOrderDetailLineDto = {
  id: string
  // identity
  itemId: string | null
  itemSku: string | null
  itemNumber: string | null
  description: string
  // financials
  quantity: number
  unitPrice: number
  totalPrice: number
  discountPct: number
  lineCurrency: string | null
  exchangeRate: number | null
  // governance
  budgetSubChapter: string | null
  resourceId: string | null
  // Phase 7.4 enrichment
  supplyDate: string | null
  manufacturerName: string | null
  lineNotes: string | null
  priceSource: string | null
  // Phase 7.5 deviation
  priceDeviationPct: number | null
  requiresEscalation: boolean
  escalationCategory: string | null
  escalationJustification: string | null
  alternativeSupplierId: string | null
  alternativeUnitPrice: number | null
  alternativeLeadTimeDays: number | null
}

export type ProcurementOrderDetailDto = {
  // header
  id: string
  poNumber: string
  /** Phase 8.1.1 — מספר PO רשמי שמוקצה אוטומטית כשהסטטוס → APPROVED. */
  officialPoNumber: string | null
  title: string
  status: string
  notes: string | null
  createdAt: string
  issuedAt: string | null
  // financials
  currency: string
  totalAmount: number
  totalAmountNet: number
  vatAmount: number
  totalAmountGross: number
  // Phase 7.4 governance
  urgencyLevel: string
  urgencyJustification: string | null
  aiNegotiationStatus: string | null
  aiNegotiationLog: unknown
  poTotalDeviationPct: number | null
  requiresPoEscalation: boolean
  // Phase 7.6 rich body
  bodyHtml: string | null
  bodyHtmlEnglish: string | null
  // relations
  supplier: {
    id: string
    name: string
    supplierNum: string | null
    /** Phase 8.1.3 — מוצג במסמך ה-PDF וכ-default לכתובת השליחה. */
    email: string | null
    address: string | null
    phone: string | null
    taxVatId: string | null
    paymentTerms: string | null
  } | null
  project: {
    id: string
    projectNumber: string | null
    name: string | null
  } | null
  /** Phase 8.1.3 — ל-rendering של ה-PDF (שם החברה בלוגו + footer). */
  company: {
    id: string
    nameHe: string
    nameEn: string
  } | null
  lines: ProcurementOrderDetailLineDto[]
}

// ─────────────────────────────────────────────────────────────────────
// PostgREST row shapes
// ─────────────────────────────────────────────────────────────────────

type SupplierJoin = {
  id: string
  name: string
  supplier_number: string | null
  email: string | null
  address: string | null
  phone: string | null
  tax_vat_id: string | null
  payment_terms: string | null
} | null

type CompanyJoin = {
  id: string
  name_he: string
  name_en: string | null
} | null

type ProjectJoin = {
  id: string
  project_number: string | null
  name: string | null
} | null

type ItemJoin = {
  id: string
  item_number: string
  description: string | null
} | null

type HeaderRow = {
  id: string
  po_number: string
  official_po_number: string | null
  title: string
  status: string
  notes: string | null
  created_at: string
  issued_at: string | null
  currency: string | null
  total_amount: number | string | null
  total_amount_net: number | string | null
  vat_amount: number | string | null
  total_amount_gross: number | string | null
  urgency_level: string | null
  urgency_justification: string | null
  ai_negotiation_status: string | null
  ai_negotiation_log: unknown
  po_total_deviation_pct: number | string | null
  requires_po_escalation: boolean | null
  body_html: string | null
  body_html_english: string | null
  supplier: SupplierJoin | SupplierJoin[]
  project: ProjectJoin | ProjectJoin[]
  company: CompanyJoin | CompanyJoin[]
}

type LineRow = {
  id: string
  item_id: string | null
  item_sku: string | null
  description: string
  quantity: number | string
  unit_price: number | string
  total_price: number | string
  discount_pct: number | string | null
  line_currency: string | null
  exchange_rate: number | string | null
  budget_sub_chapter: string | null
  resource_id: string | null
  supply_date: string | null
  manufacturer_name: string | null
  line_notes: string | null
  price_source: string | null
  price_deviation_pct: number | string | null
  requires_escalation: boolean | null
  escalation_category: string | null
  escalation_justification: string | null
  alternative_supplier_id: string | null
  alternative_unit_price: number | string | null
  alternative_lead_time_days: number | null
  item: ItemJoin | ItemJoin[]
  created_at: string
}

function pickSingle<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (value == null) return fallback
  const n = typeof value === "string" ? Number(value) : value
  return Number.isFinite(n) ? n : fallback
}

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value == null) return null
  const n = typeof value === "string" ? Number(value) : value
  return Number.isFinite(n) ? n : null
}

// ─────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id } = await normalizeParams(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  // 1) Header + supplier + project (single round-trip via JOIN aliases)
  const headerQuery = await supabase
    .from("erp_purchase_orders")
    .select(
      [
        "id,po_number,official_po_number,title,status,notes,created_at,issued_at",
        "currency,total_amount,total_amount_net,vat_amount,total_amount_gross",
        "urgency_level,urgency_justification,ai_negotiation_status,ai_negotiation_log",
        "po_total_deviation_pct,requires_po_escalation",
        "body_html,body_html_english",
        "supplier:erp_md_suppliers!supplier_id(id,name,supplier_number,email,address,phone,tax_vat_id,payment_terms)",
        "project:erp_proj_projects!project_id(id,project_number,name)",
        "company:erp_companies!company_id(id,name_he,name_en)",
      ].join(",")
    )
    .eq("company_id", activeCompanyId)
    .eq("id", id)
    .maybeSingle()

  if (headerQuery.error) {
    return NextResponse.json({ error: headerQuery.error.message }, { status: 500 })
  }
  if (!headerQuery.data) {
    return NextResponse.json({ error: "הזמנת רכש לא נמצאה" }, { status: 404 })
  }
  const header = headerQuery.data as HeaderRow

  // 2) Lines + item join
  const linesQuery = await supabase
    .from("erp_purchase_order_lines")
    .select(
      [
        "id,item_id,item_sku,description,quantity,unit_price,total_price",
        "discount_pct,line_currency,exchange_rate",
        "budget_sub_chapter,resource_id",
        "supply_date,manufacturer_name,line_notes,price_source",
        "price_deviation_pct,requires_escalation,escalation_category,escalation_justification",
        "alternative_supplier_id,alternative_unit_price,alternative_lead_time_days",
        "created_at",
        "item:erp_md_items!item_id(id,item_number,description)",
      ].join(",")
    )
    .eq("company_id", activeCompanyId)
    .eq("purchase_order_id", id)
    .order("created_at", { ascending: true })

  if (linesQuery.error) {
    return NextResponse.json({ error: linesQuery.error.message }, { status: 500 })
  }

  const supplier = pickSingle(header.supplier)
  const project = pickSingle(header.project)
  const company = pickSingle(header.company)
  const lines = (linesQuery.data ?? []) as LineRow[]

  const dto: ProcurementOrderDetailDto = {
    id: header.id,
    poNumber: header.po_number,
    officialPoNumber: header.official_po_number,
    title: header.title,
    status: header.status,
    notes: header.notes,
    createdAt: header.created_at,
    issuedAt: header.issued_at,
    currency: header.currency ?? "ILS",
    totalAmount: toNumber(header.total_amount),
    totalAmountNet: toNumber(header.total_amount_net),
    vatAmount: toNumber(header.vat_amount),
    totalAmountGross: toNumber(header.total_amount_gross),
    urgencyLevel: header.urgency_level ?? "NORMAL",
    urgencyJustification: header.urgency_justification,
    aiNegotiationStatus: header.ai_negotiation_status,
    aiNegotiationLog: header.ai_negotiation_log ?? null,
    poTotalDeviationPct: toNumberOrNull(header.po_total_deviation_pct),
    requiresPoEscalation: Boolean(header.requires_po_escalation),
    bodyHtml: header.body_html,
    bodyHtmlEnglish: header.body_html_english,
    supplier: supplier
      ? {
          id: supplier.id,
          name: supplier.name,
          supplierNum: supplier.supplier_number,
          email: supplier.email,
          address: supplier.address,
          phone: supplier.phone,
          taxVatId: supplier.tax_vat_id,
          paymentTerms: supplier.payment_terms,
        }
      : null,
    project: project
      ? {
          id: project.id,
          projectNumber: project.project_number,
          name: project.name,
        }
      : null,
    company: company
      ? {
          id: company.id,
          nameHe: company.name_he,
          nameEn: company.name_en ?? "",
        }
      : null,
    lines: lines.map((line): ProcurementOrderDetailLineDto => {
      const item = pickSingle(line.item)
      return {
        id: line.id,
        itemId: line.item_id,
        itemSku: line.item_sku,
        itemNumber: item?.item_number ?? null,
        description: line.description,
        quantity: toNumber(line.quantity),
        unitPrice: toNumber(line.unit_price),
        totalPrice: toNumber(line.total_price),
        discountPct: toNumber(line.discount_pct),
        lineCurrency: line.line_currency,
        exchangeRate: toNumberOrNull(line.exchange_rate),
        budgetSubChapter: line.budget_sub_chapter,
        resourceId: line.resource_id,
        supplyDate: line.supply_date,
        manufacturerName: line.manufacturer_name,
        lineNotes: line.line_notes,
        priceSource: line.price_source,
        priceDeviationPct: toNumberOrNull(line.price_deviation_pct),
        requiresEscalation: Boolean(line.requires_escalation),
        escalationCategory: line.escalation_category,
        escalationJustification: line.escalation_justification,
        alternativeSupplierId: line.alternative_supplier_id,
        alternativeUnitPrice: toNumberOrNull(line.alternative_unit_price),
        alternativeLeadTimeDays: line.alternative_lead_time_days,
      }
    }),
  }

  return NextResponse.json({ data: dto })
}
