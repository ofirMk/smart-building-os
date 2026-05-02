/**
 * `/api/procurement/orders/[id]/send` — Phase 8.1.4
 *
 * POST — שולח PO לספק במייל, מעדכן סטטוס ל-SENT_TO_SUPPLIER, ורושם לאודיט.
 *
 * ## סדר פעולות (atomic-ish)
 *   1. אימות — המשתמש חייב להיות member של החברה הפעילה (RLS + context).
 *   2. טעינה — ה-PO עצמו (לוודא שהוא APPROVED או SENT_TO_SUPPLIER כבר;
 *      שליחה חוזרת מותרת, מתעדכנת רק ב-log).
 *   3. שליחת המייל — דרך `sendPoToSupplierEmail` (מעטפת עם mock fallback).
 *   4. רישום ל-`erp_po_sent_log` — SUCCESS / MOCK / FAILED עם provider_message.
 *   5. אם זו שליחה ראשונה, עדכון `erp_purchase_orders.status = 'SENT_TO_SUPPLIER'`.
 *      (לא קוראים ל-RPC נפרד כי זו פעולה פשוטה; RLS + בדיקה ידנית כאן
 *      מספיקים.)
 *
 * ## Contract
 *   Body JSON:
 *     {
 *       recipientEmail: string,  // חובה
 *       note?: string,           // אופציונלי
 *       pdfBase64: string,       // חובה — ה-PDF מיוצר בקליינט
 *     }
 *
 *   Response:
 *     {
 *       data: {
 *         logId: string,
 *         delivery: "SUCCESS" | "MOCK" | "FAILED",
 *         providerMessage: string | null,
 *         newStatus: string,     // הסטטוס של ה-PO אחרי הפעולה
 *       }
 *     }
 *
 * ## למה ה-PDF מגיע מהקליינט
 *   קיימת תשתית `@react-pdf/renderer` שעובדת client-side כ-pdf().toBlob().
 *   רינדור שרת-ביש דורש loader של פונט עברית מהאינטרנט, שעלול להיות חסום
 *   ב-runtime של Vercel Functions. המודל שבחרנו מקביל לזה של
 *   `invoice-commander-client.tsx` (הפקת חשבוניות) — עקביות אדריכלית.
 */

import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"
import { sendPoToSupplierEmail } from "@/lib/email/send-po"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string }

function normalizeParams(
  params: Promise<RouteParams> | RouteParams,
): Promise<RouteParams> {
  return Promise.resolve(params)
}

