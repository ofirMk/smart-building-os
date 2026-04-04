import { NextResponse, type NextRequest } from "next/server"

import { createPurchaseOrderFromBoq } from "@/app/(dashboard)/marker-ofek/procurement/purchase-orders/new/actions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SubmitPayload = {
  projectId: string
  tenderId: string
  supplierEntityId: string
  lines: Array<{
    tenderBoqItemId: string
    description: string
    unit: string | null
    quantity: number
    unitPrice: number
    catalogItemId: string
  }>
}

export async function POST(req: NextRequest) {
  const payload = (await req.json().catch(() => null)) as SubmitPayload | null
  if (!payload) {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 })
  }
  const result = await createPurchaseOrderFromBoq(payload)
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 })
  }
  return NextResponse.json({
    ...result,
    approvalState: result.ceoApprovalRequired
      ? "pending_ceo_approval_and_dual_signature"
      : "approved",
  })
}
