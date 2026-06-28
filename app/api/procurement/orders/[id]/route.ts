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
import { z } from "zod"

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
  // Phase 8.2 — Goods Receipt rollup
  receivedQty: number
  // Phase A — Priority parity
  lineNumber: number | null
  uom: string | null
  supplierSku: string | null
  supplierSkuDescription: string | null
  budgetItemCode: string | null
  budgetUtilizationDate: string | null
  importCostType: string | null
  demandNumber: string | null
  salesOrderId: string | null
  salesOrderLineId: string | null
  lineStatus: string
  isClosedLine: boolean
  splitParentLineId: string | null
  // מחר"ל — Priority parity
  listPrice: number | null
}

export type ProcurementShippingAddress = {
  name?: string
  contact?: string
  phone?: string
  fax?: string
  line1?: string
  line2?: string
  line3?: string
  city?: string
  state?: string
  zip?: string
  country?: string
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
  // Phase A — Priority parity header fields
  contactId: string | null
  receivingWarehouseCode: string | null
  orderDate: string | null
  paymentTermsCode: string | null
  vatCode: string | null
  withholdingPct: number | null
  shippingAddrHe: ProcurementShippingAddress | null
  shippingAddrEn: ProcurementShippingAddress | null
  isConfidential: boolean
  affectsPlanning: boolean
  closedAt: string | null
  closedBy: string | null
  // "אישורים ומעקב ביצוע" tab — Priority parity
  isPrinted: boolean
  isUnlockedForChanges: boolean
  isPartiallyClosed: boolean
  isPurchasingOnly: boolean
  supplierAuthLevelOverride: number | null
  approversListCode: string | null
  /** החותם הבא — שם המאשר הבא בתור (Priority: NEXTSIGNER) */
  nextSignerName: string | null
  // extended header fields — Priority parity
  poTypeCode: string | null
  deliveryMethodCode: string | null
  branchCode: string | null
  forUserName: string | null
  centralizedDemandRef: string | null
  quoteRef: string | null
  blanketOrderRef: string | null
  customerOrderRef: string | null
  serviceCallRef: string | null
  importExportFileType: string | null
  importExportFileRef: string | null
  locationTracking: string | null
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
  // Phase A — Priority parity
  contact_id: string | null
  receiving_warehouse_code: string | null
  order_date: string | null
  payment_terms_code: string | null
  vat_code: string | null
  withholding_pct: number | string | null
  shipping_addr_he: ProcurementShippingAddress | null
  shipping_addr_en: ProcurementShippingAddress | null
  is_confidential: boolean | null
  affects_planning: boolean | null
  closed_at: string | null
  closed_by: string | null
  // "אישורים ומעקב ביצוע"
  is_printed: boolean | null
  is_unlocked_for_changes: boolean | null
  is_partially_closed: boolean | null
  is_purchasing_only: boolean | null
  supplier_auth_level_override: number | null
  approvers_list_code: string | null
  next_signer_name: string | null
  // extended header fields
  po_type_code: string | null
  delivery_method_code: string | null
  branch_code: string | null
  for_user_name: string | null
  centralized_demand_ref: string | null
  quote_ref: string | null
  blanket_order_ref: string | null
  customer_order_ref: string | null
  service_call_ref: string | null
  import_export_file_type: string | null
  import_export_file_ref: string | null
  location_tracking: string | null
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
  received_qty: number | string | null
  // Phase A — Priority parity
  line_number: number | null
  uom: string | null
  supplier_sku: string | null
  supplier_sku_description: string | null
  budget_item_code: string | null
  budget_utilization_date: string | null
  import_cost_type: string | null
  demand_number: string | null
  sales_order_id: string | null
  sales_order_line_id: string | null
  line_status: string | null
  is_closed_line: boolean | null
  split_parent_line_id: string | null
  list_price: number | string | null
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
        // Phase A — Priority parity header fields
        "contact_id,receiving_warehouse_code,order_date,payment_terms_code",
        "vat_code,withholding_pct,shipping_addr_he,shipping_addr_en",
        "is_confidential,affects_planning,closed_at,closed_by",
        // "אישורים ומעקב ביצוע"
        "is_printed,is_unlocked_for_changes,is_partially_closed,is_purchasing_only",
        "supplier_auth_level_override,approvers_list_code,next_signer_name",
        // extended header fields
        "po_type_code,delivery_method_code,branch_code,for_user_name",
        "centralized_demand_ref,quote_ref,blanket_order_ref,customer_order_ref",
        "service_call_ref,import_export_file_type,import_export_file_ref,location_tracking",
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
  //    Phase A — מיון ע"פ line_number (Tesla auto-filled ב-POST); fallback
  //    ל-created_at אם line_number null לשמירת תאימות עם שורות ישנות.
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
        "received_qty",
        // Phase A — Priority parity line fields
        "line_number,uom,supplier_sku,supplier_sku_description",
        "budget_item_code,budget_utilization_date,import_cost_type",
        "demand_number,sales_order_id,sales_order_line_id",
        "line_status,is_closed_line,split_parent_line_id,list_price",
        "created_at",
        "item:erp_md_items!item_id(id,item_number,description)",
      ].join(",")
    )
    .eq("company_id", activeCompanyId)
    .eq("purchase_order_id", id)
    .order("line_number", { ascending: true, nullsFirst: false })
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
    // Phase A — Priority parity header fields
    contactId: header.contact_id,
    receivingWarehouseCode: header.receiving_warehouse_code,
    orderDate: header.order_date,
    paymentTermsCode: header.payment_terms_code,
    vatCode: header.vat_code,
    withholdingPct: toNumberOrNull(header.withholding_pct),
    shippingAddrHe: header.shipping_addr_he,
    shippingAddrEn: header.shipping_addr_en,
    isConfidential: Boolean(header.is_confidential),
    affectsPlanning: header.affects_planning ?? true,
    closedAt: header.closed_at,
    closedBy: header.closed_by,
    // "אישורים ומעקב ביצוע"
    isPrinted: Boolean(header.is_printed),
    isUnlockedForChanges: Boolean(header.is_unlocked_for_changes),
    isPartiallyClosed: Boolean(header.is_partially_closed),
    isPurchasingOnly: Boolean(header.is_purchasing_only),
    supplierAuthLevelOverride: header.supplier_auth_level_override ?? null,
    approversListCode: header.approvers_list_code ?? null,
    nextSignerName: header.next_signer_name ?? null,
    // extended header fields
    poTypeCode: header.po_type_code ?? null,
    deliveryMethodCode: header.delivery_method_code ?? null,
    branchCode: header.branch_code ?? null,
    forUserName: header.for_user_name ?? null,
    centralizedDemandRef: header.centralized_demand_ref ?? null,
    quoteRef: header.quote_ref ?? null,
    blanketOrderRef: header.blanket_order_ref ?? null,
    customerOrderRef: header.customer_order_ref ?? null,
    serviceCallRef: header.service_call_ref ?? null,
    importExportFileType: header.import_export_file_type ?? null,
    importExportFileRef: header.import_export_file_ref ?? null,
    locationTracking: header.location_tracking ?? null,
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
        // Phase 8.2 — Goods Receipt rollup
        receivedQty: toNumber(line.received_qty),
        // Phase A — Priority parity
        lineNumber: line.line_number,
        uom: line.uom,
        supplierSku: line.supplier_sku,
        supplierSkuDescription: line.supplier_sku_description,
        budgetItemCode: line.budget_item_code,
        budgetUtilizationDate: line.budget_utilization_date,
        importCostType: line.import_cost_type,
        demandNumber: line.demand_number,
        salesOrderId: line.sales_order_id,
        salesOrderLineId: line.sales_order_line_id,
        lineStatus: line.line_status ?? "OPEN",
        isClosedLine: Boolean(line.is_closed_line),
        splitParentLineId: line.split_parent_line_id,
        // מחר"ל — Priority parity
        listPrice: toNumberOrNull(line.list_price),
      }
    }),
  }

  return NextResponse.json({ data: dto })
}