const bodySchema = z.object({
  recipientEmail: z
    .string()
    .trim()
    .min(3, "כתובת מייל חסרה")
    .email("כתובת מייל לא תקינה"),
  note: z.string().max(4000).optional().nullable(),
  pdfBase64: z
    .string()
    .min(100, "תוכן PDF חסר או קצר מדי"),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams },
) {
  const { id } = await normalizeParams(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId, userId } = ctx

  const json = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Body לא תקין" },
      { status: 400 },
    )
  }
  const { recipientEmail, note, pdfBase64 } = parsed.data

  // 1) שליפת ה-PO — ידרש לוודא שהוא APPROVED+ ושיש בו את המספר הרשמי.
  const poQuery = await supabase
    .from("erp_purchase_orders")
    .select(
      [
        "id,po_number,official_po_number,status,total_amount_gross,currency,supplier_id",
        "supplier:erp_md_suppliers!supplier_id(name)",
        "company:erp_companies!company_id(name_he,name_en)",
      ].join(","),
    )
    .eq("company_id", activeCompanyId)
    .eq("id", id)
    .maybeSingle()

  if (poQuery.error) {
    return NextResponse.json({ error: poQuery.error.message }, { status: 500 })
  }
  if (!poQuery.data) {
    return NextResponse.json(
      { error: "הזמנת רכש לא נמצאה" },
      { status: 404 },
    )
  }
  type PoRow = {
    id: string
    po_number: string
    official_po_number: string | null
    status: string
    total_amount_gross: number | string | null
    currency: string | null
    supplier_id: string
    supplier: { name: string } | { name: string }[] | null
    company:
      | { name_he: string; name_en: string | null }
      | { name_he: string; name_en: string | null }[]
      | null
  }
  const po = poQuery.data as PoRow

  if (!["APPROVED", "SENT_TO_SUPPLIER"].includes(po.status)) {
    return NextResponse.json(
      {
        error: `לא ניתן לשלוח PO במצב ${po.status}. נדרש APPROVED לפחות.`,
      },
      { status: 409 },
    )
  }
  if (!po.official_po_number) {
    return NextResponse.json(
      {
        error:
          "ל-PO אין מספר רשמי. אישור ראשי נדרש כדי להקצות מספר לפני שליחה.",
      },
      { status: 409 },
    )
  }

  // normalize joins
  const supplierRow = Array.isArray(po.supplier) ? po.supplier[0] : po.supplier
  const companyRow = Array.isArray(po.company) ? po.company[0] : po.company

  // 2) ניסיון שליחה (או mock fallback).
  const emailResult = await sendPoToSupplierEmail({
    recipientEmail,
    officialPoNumber: po.official_po_number,
    companyNameHe: companyRow?.name_he ?? activeCompanyId,
    companyNameEn: companyRow?.name_en ?? "",
    supplierName: supplierRow?.name ?? "Supplier",
    totalAmountGross: Number(po.total_amount_gross ?? 0),
    currency: po.currency ?? "ILS",
    note: note ?? null,
    senderName: null,
    pdfBase64,
  })

  // 3) רישום ל-audit log — גם כשהשליחה נכשלה. אודיט = מקור האמת.
  const logInsert = await supabase
    .from("erp_po_sent_log")
    .insert({
      company_id: activeCompanyId,
      purchase_order_id: po.id,
      sent_by: userId ?? null,
      recipient_email: recipientEmail,
      note: note?.trim() ? note.trim() : null,
      delivery_status: emailResult.delivery,
      provider_message: emailResult.providerMessage,
    })
    .select("id")
    .single()

  if (logInsert.error) {
    return NextResponse.json(
      {
        error: `שליחה הצליחה (${emailResult.delivery}) אך רישום האודיט נכשל: ${logInsert.error.message}`,
      },
      { status: 500 },
    )
  }

  // 4) מעבר סטטוס — רק אם זו הפעם הראשונה שהפעולה מוצלחת.
  let newStatus = po.status
  const shouldTransition =
    po.status === "APPROVED" && emailResult.delivery !== "FAILED"

  if (shouldTransition) {
    const statusUpdate = await supabase
      .from("erp_purchase_orders")
      .update({
        status: "SENT_TO_SUPPLIER",
        issued_at:
          po.status === "APPROVED" ? new Date().toISOString() : undefined,
      })
      .eq("company_id", activeCompanyId)
      .eq("id", po.id)
      .select("status")
      .single()

    if (statusUpdate.error) {
      // רישום בוצע, המייל יצא — פשוט לא נעבור סטטוס. UI יראה את ההודעה.
      return NextResponse.json(
        {
          error: `שליחה ואודיט הצליחו, אך עדכון הסטטוס נכשל: ${statusUpdate.error.message}`,
        },
        { status: 500 },
      )
    }
    newStatus = statusUpdate.data?.status ?? "SENT_TO_SUPPLIER"
  }

  if (emailResult.delivery === "FAILED") {
    return NextResponse.json(
      {
        error: `שליחת המייל נכשלה: ${emailResult.providerMessage ?? "שגיאה לא ידועה"}. פעולה נרשמה באודיט.`,
        data: {
          logId: logInsert.data.id,
          delivery: emailResult.delivery,
          providerMessage: emailResult.providerMessage,
          newStatus,
        },
      },
      { status: 502 },
    )
  }

  return NextResponse.json({
    data: {
      logId: logInsert.data.id,
      delivery: emailResult.delivery,
      providerMessage: emailResult.providerMessage,
      newStatus,
    },
  })
}
