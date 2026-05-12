/**
 * `/api/procurement/orders` — Phase 7.1
 *
 * נקודת הקצה הקנונית-החדשה למסך הנחיתה של הזמנות רכש (PO Data Grid).
 *
 * ## טבלאות שמאחורי ה-API
 * משתמש ב-`erp_purchase_orders` הקיים מ-`20260627110000_erp_procurement_bpm_engine.sql`.
 * RLS מאובטח דרך `user_has_company_access(company_id)` (מיגרציה
 * `20260426130000_tenant_rls_hardening.sql`) — אכיפה כפולה: הן ב-DB והן ב-API דרך
 * `requireProcurementApiContext` שעוטף את `requireMasterDataApiContext`
 * ומאמת `x-active-company-id` + membership.
 *
 * ## למה לא יצרנו `erp_pur_po_headers` חדשה
 * הסקירה גילתה שכבר קיימת תשתית קנונית מאובטחת לחלוטין; יצירת זוג טבלאות מקביל
 * הייתה מובילה ל-schema chaos (כבר יש 4 גרסאות PO היסטוריות בקודבייס). השדות
 * החסרים מבקשת המנהל (currency, total_amount_net/vat/gross) יתווספו בתור ALTER
 * additive בעת מימוש POST של Phase 7.2 בלבד אם יידרשו אז.
 *
 * ## תצוגה
 * ה-GET מבצע JOIN ל-`erp_md_suppliers` כדי להחזיר `supplierName` ו-`supplierNum`
 * מובנים בכל שורה — חוסך round-trip בלקוח ומאפשר ל-Data Grid להציג ספק קריא
 * בעמודה.
 */

import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"
import { getVatMultiplier } from "@/lib/erp/system-parameters"
import {
  computeLineDeviation,
  getCompanyPricingSettings,
} from "@/lib/procurement/pricing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** DTO שמוחזר ללקוח — שטוח, ידידותי לתצוגה ב-Data Grid. */
export type ProcurementOrderListDto = {
  id: string
  poNumber: string
  title: string
  status: string
  totalAmount: number
  currency: string
  issuedAt: string | null
  createdAt: string
  notes: string | null
  supplier: {
    id: string
    name: string
    supplierNum: string | null
  } | null
}

type SupplierJoin = {
  id: string
  name: string
  supplier_number: string | null
} | null

type PurchaseOrderRow = {
  id: string
  po_number: string
  title: string
  status: string
  total_amount: number | string
  total_amount_net: number | string | null
  vat_amount: number | string | null
  total_amount_gross: number | string | null
  currency: string | null
  issued_at: string | null
  created_at: string
  notes: string | null
  // PostgREST מחזיר את ה-JOIN כאובייקט יחיד בשם הזר (foreign-key alias).
  supplier: SupplierJoin | SupplierJoin[]
}

