/**
 * `/api/procurement/orders/[id]/attachments/[attachmentId]` — Phase 7.13.1.B
 *
 * DELETE — מחיקת קובץ: metadata + object מה-Storage, בתוך transaction רעיוני
 * (best-effort: מוחקים קודם את ה-metadata; אם הצליח, מסירים את ה-object).
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string; attachmentId: string }

function normalizeParams(
  params: Promise<RouteParams> | RouteParams
): Promise<RouteParams> {
  return Promise.resolve(params)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id, attachmentId } = await normalizeParams(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  // fetch first to get storage path
  const { data: row, error: fetchError } = await supabase
    .from("erp_po_attachments")
    .select("id, storage_path, storage_bucket")
    .eq("company_id", activeCompanyId)
    .eq("purchase_order_id", id)
    .eq("id", attachmentId)
    .maybeSingle()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }
  if (!row) {
    return NextResponse.json({ error: "קובץ לא נמצא" }, { status: 404 })
  }

  const { error: deleteError } = await supabase
    .from("erp_po_attachments")
    .delete()
    .eq("company_id", activeCompanyId)
    .eq("purchase_order_id", id)
    .eq("id", attachmentId)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 })
  }

  // best-effort storage removal
  try {
    await supabase.storage
      .from(row.storage_bucket || "po-attachments")
      .remove([row.storage_path])
  } catch {
    // ignore — metadata row is gone; object can be cleaned by janitor
  }

  return NextResponse.json({ ok: true })
}
