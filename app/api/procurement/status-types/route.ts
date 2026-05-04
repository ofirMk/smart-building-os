/**
 * `/api/procurement/status-types` — Phase A
 *
 * GET — מחזיר את כל 13 סטטוסי ה-PO (10 Priority-aligned + 3 legacy) עם כל
 * ה-flags שה-UI צריך כדי להחליט מה להציג/לחסום (allow_changes, allows_gr,
 * is_closed, is_cancelled, is_post_approval, is_legacy_alias, lifecycle_stage).
 *
 * מקור אמת: public.erp_po_status_types_v (view מ-20260807100100).
 *
 * Query params:
 *   ?exclude_legacy=true  — מסתיר את ה-2 ערכי legacy (PENDING_PRICE_APPROVAL, SENT)
 *                           — שימושי ל-dropdowns של יצירת PO חדש.
 *   ?stage=<lifecycle>    — מסנן לפי lifecycle_stage (pre-approval/active/closed/cancelled/legacy)
 *
 * אין POST/PUT/DELETE — זהו read-only master data. עדכונים מבוצעים דרך
 * מיגרציות seed בלבד (governance-as-code).
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export type PoStatusTypeDto = {
  status: string
  nameHe: string
  nameEn: string
  color: string | null
  allowChanges: boolean
  allowsGr: boolean
  isApproved: boolean
  isClosed: boolean
  isCancelled: boolean
  isPostApproval: boolean
  isLegacyAlias: boolean
  lifecycleStage: "pre-approval" | "active" | "closed" | "cancelled" | "legacy"
}

type StatusTypeRow = {
  status: string
  name_he: string
  name_en: string
  color: string | null
  allow_changes: boolean
  allows_gr: boolean
  is_approved: boolean
  is_closed: boolean
  is_cancelled: boolean
  is_post_approval: boolean
  is_legacy_alias: boolean
  lifecycle_stage: string
}

export async function GET(req: NextRequest) {
  // RLS read-policy הוא `to authenticated using (true)` — לא תלוי ב-company
  // (זה master data גלובלי). עדיין מפעילים `requireProcurementApiContext`
  // כדי לאכוף שהמשתמש auth'ed ובעל active company.
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase } = ctx

  const excludeLegacy =
    req.nextUrl.searchParams.get("exclude_legacy")?.toLowerCase() === "true"
  const stage = req.nextUrl.searchParams.get("stage")?.trim() ?? null

  let query = supabase
    .from("erp_po_status_types_v")
    .select(
      "status,name_he,name_en,color,allow_changes,allows_gr,is_approved,is_closed,is_cancelled,is_post_approval,is_legacy_alias,lifecycle_stage"
    )

  if (excludeLegacy) query = query.eq("is_legacy_alias", false)
  if (stage) query = query.eq("lifecycle_stage", stage)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as StatusTypeRow[]
  const dto: PoStatusTypeDto[] = rows.map((r) => ({
    status: r.status,
    nameHe: r.name_he,
    nameEn: r.name_en,
    color: r.color,
    allowChanges: r.allow_changes,
    allowsGr: r.allows_gr,
    isApproved: r.is_approved,
    isClosed: r.is_closed,
    isCancelled: r.is_cancelled,
    isPostApproval: r.is_post_approval,
    isLegacyAlias: r.is_legacy_alias,
    lifecycleStage: r.lifecycle_stage as PoStatusTypeDto["lifecycleStage"],
  }))

  return NextResponse.json({ data: dto })
}