function pickSupplier(value: SupplierJoin | SupplierJoin[]): SupplierJoin {
  // PostgREST מחזיר לפעמים מערך גם ב-1:N הפוך — מנרמל לערך יחיד או null.
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

export async function GET(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const status = req.nextUrl.searchParams.get("status")?.trim() || null
  const q = req.nextUrl.searchParams.get("q")?.trim() || null

  // JOIN דרך FK של `supplier_id` לטבלת `erp_md_suppliers`. ה-alias `supplier:` עוטף
  // את האובייקט המוחזר במפתח קריא בלי לחשוף את שם הטבלה הפנימי ללקוח.
  let query = supabase
    .from("erp_purchase_orders")
    .select(
      "id,po_number,title,status,total_amount,total_amount_net,vat_amount,total_amount_gross,currency,issued_at,created_at,notes,supplier:erp_md_suppliers!supplier_id(id,name,supplier_number)"
    )
    .eq("company_id", activeCompanyId)
    .order("created_at", { ascending: false })

  if (status) query = query.eq("status", status)
  if (q) query = query.or(`po_number.ilike.%${q}%,title.ilike.%${q}%`)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as PurchaseOrderRow[]
  const dto: ProcurementOrderListDto[] = rows.map((row) => {
    const supplier = pickSupplier(row.supplier)
    return {
      id: row.id,
      poNumber: row.po_number,
      title: row.title,
      status: row.status,
      // total_amount הישן מקבל ערך אוטומטית מהטריגר `erp_po_lines_recalculate_total`
      // (סכום total_price של השורות = נטו). מציגים אותו כ-fallback אם הברוטו ריק.
      totalAmount: Number(row.total_amount_gross ?? row.total_amount),
      currency: row.currency ?? "ILS",
      issuedAt: row.issued_at,
      createdAt: row.created_at,
      notes: row.notes,
      supplier: supplier
        ? {
            id: supplier.id,
            name: supplier.name,
            supplierNum: supplier.supplier_number,
          }
        : null,
    }
  })

  return NextResponse.json({ data: dto })
}

// ============================================================================
// POST — Phase 7.2.A
// ============================================================================
// יוצר Header + Lines באופן Transaction-style ב-2 פעולות:
//   1) INSERT לכותרת ב-`erp_purchase_orders` (סטטוס DRAFT, חישובים פיננסיים).
//   2) INSERT-batch לשורות ב-`erp_purchase_order_lines`.
// אם שלב (2) נכשל — מוחקים את הכותרת (compensating action) כדי למנוע שאריות
// "ראשי PO ללא שורות" שעלולים לבלבל את ה-grid. PostgreSQL לא תומך ב-multi-table
// transactions ב-supabase-js, אז זוהי הגישה הטובה ביותר ללא RPC.
//
// אכיפת tenant: כל ה-CRUD עובר דרך `requireProcurementApiContext` שמוודא
// `x-active-company-id` + membership, וב-RLS ברמת ה-DB.
//
// Triggers שמשפיעים על הזרימה הזו (מ-`20260627110000_*` + `20260627220000_*`):
//   • `erp_po_lines_recalculate_total` — מאחורי הקלעים מעדכן `total_amount`
//     בכותרת אחרי insert לכל שורה (סכום total_price = נטו). הברוטו/מע"מ שלנו
//     נשמרים בעמודות הפיננסיות הנפרדות שלא מתעדכנות אוטומטית.
//   • `erp_po_line_price_ceiling_trg` — אם נמצא effective price לפריט+ספק
//     וה-unit_price מעליו, יקפיץ את הכותרת ל-PENDING_PRICE_APPROVAL. אצלנו
//     ב-DRAFT-flow זה תקין; השרת מחזיר את הסטטוס הסופי.

const ESCALATION_CATEGORIES = [
  "BUSINESS_RELATIONSHIP",
  "QUALITY",
  "AVAILABILITY",
  "LEAD_TIME",
  "OTHER",
] as const

// Phase 7.4 — חייב להיות מסונכרן עם ה-CHECK constraint
// `erp_purchase_order_lines_price_source_chk`.
const PRICE_SOURCES = [
  "SUPPLIER_PRICELIST",
  "LAST_PURCHASE",
  "MANUAL",
  "QUOTE",
  "FRAMEWORK",
  "AI_CROSS_SUPPLIER",
] as const

// Phase A — סטטוס שורה; חייב להיות תואם ל-CHECK constraint
// `erp_purchase_order_lines_line_status_chk`.
const LINE_STATUSES = ["OPEN", "PARTIAL", "CLOSED", "CANCELLED"] as const

// Phase A — סיווג עלות יבוא; תואם ל-CHECK
// `erp_purchase_order_lines_import_cost_type_chk`.
const IMPORT_COST_TYPES = ["L", "S", "A"] as const

const lineSchema = z.object({
  itemId: z.string().uuid("itemId חייב להיות uuid"),
  quantity: z.number().positive("quantity חייב להיות חיובי"),
  unitPrice: z.number().min(0, "unitPrice חייב להיות אי-שלילי"),
  // שדות תקצוב פרויקטלי — חובה כדי לכבד את מודל הבקרה הפיננסית של ה-ERP.
  budgetSubChapter: z.string().trim().min(1, "budgetSubChapter חובה"),
  resourceId: z.string().trim().min(1, "resourceId חובה"),
  description: z.string().trim().min(1).optional(),
  // Phase 7.4 — Line enrichment (all optional for backward compat)
  supplyDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  discountPct: z.number().min(0).max(100).optional(),
  lineCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
  exchangeRate: z.number().positive().optional(),
  manufacturerName: z.string().trim().min(1).optional(),
  lineNotes: z.string().trim().optional(),
  /**
   * Phase 7.13.2 — מקור המחיר. ברירת מחדל בשרת = MANUAL כל עוד הקליינט לא
   * מציין במפורש. ה-Smart-Pricing engine ב-Phase 7.5 משתמש בערך זה כקלט
   * לחישוב deviation: לדוגמה, "QUOTE" עוקף חלק מבדיקות ה-3% Rule.
   */
  priceSource: z.enum(PRICE_SOURCES).optional(),
  // Phase 7.5 — 3% Rule governance (optional; required only when requires_escalation computed=true)
  escalationJustification: z.string().trim().min(10).optional(),
  escalationCategory: z.enum(ESCALATION_CATEGORIES).optional(),
  // Phase A — Priority parity (all optional; auto-fill בשרת היכן שאפשר)
  lineNumber: z.number().int().positive().optional(),
  uom: z.string().trim().min(1).max(32).optional(),
  supplierSku: z.string().trim().min(1).optional(),
  supplierSkuDescription: z.string().trim().min(1).optional(),
  budgetItemCode: z.string().trim().min(1).optional(),
  budgetUtilizationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  importCostType: z.enum(IMPORT_COST_TYPES).optional(),
  demandNumber: z.string().trim().min(1).optional(),
  salesOrderId: z.string().uuid().optional(),
  salesOrderLineId: z.string().uuid().optional(),
  lineStatus: z.enum(LINE_STATUSES).optional(),
})

const URGENCY_LEVELS = ["NORMAL", "HIGH", "CRITICAL"] as const

// Phase A — Shipping address sub-schema (Priority "כתובת למשלוח")
const shippingAddrSchema = z
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

const createOrderSchema = z.object({
  supplierId: z.string().uuid("supplierId חייב להיות uuid"),
  // project_id חובה (NOT NULL בסכמה הקנונית) — אכיפה כפולה ב-zod וב-DB.
  projectId: z.string().uuid("projectId חייב להיות uuid"),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "currency חייב להיות קוד ISO 4217 בן 3 אותיות")
    .default("ILS"),
  notes: z.string().trim().optional().nullable(),
  // אופציונליים — נוצרים בשרת אם לא סופקו.
  poNumber: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  // Phase 7.4 — Urgency governance
  urgencyLevel: z.enum(URGENCY_LEVELS).optional(),
  urgencyJustification: z.string().trim().min(10).optional(),
  // Phase A — Priority parity header fields (all optional; auto-fill מהספק אם אפשר)
  contactId: z.string().uuid().optional(),
  receivingWarehouseCode: z.string().trim().min(1).max(32).optional(),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paymentTermsCode: z.string().trim().min(1).max(16).optional(),
  vatCode: z.string().trim().min(1).max(32).optional(),
  withholdingPct: z.number().min(0).max(100).optional(),
  shippingAddrHe: shippingAddrSchema.optional(),
  shippingAddrEn: shippingAddrSchema.optional(),
  isConfidential: z.boolean().optional(),
  affectsPlanning: z.boolean().optional(),
  lines: z.array(lineSchema).min(1, "חובה לפחות שורה אחת"),
}).refine(
  (data) => {
    // HIGH/CRITICAL urgency requires justification (audit trail + abuse prevention)
    if (data.urgencyLevel && data.urgencyLevel !== "NORMAL") {
      return (data.urgencyJustification?.length ?? 0) >= 10
    }
    return true
  },
  {
    message: "urgencyLevel=HIGH/CRITICAL חייב להיות מלווה ב-urgencyJustification (לפחות 10 תווים)",
    path: ["urgencyJustification"],
  }
)

