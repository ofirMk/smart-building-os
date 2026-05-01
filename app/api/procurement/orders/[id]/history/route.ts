/**
 * `/api/procurement/orders/[id]/history` — Phase 7.13.1.D
 *
 * GET — מחזיר את ה-audit trail המלא של PO:
 *   • changeLog — שורות מ-`erp_po_change_log` (field-level diff)
 *   • revisions — מ-`erp_po_revisions` (metadata בלבד, ללא ה-snapshots
 *                  הכבדים — ה-UI טוען snapshot מלא ב-endpoint נפרד)
 *
 * POST — יוצר revision ידני (reason=MANUAL) ע"י `erp_create_po_revision_snapshot`.
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string }

function normalizeParams(
  params: Promise<RouteParams> | RouteParams
): Promise<RouteParams> {
  return Promise.resolve(params)
}

// ─────────────────────────────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────────────────────────────

export type PoChangeLogEntryDto = {
  id: string
  entityType: "HEADER" | "LINE" | "APPROVAL" | "ATTACHMENT"
  entityId: string | null
  operation: "INSERT" | "UPDATE" | "DELETE"
  fieldName: string | null
  oldValue: string | null
  newValue: string | null
  changedBy: string | null
  changedByName: string | null
  changedAt: string
  source: string | null
  reason: string | null
}

export type PoRevisionMetadataDto = {
  id: string
  revisionNumber: number
  reason: string | null
  createdBy: string | null
  createdByName: string | null
  createdAt: string
}

export type PoHistoryResponseDto = {
  poId: string
  changeLog: PoChangeLogEntryDto[]
  revisions: PoRevisionMetadataDto[]
}

// ─────────────────────────────────────────────────────────────────────
// Row shapes
// ─────────────────────────────────────────────────────────────────────

type ChangeLogRow = {
  id: string
  entity_type: string
  entity_id: string | null
  operation: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  changed_by: string | null
  changed_at: string
  source: string | null
  reason: string | null
}

type RevisionRow = {
  id: string
  revision_number: number
  reason: string | null
  created_by: string | null
  created_at: string
}

type ProfileRow = { id: string; full_name: string | null }

// ─────────────────────────────────────────────────────────────────────
// GET — list change log + revisions
// ─────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id } = await normalizeParams(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  // ownership check
  const ownership = await supabase
    .from("erp_purchase_orders")
    .select("id")
    .eq("company_id", activeCompanyId)
    .eq("id", id)
    .maybeSingle()
  if (ownership.error) {
    return NextResponse.json({ error: ownership.error.message }, { status: 500 })
  }
  if (!ownership.data) {
    return NextResponse.json({ error: "הזמנת רכש לא נמצאה" }, { status: 404 })
  }

  // change log + revisions in parallel
  const [changeQuery, revQuery] = await Promise.all([
    supabase
      .from("erp_po_change_log")
      .select(
        "id,entity_type,entity_id,operation,field_name,old_value,new_value,changed_by,changed_at,source,reason"
      )
      .eq("company_id", activeCompanyId)
      .eq("purchase_order_id", id)
      .order("changed_at", { ascending: false })
      .limit(500),
    supabase
      .from("erp_po_revisions")
      .select("id,revision_number,reason,created_by,created_at")
      .eq("company_id", activeCompanyId)
      .eq("purchase_order_id", id)
      .order("revision_number", { ascending: false }),
  ])

  if (changeQuery.error) {
    return NextResponse.json({ error: changeQuery.error.message }, { status: 500 })
  }
  if (revQuery.error) {
    return NextResponse.json({ error: revQuery.error.message }, { status: 500 })
  }

  const changeRows = (changeQuery.data ?? []) as ChangeLogRow[]
  const revRows = (revQuery.data ?? []) as RevisionRow[]

  // collect distinct user ids for name resolution
  const userIds = new Set<string>()
  for (const r of changeRows) if (r.changed_by) userIds.add(r.changed_by)
  for (const r of revRows) if (r.created_by) userIds.add(r.created_by)

  let profileMap = new Map<string, string>()
  if (userIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,full_name")
      .in("id", Array.from(userIds))
    if (profiles) {
      profileMap = new Map(
        (profiles as ProfileRow[]).map((p) => [p.id, p.full_name ?? ""])
      )
    }
  }

  const changeLog: PoChangeLogEntryDto[] = changeRows.map((row) => ({
    id: row.id,
    entityType: row.entity_type as PoChangeLogEntryDto["entityType"],
    entityId: row.entity_id,
    operation: row.operation as PoChangeLogEntryDto["operation"],
    fieldName: row.field_name,
    oldValue: row.old_value,
    newValue: row.new_value,
    changedBy: row.changed_by,
    changedByName: row.changed_by ? profileMap.get(row.changed_by) ?? null : null,
    changedAt: row.changed_at,
    source: row.source,
    reason: row.reason,
  }))

  const revisions: PoRevisionMetadataDto[] = revRows.map((row) => ({
    id: row.id,
    revisionNumber: row.revision_number,
    reason: row.reason,
    createdBy: row.created_by,
    createdByName: row.created_by ? profileMap.get(row.created_by) ?? null : null,
    createdAt: row.created_at,
  }))

  const dto: PoHistoryResponseDto = {
    poId: id,
    changeLog,
    revisions,
  }

  return NextResponse.json({ data: dto })
}

// ─────────────────────────────────────────────────────────────────────
// POST — create manual revision snapshot
// ─────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id } = await normalizeParams(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  // ownership check
  const ownership = await supabase
    .from("erp_purchase_orders")
    .select("id")
    .eq("company_id", activeCompanyId)
    .eq("id", id)
    .maybeSingle()
  if (ownership.error) {
    return NextResponse.json({ error: ownership.error.message }, { status: 500 })
  }
  if (!ownership.data) {
    return NextResponse.json({ error: "הזמנת רכש לא נמצאה" }, { status: 404 })
  }

  const { data, error } = await supabase.rpc("erp_create_po_revision_snapshot", {
    p_po_id: id,
    p_reason: "MANUAL",
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data: { revisionId: data } }, { status: 201 })
}
