/**
 * POST /api/procurement/landed-costs/[id]/post
 *
 * Finalise a landed cost document:
 *   1. Validates allocations exist
 *   2. Calls erp_post_landed_costs RPC → updates item standard_cost
 *   3. Returns updated document status
 *
 * IRREVERSIBLE — status transitions DRAFT → POSTED.
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id } = await Promise.resolve(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  // Ownership + status check
  const docQ = await supabase
    .from("erp_landed_cost_documents")
    .select("id, status, total_amount")
    .eq("id", id)
    .eq("company_id", activeCompanyId)
    .single()

  if (docQ.error) {
    return NextResponse.json({ error: "מסמך עלויות נחיתה לא נמצא" }, { status: 404 })
  }

  const doc = docQ.data as { id: string; status: string; total_amount: number }

  if (doc.status !== "DRAFT") {
    return NextResponse.json(
      { error: "ALREADY_POSTED", message: `סטטוס מסמך: ${doc.status} — לא ניתן לרשום שנית` },
      { status: 409 }
    )
  }

  if (doc.total_amount <= 0) {
    return NextResponse.json(
      { error: "NO_AMOUNT", message: "לא ניתן לרשום מסמך ללא עלויות" },
      { status: 422 }
    )
  }

  // Ensure allocations have been computed
  const allocCountQ = await supabase
    .from("erp_landed_cost_allocations")
    .select("id", { count: "exact", head: true })
    .eq("company_id", activeCompanyId)
    .eq("document_id", id)

  if (!allocCountQ.count || allocCountQ.count === 0) {
    return NextResponse.json(
      { error: "NO_ALLOCATIONS", message: "יש לחשב הקצאות לפני הרישום" },
      { status: 422 }
    )
  }

  // Post
  const { error } = await supabase.rpc("erp_post_landed_costs", { p_document_id: id })

  if (error) {
    const status = error.code === "P0002" ? 404 : error.code === "22023" ? 409 : 500
    return NextResponse.json({ error: error.message }, { status })
  }

  return NextResponse.json({
    data: { id, status: "POSTED", postedAt: new Date().toISOString() },
  })
}
