/**
 * POST /api/procurement/orders/[id]/invoices/[invoiceId]/match
 *
 * מפעיל 3-Way Match עבור חשבונית ספציפית של ה-PO.
 * קורא ל-RPC `erp_perform_3way_match` דרך `performMatch()`.
 *
 * Tenant: מאומת דרך `requireProcurementApiContext` (RLS + company_id).
 * מאמת שה-invoice אכן שייכת ל-PO הנתון + לאותה חברה לפני ההרצה.
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"
import { performMatch } from "@/lib/procurement/three-way-match"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string; invoiceId: string }

function normalizeParams(
  params: Promise<RouteParams> | RouteParams,
): Promise<RouteParams> {
  return Promise.resolve(params)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams },
) {
  const { id: poId, invoiceId } = await normalizeParams(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  // ── אמת שהחשבונית שייכת ל-PO + חברה ──────────────────────────────────────
  const checkQ = await supabase
    .from("erp_vendor_invoices")
    .select("id")
    .eq("id", invoiceId)
    .eq("company_id", activeCompanyId)
    .eq("purchase_order_id", poId)
    .maybeSingle()

  if (checkQ.error) {
    return NextResponse.json({ error: checkQ.error.message }, { status: 500 })
  }
  if (!checkQ.data) {
    return NextResponse.json(
      { error: "חשבונית לא נמצאה עבור הזמנה זו" },
      { status: 404 },
    )
  }

  // ── הרץ 3-Way Match ────────────────────────────────────────────────────────
  const result = await performMatch(supabase, {
    companyId: activeCompanyId,
    invoiceId,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ ok: true, summary: result.summary })
}