// ─────────────────────────────────────────────────────────────────────
// PUT — Phase A (Priority parity)
// ─────────────────────────────────────────────────────────────────────
// עדכון header של PO קיים. שדות המותרים לעדכון:
//   * Basic      : title, notes
//   * Priority A : contactId, receivingWarehouseCode, orderDate,
//                  paymentTermsCode, vatCode, withholdingPct,
//                  shippingAddrHe, shippingAddrEn, isConfidential,
//                  affectsPlanning
//   * Body rich  : bodyHtml, bodyHtmlEnglish (Phase 7.6)
//
// שדות שה-PUT *לא* מטפל בהם (מופנים ל-endpoints נפרדים):
//   * status           → /submit, /approvals/[id]/decide, /close, ...
//   * total_amount_*   → מחושב אוטומטית דרך triggers
//   * lines            → Phase B' (POST /lines, PATCH /lines/[id], DELETE /lines/[id])
//   * supplier_id, project_id → אי-ניתן לשנות; צור PO חדש במקום
//
// Gate: ה-status חייב להיות באחד מ-`erp_po_status_types.allow_changes=true`.
// דוגמאות לערכים שמאפשרים שינוי: DRAFT, PROFORMA, APPROVED, SENT_TO_SUPPLIER,
// PARTIALLY_RECEIVED, ON_SHIP, SHIPMENT_CONFIRMED, SENT (legacy).
// דוגמאות שחוסמים: PENDING_APPROVAL, FULLY_RECEIVED, CLOSED, CANCELLED.
// ─────────────────────────────────────────────────────────────────────

