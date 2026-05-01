/**
 * `/api/procurement/orders/[id]/approvals/[approvalId]/decide` — Phase 7.13.1.C
 *
 * POST — מקבל החלטת אישור (APPROVE | REJECT) על רשומת approval ספציפית.
 * עוטף את ה-RPC `erp_decide_approval`.
 *
 * Body:
 *   { decision: 'APPROVE' | 'REJECT', comment?: string }
 *
 * תוצאות:
 *   APPROVE — מעדכן ל-APPROVED ומקדם ל-level הבא (או PO ל-APPROVED אם זה היה האחרון).
 *   REJECT  — מעדכן ל-REJECTED, מבטל peers PENDING ומחזיר את ה-PO ל-DRAFT.
 */

import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string; approvalId: string }

function normalizeParams(
  params: Promise<RouteParams> | RouteParams
): Promise<RouteParams> {
  return Promise.resolve(params)
}

const bodySchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().max(2000).nullable().optional(),
})

type DecisionResultRow = {
  new_po_status: string
  next_level: number | string | null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id, approvalId } = await normalizeParams(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  // verify approval belongs to this PO + tenant
  const approvalCheck = await supabase
    .from("erp_po_approvals")
    .select("id, purchase_order_id, status")
    .eq("company_id", activeCompanyId)
    .eq("purchase_order_id", id)
    .eq("id", approvalId)
    .maybeSingle()
  if (approvalCheck.error) {
    return NextResponse.json(
      { error: approvalCheck.error.message },
      { status: 500 }
    )
  }
  if (!approvalCheck.data) {
    return NextResponse.json(
      { error: "רשומת אישור לא נמצאה" },
      { status: 404 }
    )
  }
  if (approvalCheck.data.status !== "PENDING") {
    return NextResponse.json(
      {
        error: `רשומת אישור כבר במצב ${approvalCheck.data.status}, לא ניתן להחליט שוב`,
      },
      { status: 409 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON לא תקין" }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "בקשה לא תקינה", details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { data, error } = await supabase.rpc("erp_decide_approval", {
    p_approval_id: approvalId,
    p_decision: parsed.data.decision,
    p_comment: parsed.data.comment ?? null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const rows = (data ?? []) as DecisionResultRow[]
  const result = rows[0]
  return NextResponse.json({
    data: {
      newPoStatus: result?.new_po_status ?? null,
      nextLevel: result?.next_level != null ? Number(result.next_level) : null,
    },
  })
}
