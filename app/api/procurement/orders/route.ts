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
      "id,po_number,title,status,total_amount,issued_at,created_at,notes,supplier:erp_md_suppliers!supplier_id(id,name,supplier_number)"
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
      totalAmount: Number(row.total_amount),
      // הסכמה הנוכחית לא שומרת מטבע פר-PO; ברירת מחדל ILS עד שנוסיף עמודה ב-Phase 7.2.
      currency: "ILS",
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