const shippingAddrPatchSchema = z
  .object({
    name: z.string().trim().optional(),
    contact: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    fax: z.string().trim().optional(),
    line1: z.string().trim().optional(),
    line2: z.string().trim().optional(),
    line3: z.string().trim().optional(),
    city: z.string().trim().optional(),
    state: z.string().trim().optional(),
    zip: z.string().trim().optional(),
    country: z.string().trim().optional(),
  })
  .partial()

const updateOrderSchema = z
  .object({
    // Basic
    title: z.string().trim().min(1).optional(),
    notes: z.string().trim().nullable().optional(),
    // Phase 7.6 — rich body (dual-language)
    bodyHtml: z.string().nullable().optional(),
    bodyHtmlEnglish: z.string().nullable().optional(),
    // Phase A — Priority parity
    contactId: z.string().uuid().nullable().optional(),
    receivingWarehouseCode: z.string().trim().min(1).max(32).nullable().optional(),
    orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    paymentTermsCode: z.string().trim().min(1).max(16).nullable().optional(),
    vatCode: z.string().trim().min(1).max(32).nullable().optional(),
    withholdingPct: z.number().min(0).max(100).nullable().optional(),
    shippingAddrHe: shippingAddrPatchSchema.nullable().optional(),
    shippingAddrEn: shippingAddrPatchSchema.nullable().optional(),
    isConfidential: z.boolean().optional(),
    affectsPlanning: z.boolean().optional(),
    // "אישורים ומעקב ביצוע" — Priority parity
    isPrinted: z.boolean().optional(),
    isUnlockedForChanges: z.boolean().optional(),
    isPartiallyClosed: z.boolean().optional(),
    isPurchasingOnly: z.boolean().optional(),
    supplierAuthLevelOverride: z.number().int().min(0).max(9999).nullable().optional(),
    approversListCode: z.string().trim().min(1).max(30).nullable().optional(),
    // extended header fields
    poTypeCode: z.string().trim().min(1).max(20).nullable().optional(),
    deliveryMethodCode: z.string().trim().min(1).max(30).nullable().optional(),
    branchCode: z.string().trim().min(1).max(20).nullable().optional(),
    forUserName: z.string().trim().min(1).max(100).nullable().optional(),
    centralizedDemandRef: z.string().trim().min(1).max(50).nullable().optional(),
    quoteRef: z.string().trim().min(1).max(50).nullable().optional(),
    blanketOrderRef: z.string().trim().min(1).max(50).nullable().optional(),
    customerOrderRef: z.string().trim().min(1).max(50).nullable().optional(),
    serviceCallRef: z.string().trim().min(1).max(50).nullable().optional(),
    importExportFileType: z.string().trim().min(1).max(20).nullable().optional(),
    importExportFileRef: z.string().trim().min(1).max(50).nullable().optional(),
    locationTracking: z.string().trim().min(1).max(100).nullable().optional(),
  })
  .strict()

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id } = await normalizeParams(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  // 1) Parse + validate
  const body = await req.json().catch(() => null)
  const parsed = updateOrderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }
  const input = parsed.data

  // 2) שליפת ה-PO הנוכחי. אין FK מפורש בין status ל-erp_po_status_types,
  //    לכן עושים 2 קריאות קצרות במקום JOIN (PostgREST לא יתן לנו להצטרף ללא FK).
  const currentQuery = await supabase
    .from("erp_purchase_orders")
    .select("id,supplier_id,status")
    .eq("company_id", activeCompanyId)
    .eq("id", id)
    .maybeSingle()

  if (currentQuery.error) {
    return NextResponse.json({ error: currentQuery.error.message }, { status: 500 })
  }
  if (!currentQuery.data) {
    return NextResponse.json({ error: "הזמנת רכש לא נמצאה" }, { status: 404 })
  }

  const currentStatus = (currentQuery.data as { status: string }).status
  const currentSupplierId = (currentQuery.data as { supplier_id: string }).supplier_id

  // 2.1) Status metadata lookup — Phase A governance gate.
  const statusMetaQuery = await supabase
    .from("erp_po_status_types")
    .select("allow_changes")
    .eq("status", currentStatus)
    .maybeSingle()

  // Gate: הסטטוס חייב להתיר שינויים. אם אין metadata (סטטוס legacy לא-seeded) —
  //       fallback שמרני: מרשה DRAFT בלבד, חוסם אחרת.
  const allowChanges = statusMetaQuery.data
    ? Boolean((statusMetaQuery.data as { allow_changes: boolean }).allow_changes)
    : currentStatus === "DRAFT"

  if (!allowChanges) {
    return NextResponse.json(
      {
        error: `לא ניתן לערוך הזמנת רכש בסטטוס ${currentStatus}. העבירי לטיוטה או בטלי את האישור.`,
        code: "STATUS_LOCKED",
      },
      { status: 409 }
    )
  }

  // 3) אם supplied contactId — ולידציה שהוא באותו ספק + חברה.
  if (input.contactId) {
    const contactValidation = await supabase
      .from("erp_md_supplier_contacts")
      .select("id")
      .eq("company_id", activeCompanyId)
      .eq("supplier_id", currentSupplierId)
      .eq("id", input.contactId)
      .maybeSingle()
    if (contactValidation.error || !contactValidation.data) {
      return NextResponse.json(
        { error: "איש הקשר שסופק לא שייך לספק של ההזמנה" },
        { status: 400 }
      )
    }
  }

  // 4) אם supplied paymentTermsCode — ולידציה שהוא קיים ב-master.
  if (input.paymentTermsCode) {
    const paymentTermsValidation = await supabase
      .from("erp_payment_terms")
      .select("code")
      .eq("code", input.paymentTermsCode)
      .maybeSingle()
    if (paymentTermsValidation.error || !paymentTermsValidation.data) {
      return NextResponse.json(
        { error: `קוד תנאי תשלום לא נמצא: ${input.paymentTermsCode}` },
        { status: 400 }
      )
    }
  }

  // 5) בניית patch דינמי — רק שדות שסופקו במפורש נכנסים ל-UPDATE.
  //    חשוב: null הוא ערך תקף (מחיקת שדה); undefined = "לא נשלח".
  const patch: Record<string, unknown> = {}
  if (input.title !== undefined) patch.title = input.title
  if (input.notes !== undefined) patch.notes = input.notes
  if (input.bodyHtml !== undefined) patch.body_html = input.bodyHtml
  if (input.bodyHtmlEnglish !== undefined) patch.body_html_english = input.bodyHtmlEnglish
  if (input.contactId !== undefined) patch.contact_id = input.contactId
  if (input.receivingWarehouseCode !== undefined)
    patch.receiving_warehouse_code = input.receivingWarehouseCode
  if (input.orderDate !== undefined) patch.order_date = input.orderDate
  if (input.paymentTermsCode !== undefined)
    patch.payment_terms_code = input.paymentTermsCode
  if (input.vatCode !== undefined) patch.vat_code = input.vatCode
  if (input.withholdingPct !== undefined) patch.withholding_pct = input.withholdingPct
  if (input.shippingAddrHe !== undefined) patch.shipping_addr_he = input.shippingAddrHe
  if (input.shippingAddrEn !== undefined) patch.shipping_addr_en = input.shippingAddrEn
  if (input.isConfidential !== undefined) patch.is_confidential = input.isConfidential
  if (input.affectsPlanning !== undefined) patch.affects_planning = input.affectsPlanning
  // "אישורים ומעקב ביצוע"
  if (input.isPrinted !== undefined) patch.is_printed = input.isPrinted
  if (input.isUnlockedForChanges !== undefined) patch.is_unlocked_for_changes = input.isUnlockedForChanges
  if (input.isPartiallyClosed !== undefined) patch.is_partially_closed = input.isPartiallyClosed
  if (input.isPurchasingOnly !== undefined) patch.is_purchasing_only = input.isPurchasingOnly
  if (input.supplierAuthLevelOverride !== undefined) patch.supplier_auth_level_override = input.supplierAuthLevelOverride
  if (input.approversListCode !== undefined) patch.approvers_list_code = input.approversListCode
  // extended header fields
  if (input.poTypeCode !== undefined) patch.po_type_code = input.poTypeCode
  if (input.deliveryMethodCode !== undefined) patch.delivery_method_code = input.deliveryMethodCode
  if (input.branchCode !== undefined) patch.branch_code = input.branchCode
  if (input.forUserName !== undefined) patch.for_user_name = input.forUserName
  if (input.centralizedDemandRef !== undefined) patch.centralized_demand_ref = input.centralizedDemandRef
  if (input.quoteRef !== undefined) patch.quote_ref = input.quoteRef
  if (input.blanketOrderRef !== undefined) patch.blanket_order_ref = input.blanketOrderRef
  if (input.customerOrderRef !== undefined) patch.customer_order_ref = input.customerOrderRef
  if (input.serviceCallRef !== undefined) patch.service_call_ref = input.serviceCallRef
  if (input.importExportFileType !== undefined) patch.import_export_file_type = input.importExportFileType
  if (input.importExportFileRef !== undefined) patch.import_export_file_ref = input.importExportFileRef
  if (input.locationTracking !== undefined) patch.location_tracking = input.locationTracking

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "אף שדה לא סופק לעדכון" }, { status: 400 })
  }

  // 6) UPDATE. Trigger `erp_po_change_log` (אם פעיל — Phase 7.8) יתעד כל שינוי
  //    ברמת-שדה ל-audit trail. אין כאן צורך בטיפול ידני.
  const updateRes = await supabase
    .from("erp_purchase_orders")
    .update(patch)
    .eq("company_id", activeCompanyId)
    .eq("id", id)

  if (updateRes.error) {
    return NextResponse.json({ error: updateRes.error.message }, { status: 500 })
  }

  // 7) מחזירים minimal success. ה-UI עושה re-fetch של GET כדי לקבל את המצב המלא.
  return NextResponse.json({
    data: {
      id,
      updated: Object.keys(patch),
    },
  })
}
