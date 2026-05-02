/**
 * `/api/finance/invoices/[id]/approve` — Phase 8.3 Step 2
 *
 * POST — אישור מנהל כספים לחשבונית. מעדכן status → 'APPROVED'.
 *
 * ## Behavior
 *   • הסטטוס המקורי חייב להיות `MATCHED` או `HAS_VARIANCES`. כל סטטוס אחר
 *     (`CANCELLED`, או חשבונית שעוד לא הורצה דרך 3-Way Match) → 409.
 *   • אם המשתמש מאשר HAS_VARIANCES, הוא בפועל מאשר במודע את החריגות.
 *     אופציונלי לצרף הערה (`approvalNote`) שתישמר ב-`notes` של ה-header
 *     מצורפת לקיים — זה איננו audit trail מלא, רק סימון למנהל הכספים הבא.
 *   • לא מבצע שום שינוי על ה-bridge (אין לכפול נתונים ב-RPC).
 *
 * ## Out of scope (Step 5 — AP)
 *   המעבר ל-`READY_FOR_PAYMENT` יתבצע רק לאחר רישום פקודות יומן (Phase 8.6).
 */

import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"
import type { ErpVendorInvoiceStatus } from "@/types/erp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string }

const bodySchema = z.object({
  approvalNote: z.string().trim().max(1000).optional().nullable(),
})

const APPROVABLE_FROM: ErpVendorInvoiceStatus[] = ["MATCHED", "HAS_VARIANCES"]

export type ApproveInvoiceResponse = {
  invoiceId: string
  previousStatus: ErpVendorInvoiceStatus
  newStatus: ErpVendorInvoiceStatus
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams },
) {
  const { id } = await Promise.resolve(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const json = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Body לא תקין" },
      { status: 400 },
    )
  }
  const note = parsed.data.approvalNote?.trim() || null

  const headerQ = await supabase
    .from("erp_vendor_invoices")
    .select("id,status,notes")
    .eq("company_id", activeCompanyId)
    .eq("id", id)
    .maybeSingle()

  if (headerQ.error) {
    return NextResponse.json({ error: headerQ.error.message }, { status: 500 })
  }
  if (!headerQ.data) {
    return NextResponse.json({ error: "חשבונית לא נמצאה" }, { status: 404 })
  }
  const header = headerQ.data as {
    id: string
    status: ErpVendorInvoiceStatus
    notes: string | null
  }

  if (header.status === "APPROVED" || header.status === "READY_FOR_PAYMENT") {
    return NextResponse.json(
      { error: `החשבונית כבר מאושרת (${header.status})` },
      { status: 409 },
    )
  }
  if (!APPROVABLE_FROM.includes(header.status)) {
    return NextResponse.json(
      {
        error: `לא ניתן לאשר חשבונית במצב ${header.status}. הרץ קודם 3-Way Match.`,
      },
      { status: 409 },
    )
  }

  // בניית ההערה החדשה (אופציונלי — חוץ מהסטטוס).
  let nextNotes = header.notes
  if (note) {
    const stamp = new Date().toISOString()
    const tag = `[אושר ${stamp}]`
    nextNotes = nextNotes ? `${nextNotes}\n${tag} ${note}` : `${tag} ${note}`
  }

  const updateQ = await supabase
    .from("erp_vendor_invoices")
    .update({ status: "APPROVED", notes: nextNotes })
    .eq("company_id", activeCompanyId)
    .eq("id", id)
    .select("id,status")
    .single()

  if (updateQ.error) {
    return NextResponse.json({ error: updateQ.error.message }, { status: 500 })
  }

  const out: ApproveInvoiceResponse = {
    invoiceId: header.id,
    previousStatus: header.status,
    newStatus: (updateQ.data as { status: ErpVendorInvoiceStatus }).status,
  }
  return NextResponse.json({ data: out })
}