/**
 * Hardcoded fallback only — actual rate resolved from system parameter
 * DEFAULT_VAT_PCT per company at request time. Migrated as part of the
 * Sprint W2 Stage 4 System Parameters resolver migration.
 */
const VAT_RATE_FALLBACK = 0.17

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function generatePoNumber(): string {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(now.getUTCDate()).padStart(2, "0")
  const hh = String(now.getUTCHours()).padStart(2, "0")
  const mi = String(now.getUTCMinutes()).padStart(2, "0")
  const ss = String(now.getUTCSeconds()).padStart(2, "0")
  const rand = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")
  return `PO-${yyyy}${mm}${dd}-${hh}${mi}${ss}${rand}`
}

export async function POST(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  // 1) ולידציה של ה-payload.
  const body = await req.json().catch(() => null)
  const parsed = createOrderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }
  const input = parsed.data

  // 2) אימות שהספק שייך לחברה הפעילה. שולפים שדות לצורך יצירת title ברירת-מחדל
  //    ולצורך Tesla auto-fill של header fields בהמשך (payment terms, וכו').
  const supplierLookup = await supabase
    .from("erp_md_suppliers")
    .select("id,name,payment_terms,address")
    .eq("company_id", activeCompanyId)
    .eq("id", input.supplierId)
    .maybeSingle()
  if (supplierLookup.error) {
    return NextResponse.json(
      { error: supplierLookup.error.message },
      { status: 500 }
    )
  }
  if (!supplierLookup.data) {
    return NextResponse.json(
      { error: "ספק לא נמצא בחברה הפעילה" },
      { status: 400 }
    )
  }
  const supplierName = supplierLookup.data.name as string
  // supplier.payment_terms הוא טקסט חופשי legacy — לא משתמשים בו ב-INSERT
  // (payment_terms_code הוא FK ל-master). ה-UI יוכל לשלוף אותו בנפרד
  // דרך GET של ה-supplier ולהציג כ-hint. לא נשמר ב-local var כאן.
  const supplierAddress = (supplierLookup.data.address as string | null) ?? null

  // 2.1) Tesla auto-fill — Primary contact של הספק (אם לא סופק contactId).
  //      משתמש ב-is_primary=true; אם אין — לוקח את הראשון (בסדר זמן יצירה).
  let resolvedContactId: string | null = input.contactId ?? null
  if (!resolvedContactId) {
    const contactLookup = await supabase
      .from("erp_md_supplier_contacts")
      .select("id,is_primary,created_at")
      .eq("company_id", activeCompanyId)
      .eq("supplier_id", input.supplierId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!contactLookup.error && contactLookup.data?.id) {
      resolvedContactId = contactLookup.data.id as string
    }
  } else {
    // ולידציה: ה-contact שסופק חייב להיות של אותו ספק באותה חברה.
    const contactValidation = await supabase
      .from("erp_md_supplier_contacts")
      .select("id")
      .eq("company_id", activeCompanyId)
      .eq("supplier_id", input.supplierId)
      .eq("id", resolvedContactId)
      .maybeSingle()
    if (contactValidation.error || !contactValidation.data) {
      return NextResponse.json(
        { error: "איש הקשר שסופק לא שייך לספק זה" },
        { status: 400 }
      )
    }
  }

  // 2.2) Tesla auto-fill — Payment terms code.
  //      erp_md_suppliers.payment_terms הוא טקסט חופשי legacy. אם המשתמש לא
  //      סיפק paymentTermsCode, לא נבצע derivation אוטומטי (מסוכן לנחש) —
  //      פשוט משאירים null. ה-UI יציג את הטקסט החופשי מה-supplier כרמז.
  const resolvedPaymentTermsCode: string | null = input.paymentTermsCode ?? null
  if (resolvedPaymentTermsCode) {
    // ולידציה ש-code קיים ב-master. מגנה מפני typos.
    const paymentTermsValidation = await supabase
      .from("erp_payment_terms")
      .select("code")
      .eq("code", resolvedPaymentTermsCode)
      .maybeSingle()
    if (paymentTermsValidation.error || !paymentTermsValidation.data) {
      return NextResponse.json(
        { error: `קוד תנאי תשלום לא נמצא: ${resolvedPaymentTermsCode}` },
        { status: 400 }
      )
    }
  }

  // 3) אימות שהפרויקט שייך לחברה הפעילה. הטבלה הקנונית של פרויקטים היא
  //    `erp_proj_projects` (FK של erp_purchase_orders.project_id).
  const projectLookup = await supabase
    .from("erp_proj_projects")
    .select("id")
    .eq("company_id", activeCompanyId)
    .eq("id", input.projectId)
    .maybeSingle()
  if (projectLookup.error) {
    return NextResponse.json(
      { error: projectLookup.error.message },
      { status: 500 }
    )
  }
  if (!projectLookup.data) {
    return NextResponse.json(
      { error: "פרויקט לא נמצא בחברה הפעילה" },
      { status: 400 }
    )
  }

  // 4) טעינת כל הפריטים בקריאה אחת (`.in()`) — לאימות שייכות ולשליפת
  //    item_number + description לתשובה לטריגר price-ceiling ולשדה description
  //    החובה בטבלת השורות.
  const itemIds = Array.from(new Set(input.lines.map((l) => l.itemId)))
  const itemsLookup = await supabase
    .from("erp_md_items")
    .select("id,item_number,description")
    .eq("company_id", activeCompanyId)
    .in("id", itemIds)
  if (itemsLookup.error) {
    return NextResponse.json(
      { error: itemsLookup.error.message },
      { status: 500 }
    )
  }
  const itemsById = new Map<string, { itemNumber: string; description: string }>()
  for (const row of itemsLookup.data ?? []) {
    itemsById.set(row.id as string, {
      itemNumber: row.item_number as string,
      description: (row.description as string) ?? "",
    })
  }
  const missingItems = itemIds.filter((id) => !itemsById.has(id))
  if (missingItems.length > 0) {
    return NextResponse.json(
      { error: `פריטים לא נמצאו בחברה הפעילה: ${missingItems.join(", ")}` },
      { status: 400 }
    )
  }

  // 5) חישוב פיננסי בצד השרת — מקור-אמת יחיד. הלקוח אינו אמין על סכומים.
  const totalAmountNet = round2(
    input.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
  )
  let vatMultiplier: number
  try {
    vatMultiplier = await getVatMultiplier(activeCompanyId)
  } catch {
    vatMultiplier = VAT_RATE_FALLBACK
  }
  const vatAmount = round2(totalAmountNet * vatMultiplier)
  const totalAmountGross = round2(totalAmountNet + vatAmount)

  // ─────────────────────────────────────────────────────────────────────
  // Phase 7.5 — 3% Rule: חישוב deviation פר-שורה + אכיפת justification
  // ─────────────────────────────────────────────────────────────────────
  //  קריאה ל-RPC `erp_compute_line_deviation` פר שורה (stateless, AI-ready).
  //  אם שורה דורשת escalation ולא מלווה ב-justification + category → 400.
  //  הלוגיקה רצה גם כש-Cross-Supplier mapping ריק (RPC יחזיר
  //  requires_escalation=false כברירת מחדל שמרנית).
  let settings
  try {
    settings = await getCompanyPricingSettings(supabase, activeCompanyId)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "company-settings failed" },
      { status: 500 }
    )
  }

  const lineEnrichment: Array<{
    deviationPct: number | null
    requiresEscalation: boolean
    alternativeSupplierId: string | null
    alternativeUnitPrice: number | null
    alternativeLeadTimeDays: number | null
  }> = []
  const escalationErrors: string[] = []

  for (const [idx, line] of input.lines.entries()) {
    let deviation
    try {
      deviation = await computeLineDeviation(supabase, {
        companyId: activeCompanyId,
        masterItemId: line.itemId,
        supplierId: input.supplierId,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        projectId: input.projectId,
      })
    } catch (err) {
      // במידה וה-RPC נכשל — לא חוסמים את ה-PO; לוגים וברירת מחדל שמרנית.
      console.error("[procurement POST] line-deviation RPC failed:", err)
      deviation = {
        lowestAltPrice: null,
        lowestAltSupplierId: null,
        lowestAltLeadTime: null,
        deviationPct: null,
        requiresEscalation: false,
        exceptionApplied: false,
        thresholdPct: settings.maxAllowedLineDeviationPct,
      }
    }

    if (deviation.requiresEscalation) {
      const hasJustification =
        (line.escalationJustification?.trim().length ?? 0) >= 10
      const hasCategory = Boolean(line.escalationCategory)
      if (!hasJustification || !hasCategory) {
        escalationErrors.push(
          `שורה ${idx + 1}: חריגת מחיר של ${deviation.deviationPct}% מעבר לסף ${deviation.thresholdPct}% של החברה. חובה לספק escalationJustification (>=10 תווים) ו-escalationCategory.`
        )
      }
    }

    lineEnrichment.push({
      deviationPct: deviation.deviationPct,
      requiresEscalation: deviation.requiresEscalation,
      alternativeSupplierId: deviation.lowestAltSupplierId,
      alternativeUnitPrice: deviation.lowestAltPrice,
      alternativeLeadTimeDays: deviation.lowestAltLeadTime,
    })
  }

  if (escalationErrors.length > 0) {
    return NextResponse.json(
      {
        error: "escalation_required",
        details: escalationErrors,
      },
      { status: 400 }
    )
  }

  // חישוב PO-total deviation על בסיס סכום ההיפרשי של כל השורות
  //   deviation משוקלל לפי שווי שורה (qty * unit_price).
  let weightedSum = 0
  let totalWeight = 0
  for (const [idx, line] of input.lines.entries()) {
    const weight = line.quantity * line.unitPrice
    const d = lineEnrichment[idx]?.deviationPct
    if (d != null) {
      weightedSum += d * weight
      totalWeight += weight
    }
  }
  const poTotalDeviationPct =
    totalWeight > 0 ? round2(weightedSum / totalWeight) : null
  const requiresPoEscalation =
    poTotalDeviationPct != null &&
    poTotalDeviationPct > settings.maxAllowedPoTotalDeviationPct

  // ─────────────────────────────────────────────────────────────────────
  // 6) יצירת מספר הזמנה וכותרת אם לא סופקו.
  // ─────────────────────────────────────────────────────────────────────
  const poNumber = input.poNumber ?? generatePoNumber()
  const todayIso = new Date().toISOString().slice(0, 10)
  const title =
    input.title ?? `הזמנה ל-${supplierName} (${todayIso})`

  // Urgency bypass: אם החברה מאפשרת + urgency=HIGH/CRITICAL → ai_negotiation_status=BYPASSED_URGENCY
  const urgencyLevel = input.urgencyLevel ?? "NORMAL"
  const aiNegotiationStatus =
    urgencyLevel !== "NORMAL" && settings.urgencyBypassEnabled
      ? "BYPASSED_URGENCY"
      : "NOT_ATTEMPTED"

  // Phase A — Tesla auto-fill של shipping address (עברית בלבד; אנגלית רק אם
  //           סופקה מפורשות). אם המשתמש לא סיפק shippingAddrHe — נגזור מכתובת
  //           הספק כ-line1 (fallback שמרני; ב-Phase B ייווצר UI נפרד למחסני
  //           החברה ששם נשאב את הכתובת).
  const resolvedShippingAddrHe =
    input.shippingAddrHe ??
    (supplierAddress ? { line1: supplierAddress } : null)

  // 7) INSERT לכותרת. status נשאר ברירת-מחדל DRAFT (enum `erp_purchase_order_status`).
  //    total_amount נשאר 0 — הטריגר `erp_po_lines_recalculate_total` יעדכן לאחר
  //    הכנסת השורות. השדות הפיננסיים החדשים נשמרים מפורשות.
  //    Phase A — שדות parity נשמרים גם הם; NULL מותר לכולם.
  const headerInsert = await supabase
    .from("erp_purchase_orders")
    .insert({
      company_id: activeCompanyId,
      project_id: input.projectId,
      supplier_id: input.supplierId,
      po_number: poNumber,
      title,
      status: "DRAFT",
      currency: input.currency,
      total_amount_net: totalAmountNet,
      vat_amount: vatAmount,
      total_amount_gross: totalAmountGross,
      notes: input.notes ?? null,
      urgency_level: urgencyLevel,
      urgency_justification: input.urgencyJustification ?? null,
      ai_negotiation_status: aiNegotiationStatus,
      po_total_deviation_pct: poTotalDeviationPct,
      requires_po_escalation: requiresPoEscalation,
      // Phase A — Priority parity fields
      contact_id: resolvedContactId,
      receiving_warehouse_code: input.receivingWarehouseCode ?? null,
      order_date: input.orderDate ?? todayIso,
      payment_terms_code: resolvedPaymentTermsCode,
      vat_code: input.vatCode ?? null,
      withholding_pct: input.withholdingPct ?? null,
      shipping_addr_he: resolvedShippingAddrHe,
      shipping_addr_en: input.shippingAddrEn ?? null,
      is_confidential: input.isConfidential ?? false,
      affects_planning: input.affectsPlanning ?? true,
    })
    .select("id,po_number,title,status,currency,total_amount_net,vat_amount,total_amount_gross,notes,created_at,urgency_level,requires_po_escalation,po_total_deviation_pct,ai_negotiation_status,contact_id,receiving_warehouse_code,order_date,payment_terms_code,is_confidential,affects_planning")
    .single()

  if (headerInsert.error || !headerInsert.data) {
    return NextResponse.json(
      {
        error:
          headerInsert.error?.message ??
          "יצירת הזמנת רכש (header) נכשלה",
      },
      { status: 400 }
    )
  }

  const purchaseOrderId = headerInsert.data.id as string

  // 8) הכנת השורות. חובה למלא:
  //    • company_id — RLS חוסם בלי זה.
  //    • project_id / budget_sub_chapter / resource_id — NOT NULL לפי governance.
  //    • description — NOT NULL + check length>0.
  //    • item_id — קישור מודרני; item_sku — denorm לטריגר price-ceiling.
  //    • total_price הוא generated column — לא מוכנס.
  const linesPayload = input.lines.map((line, idx) => {
    const item = itemsById.get(line.itemId)!
    const description =
      line.description?.trim() || item.description.trim() || `פריט ${item.itemNumber}`
    const enrichment = lineEnrichment[idx]
    // supplyDate מתקבל כ-"YYYY-MM-DD" או ISO datetime; המרה ל-DATE בלבד ל-DB
    const supplyDate = line.supplyDate
      ? line.supplyDate.slice(0, 10)
      : null
    return {
      company_id: activeCompanyId,
      purchase_order_id: purchaseOrderId,
      project_id: input.projectId,
      budget_sub_chapter: line.budgetSubChapter,
      resource_id: line.resourceId,
      item_id: line.itemId,
      item_sku: item.itemNumber,
      description,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      // Phase 7.4 — Line enrichment
      supply_date: supplyDate,
      discount_pct: line.discountPct ?? 0,
      line_currency: line.lineCurrency ?? input.currency,
      exchange_rate: line.exchangeRate ?? 1,
      manufacturer_name: line.manufacturerName ?? null,
      line_notes: line.lineNotes ?? null,
      // Phase 7.5 — Governance (enrichment from RPC)
      price_deviation_pct: enrichment?.deviationPct ?? null,
      requires_escalation: enrichment?.requiresEscalation ?? false,
      escalation_justification:
        enrichment?.requiresEscalation ? (line.escalationJustification ?? null) : null,
      escalation_category:
        enrichment?.requiresEscalation ? (line.escalationCategory ?? null) : null,
      alternative_supplier_id: enrichment?.alternativeSupplierId ?? null,
      alternative_unit_price: enrichment?.alternativeUnitPrice ?? null,
      alternative_lead_time_days: enrichment?.alternativeLeadTimeDays ?? null,
      price_source: line.priceSource ?? ("MANUAL" as const),
      // Phase A — Priority parity (Tesla auto-fill של line_number; שאר השדות
      //          nullable ומקבלים את הערך מהקליינט אם סופק).
      line_number: line.lineNumber ?? idx + 1,
      uom: line.uom ?? null,
      supplier_sku: line.supplierSku ?? null,
      supplier_sku_description: line.supplierSkuDescription ?? null,
      budget_item_code: line.budgetItemCode ?? null,
      budget_utilization_date: line.budgetUtilizationDate ?? null,
      import_cost_type: line.importCostType ?? null,
      demand_number: line.demandNumber ?? null,
      sales_order_id: line.salesOrderId ?? null,
      sales_order_line_id: line.salesOrderLineId ?? null,
      // line_status אם סופק — אחרת ברירת-מחדל 'OPEN' (ממילא default בסכמה);
      // ה-trigger erp_po_lines_sync_line_status_trg שומר על סנכרון עם received_qty.
      line_status: line.lineStatus ?? "OPEN",
      _lineIndex: idx, // נמחק לפני INSERT (לא קיים בסכמה).
    }
  })

  // הסרת שדה השירות שלא קיים בסכמה.
  const linesForDb = linesPayload.map(({ _lineIndex: _ignored, ...rest }) => rest)

  const linesInsert = await supabase
    .from("erp_purchase_order_lines")
    .insert(linesForDb)
    .select("id")

  if (linesInsert.error) {
    // 9) Compensating action: מוחקים את הכותרת כדי שלא יישאר PO רֵיק במערכת.
    //    שגיאת המחיקה לא נחשפת ללקוח כדי לא להסתיר את שגיאת השורות המקורית.
    await supabase
      .from("erp_purchase_orders")
      .delete()
      .eq("company_id", activeCompanyId)
      .eq("id", purchaseOrderId)

    return NextResponse.json(
      {
        error: `יצירת שורות הזמנה נכשלה: ${linesInsert.error.message}`,
      },
      { status: 400 }
    )
  }

  // 10) קוראים מחדש את הכותרת לאחר הטריגר recalculate_total כדי להחזיר
  //     total_amount עדכני ללקוח.
  const finalHeader = await supabase
    .from("erp_purchase_orders")
    .select("id,po_number,title,status,currency,total_amount,total_amount_net,vat_amount,total_amount_gross,notes,created_at")
    .eq("company_id", activeCompanyId)
    .eq("id", purchaseOrderId)
    .single()

  return NextResponse.json(
    {
      data: {
        id: purchaseOrderId,
        poNumber: finalHeader.data?.po_number ?? poNumber,
        title: finalHeader.data?.title ?? title,
        status: finalHeader.data?.status ?? "DRAFT",
        currency: finalHeader.data?.currency ?? input.currency,
        totalAmountNet: Number(finalHeader.data?.total_amount_net ?? totalAmountNet),
        vatAmount: Number(finalHeader.data?.vat_amount ?? vatAmount),
        totalAmountGross: Number(
          finalHeader.data?.total_amount_gross ?? totalAmountGross
        ),
        notes: finalHeader.data?.notes ?? input.notes ?? null,
        createdAt: finalHeader.data?.created_at ?? new Date().toISOString(),
        linesCount: linesInsert.data?.length ?? input.lines.length,
      },
    },
    { status: 201 }
  )
}
