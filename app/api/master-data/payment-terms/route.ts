/**
 * `/api/master-data/payment-terms` — Phase B'' (Priority parity UI support).
 *
 * GET — מחזיר את כל קודי תנאי התשלום מ-`erp_payment_terms`.
 *
 * המקור הוא טבלת master-data קומפנית (לא per-tenant) — קודים כמו 01, 02, 11,
 * 03-07, EOM/E30/E60 שקיימים ברמת המערכת. RLS של הטבלה הוא
 * `to authenticated using (true)` — כל משתמש authed יכול לקרוא.
 *
 * Query params:
 *   ?eom=true   — רק תנאים שהם EOM ("סוף חודש +")
 *   ?eom=false  — רק תנאים שלא-EOM
 *
 * אין POST/PUT/DELETE — קודים מתווספים דרך מיגרציות seed בלבד
 * (governance-as-code). ניהול UI יבוא ב-Phase C (master-data admin screens).
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export type PaymentTermDto = {
  code: string
  description: string
  isEom: boolean
  monthsToAdd: number
  daysToAdd: number
  installments: number
}

type PaymentTermRow = {
  code: string
  description: string
  is_eom: boolean
  months_to_add: number | string
  days_to_add: number | string
  installments: number | string
}

export async function GET(req: NextRequest) {
  // master-data גלובלי — לא תלוי ב-company — אבל עדיין דורש authed user.
  // `requireProcurementApiContext` גם מאמת company (להרבה שימושים צריך),
  // אבל ה-endpoint עצמו לא מסנן לפי company.
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase } = ctx

  const eomParam = req.nextUrl.searchParams.get("eom")?.toLowerCase() ?? null

  let query = supabase
    .from("erp_payment_terms")
    .select("code,description,is_eom,months_to_add,days_to_add,installments")
    .order("code", { ascending: true })

  if (eomParam === "true") query = query.eq("is_eom", true)
  else if (eomParam === "false") query = query.eq("is_eom", false)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as PaymentTermRow[]
  const dto: PaymentTermDto[] = rows.map((r) => ({
    code: r.code,
    description: r.description,
    isEom: Boolean(r.is_eom),
    monthsToAdd: Number(r.months_to_add),
    daysToAdd: Number(r.days_to_add),
    installments: Number(r.installments),
  }))

  return NextResponse.json({ data: dto })
}
