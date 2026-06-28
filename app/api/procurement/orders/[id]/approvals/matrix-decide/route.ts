/**
 * POST /api/procurement/orders/[id]/approvals/matrix-decide
 *
 * Phase 14 — Record an approval decision on the current level of the
 * active matrix approval instance for a PO.
 *
 * Body: {
 *   decision: "APPROVED" | "REJECTED" | "DELEGATED"
 *   comment?: string
 *   delegated_to_user_id?: string  (required when decision = "DELEGATED")
 * }
 *
 * On final APPROVED:
 *   - instance.status = APPROVED
 *   - PO transitions → APPROVED via erp_decide_approval (or direct update)
 *
 * On REJECTED:
 *   - instance.status = REJECTED
 *   - PO transitions → REJECTED
 */

import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"
import { getInstanceStatus, recordDecision } from "@/lib/procurement/approval-matrix-engine"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string }

const bodySchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "DELEGATED"]),
  comment: z.string().max(1000).optional(),
  delegated_to_user_id: z.string().uuid().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id: poId } = await Promise.resolve(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId, userId } = ctx

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { decision, comment, delegated_to_user_id } = parsed.data

  // Find active instance
  const instance = await getInstanceStatus(supabase, activeCompanyId, poId)
  if (!instance || instance.status !== "PENDING") {
    return NextResponse.json(
      { error: "INSTANCE_NOT_FOUND", message: "לא נמצא תהליך אישור פעיל לזמנה זו" },
      { status: 404 }
    )
  }

  // Record decision
  const result = await recordDecision(
    supabase,
    activeCompanyId,
    instance.id,
    userId,
    decision,
    comment ?? null,
    delegated_to_user_id ?? null
  )

  if (!result.ok) {
    const isClient = result.error.includes("SoD") || result.error.includes("אינו רשאי") || result.error.includes("נדרש")
    return NextResponse.json({ error: result.error }, { status: isClient ? 422 : 500 })
  }

  // Propagate final status to PO
  if (result.instanceStatus === "APPROVED") {
    await supabase
      .from("erp_purchase_orders")
      .update({ status: "APPROVED" })
      .eq("id", poId)
      .eq("company_id", activeCompanyId)
  } else if (result.instanceStatus === "REJECTED") {
    await supabase
      .from("erp_purchase_orders")
      .update({ status: "REJECTED" })
      .eq("id", poId)
      .eq("company_id", activeCompanyId)
  }

  return NextResponse.json({
    data: {
      instanceStatus: result.instanceStatus,
      advanced: result.advanced,
    },
  })
}
