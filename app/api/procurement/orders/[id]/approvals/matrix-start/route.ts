/**
 * POST /api/procurement/orders/[id]/approvals/matrix-start
 *
 * Phase 14 — Initiate a dynamic matrix-based approval flow for a PO.
 *
 * Flow:
 *   1. Load PO context (amount, urgency, supplier, project, type code)
 *   2. Evaluate erp_approval_matrix_rules → first matching rule
 *   3. Create / replace erp_po_approval_instances record
 *   4. Trigger PO status → PENDING_APPROVAL via existing po-transition RPC
 *
 * Guards:
 *   - PO must be in DRAFT or REJECTED state
 *   - PO must have at least one line
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"
import {
  resolveRule,
  startInstance,
  type PoContext,
} from "@/lib/procurement/approval-matrix-engine"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id: poId } = await Promise.resolve(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId, userId } = ctx

  // 1. Load PO
  const poQ = await supabase
    .from("erp_purchase_orders")
    .select(
      "id, status, total_amount_gross, urgency_level, supplier_id, project_id, created_by, " +
        "erp_md_po_types!left(code), " +
        "erp_purchase_order_lines!left(id)"
    )
    .eq("id", poId)
    .eq("company_id", activeCompanyId)
    .single()

  if (poQ.error) {
    return NextResponse.json({ error: "הזמנת רכש לא נמצאה" }, { status: 404 })
  }

  const poRaw = poQ.data as {
    id: string
    status: string
    total_amount_gross: number | null
    urgency_level: string | null
    supplier_id: string | null
    project_id: string | null
    created_by: string | null
    erp_md_po_types: { code: string } | { code: string }[] | null
    erp_purchase_order_lines: { id: string }[]
  }

  if (!["DRAFT", "REJECTED"].includes(poRaw.status)) {
    return NextResponse.json(
      { error: "STATUS_INVALID", message: `לא ניתן להגיש הזמנה בסטטוס ${poRaw.status} לאישור` },
      { status: 409 }
    )
  }

  if (!poRaw.erp_purchase_order_lines?.length) {
    return NextResponse.json(
      { error: "PO_NO_LINES", message: "לא ניתן להגיש הזמנה ללא שורות" },
      { status: 422 }
    )
  }

  const poTypeCode = Array.isArray(poRaw.erp_md_po_types)
    ? poRaw.erp_md_po_types[0]?.code ?? null
    : (poRaw.erp_md_po_types as { code: string } | null)?.code ?? null

  const po: PoContext = {
    id: poRaw.id,
    company_id: activeCompanyId,
    total_amount_gross: poRaw.total_amount_gross ?? 0,
    urgency_level: poRaw.urgency_level,
    supplier_id: poRaw.supplier_id,
    project_id: poRaw.project_id,
    po_type_code: poTypeCode,
    budget_sub_chapter: null,
    created_by: poRaw.created_by,
  }

  // 2. Resolve matching rule
  const rule = await resolveRule(supabase, activeCompanyId, po)
  if (!rule) {
    return NextResponse.json(
      { error: "NO_MATRIX_RULE", message: "לא נמצא כלל אישור מתאים — יש להגדיר כלל ברירת מחדל" },
      { status: 422 }
    )
  }

  // 3. Create instance
  const instanceResult = await startInstance(supabase, activeCompanyId, po, rule, userId)
  if (!instanceResult.ok) {
    return NextResponse.json({ error: instanceResult.error }, { status: 500 })
  }

  // 4. Advance PO status → PENDING_APPROVAL
  const transitionResult = await supabase.rpc("erp_submit_po_for_approval", {
    p_po_id: poId,
  })

  if (transitionResult.error) {
    // If status already PENDING_APPROVAL (re-submission after delegation) — non-fatal
    if (!transitionResult.error.message.includes("PENDING_APPROVAL")) {
      return NextResponse.json({ error: transitionResult.error.message }, { status: 400 })
    }
  }

  return NextResponse.json({
    data: {
      instanceId: instanceResult.instanceId,
      matchedRule: { id: rule.id, rule_name: rule.rule_name, total_levels: rule.approval_levels_json.length },
    },
  })
}
