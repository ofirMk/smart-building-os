/**
 * `/api/master-data/suppliers/[id]/documents/[documentId]` — Phase 9.2
 *
 * DELETE — מסיר מסמך מצורף של ספק (metadata + storage object).
 *
 * Locked guard: אם `is_locked = true` (מסמך נעול עסקית — למשל אישור
 * ביטוח שעדיין בתוקף, חוזה שירות פעיל) — מחזיר 423 Locked. ניתן לשחרר
 * רק דרך UI ייעודי שעוד לא קיים (Phase 10+).
 *
 * זרימה (mirror של PO attachment delete — Phase 7.13.1.B):
 *   1. ודא שהמסמך שייך לחברה+ספק הפעילים.
 *   2. ודא שלא נעול.
 *   3. מחק metadata (RLS גם כן אוכף).
 *   4. best-effort מחיקה של ה-Storage object — אם נכשל נשאר janitor.
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const FALLBACK_BUCKET = "supplier-attachments"

type RouteParams = { id: string; documentId: string }

function normalizeParams(
  params: Promise<RouteParams> | RouteParams,
): Promise<RouteParams> {
  return Promise.resolve(params)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams },
) {
  const { id: supplierId, documentId } = await normalizeParams(params)

  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  // 1+2. fetch row to read storage path + locked flag
  const { data: row, error: fetchError } = await supabase
    .from("erp_supplier_attachments")
    .select("id, storage_path, storage_bucket, is_locked")
    .eq("company_id", activeCompanyId)
    .eq("supplier_id", supplierId)
    .eq("id", documentId)
    .maybeSingle()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }
  if (!row) {
    return NextResponse.json({ error: "מסמך לא נמצא" }, { status: 404 })
  }
  if (row.is_locked) {
    return NextResponse.json(
      {
        error:
          "המסמך נעול ולא ניתן למחיקה. שחרר את הנעילה לפני המחיקה (פעולה זו עדיין בפיתוח — Phase 10+).",
      },
      { status: 423 },
    )
  }

  // 3. delete metadata
  const { error: deleteError } = await supabase
    .from("erp_supplier_attachments")
    .delete()
    .eq("company_id", activeCompanyId)
    .eq("supplier_id", supplierId)
    .eq("id", documentId)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 })
  }

  // 4. best-effort storage removal — לא חוסם את ההצלחה אם נכשל.
  try {
    await supabase.storage
      .from(row.storage_bucket || FALLBACK_BUCKET)
      .remove([row.storage_path])
  } catch {
    // ignore — metadata row is gone; object can be cleaned later by janitor
  }

  return NextResponse.json({ data: { ok: true } })
}
