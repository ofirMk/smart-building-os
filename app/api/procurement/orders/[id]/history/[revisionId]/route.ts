/**
 * `/api/procurement/orders/[id]/history/[revisionId]` — Phase 7.13.1.D
 *
 * GET — מחזיר snapshot מלא של revision (header + lines + approvals).
 * משמש את ה-modal "צפה ב-revision" ב-PoHistoryTab. נטען בעצלתיים
 * (lazy) רק כאשר המשתמש בוחר revision לצפייה.
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string; revisionId: string }

function normalizeParams(
  params: Promise<RouteParams> | RouteParams
): Promise<RouteParams> {
  return Promise.resolve(params)
}

export type PoRevisionSnapshotDto = {
  id: string
  revisionNumber: number
  reason: string | null
  createdBy: string | null
  createdAt: string
  headerSnapshot: unknown
  linesSnapshot: unknown
  approvalsSnapshot: unknown
}

type RevisionRow = {
  id: string
  revision_number: number
  reason: string | null
  created_by: string | null
  created_at: string
  header_snapshot: unknown
  lines_snapshot: unknown
  approvals_snapshot: unknown
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id, revisionId } = await normalizeParams(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { data, error } = await supabase
    .from("erp_po_revisions")
    .select(
      "id,revision_number,reason,created_by,created_at,header_snapshot,lines_snapshot,approvals_snapshot"
    )
    .eq("company_id", activeCompanyId)
    .eq("purchase_order_id", id)
    .eq("id", revisionId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: "Revision לא נמצא" }, { status: 404 })
  }

  const row = data as RevisionRow

  const dto: PoRevisionSnapshotDto = {
    id: row.id,
    revisionNumber: row.revision_number,
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
    headerSnapshot: row.header_snapshot,
    linesSnapshot: row.lines_snapshot,
    approvalsSnapshot: row.approvals_snapshot,
  }

  return NextResponse.json({ data: dto })
}
