/**
 * `/api/procurement/orders/[id]/sent-log` — Phase 8.1.4
 *
 * GET — היסטוריית שליחות ה-PO לספק. מוחזר מסודר DESC כדי שהרשומה
 * האחרונה תופיע ראשונה; ה-UI מציג "נשלח לאחרונה ב-X" על בסיס החזרה הראשונה.
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string }

function normalizeParams(
  params: Promise<RouteParams> | RouteParams,
): Promise<RouteParams> {
  return Promise.resolve(params)
}

export type PoSentLogEntryDto = {
  id: string
  sentAt: string
  recipientEmail: string
  note: string | null
  deliveryStatus: "SUCCESS" | "MOCK" | "FAILED"
  providerMessage: string | null
  sentByUserId: string | null
}

type LogRow = {
  id: string
  sent_at: string
  recipient_email: string
  note: string | null
  delivery_status: string
  provider_message: string | null
  sent_by: string | null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams },
) {
  const { id } = await normalizeParams(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { data, error } = await supabase
    .from("erp_po_sent_log")
    .select("id,sent_at,recipient_email,note,delivery_status,provider_message,sent_by")
    .eq("company_id", activeCompanyId)
    .eq("purchase_order_id", id)
    .order("sent_at", { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const dto: PoSentLogEntryDto[] = ((data ?? []) as LogRow[]).map((r) => ({
    id: r.id,
    sentAt: r.sent_at,
    recipientEmail: r.recipient_email,
    note: r.note,
    deliveryStatus:
      r.delivery_status === "SUCCESS" ||
      r.delivery_status === "MOCK" ||
      r.delivery_status === "FAILED"
        ? r.delivery_status
        : "SUCCESS",
    providerMessage: r.provider_message,
    sentByUserId: r.sent_by,
  }))

  return NextResponse.json({ data: dto })
}
