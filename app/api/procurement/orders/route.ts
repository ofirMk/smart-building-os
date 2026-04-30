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

const lineSchema = z.object({
  itemId: z.string().uuid("itemId חייב להיות uuid"),
  quantity: z.number().positive("quantity חייב להיות חיובי"),
  unitPrice: z.number().min(0, "unitPrice חייב להיות אי-שלילי"),
  // שדות תקצוב פרויקטלי — חובה כדי לכבד את מודל הבקרה הפיננסית של ה-ERP.
  budgetSubChapter: z.string().trim().min(1, "budgetSubChapter חובה"),
  resourceId: z.string().trim().min(1, "resourceId חובה"),
  description: z.string().trim().min(1).optional(),
})

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
  lines: z.array(lineSchema).min(1, "חובה לפחות שורה אחת"),
})

const VAT_RATE = 0.17

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

  // 2) אימות שהספק שייך לחברה הפעילה. שומרים גם את השם לצורך יצירת title ברירת-מחדל.
  const supplierLookup = await supabase
    .from("erp_md_suppliers")
    .select("id,name")
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
  const vatAmount = round2(totalAmountNet * VAT_RATE)
  const totalAmountGross = round2(totalAmountNet + vatAmount)

  // 6) יצירת מספר הזמנה וכותרת אם לא סופקו.
  const poNumber = input.poNumber ?? generatePoNumber()
  const todayIso = new Date().toISOString().slice(0, 10)
  const title =
    input.title ?? `הזמנה ל-${supplierName} (${todayIso})`

  // 7) INSERT לכותרת. status נשאר ברירת-מחדל DRAFT (enum `erp_purchase_order_status`).
  //    total_amount נשאר 0 — הטריגר `erp_po_lines_recalculate_total` יעדכן לאחר
  //    הכנסת השורות. השדות הפיננסיים החדשים נשמרים מפורשות.
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
    })
    .select("id,po_number,title,status,currency,total_amount_net,vat_amount,total_amount_gross,notes,created_at")
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
      // ניתן לעקוב אחר סדר השורות לפי created_at; אם נצטרך עמודת line_number
      // מפורשת — נוסיף אותה ב-Phase 7.3 כ-ALTER additive.
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
