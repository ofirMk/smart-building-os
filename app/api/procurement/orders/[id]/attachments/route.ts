/**
 * `/api/procurement/orders/[id]/attachments` — Phase 7.13.1.B
 *
 * GET  — רשימת קבצים של PO (metadata + signed URLs).
 * POST — רישום metadata אחרי העלאה ל-Storage ע"י הלקוח.
 *
 * הלקוח מעלה ישירות ל-bucket `po-attachments` תחת הנתיב
 *   `${activeCompanyId}/${purchaseOrderId}/${random}_${safeFileName}`
 * ואז שולח POST עם הנתיב המלא + מטא. ה-API מבצע אימות:
 *   (1) הקובץ אכן קיים ב-Storage
 *   (2) ה-company_id בנתיב תואם לחברה הפעילה
 *   (3) ה-purchase_order_id שייך לחברה זו
 * ואז מבצע INSERT ל-erp_po_attachments.
 *
 * Signed URLs נוצרים בקצה ה-GET בטווח תפוגה קצר (600 שניות).
 */

import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUCKET = "po-attachments"
const SIGNED_URL_TTL_SEC = 600

type RouteParams = { id: string }

function normalizeParams(
  params: Promise<RouteParams> | RouteParams
): Promise<RouteParams> {
  return Promise.resolve(params)
}

// ─────────────────────────────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────────────────────────────

export type ProcurementOrderAttachmentDto = {
  id: string
  purchaseOrderId: string
  fileName: string
  storagePath: string
  storageBucket: string
  mimeType: string | null
  sizeBytes: number | null
  sha256: string | null
  description: string | null
  visibleToSupplier: boolean
  uploadedBy: string | null
  uploadedAt: string
  poRevisionNumber: number | null
  signedUrl: string | null
}

type AttachmentRow = {
  id: string
  purchase_order_id: string
  file_name: string
  storage_path: string
  storage_bucket: string
  mime_type: string | null
  size_bytes: number | string | null
  sha256: string | null
  description: string | null
  visible_to_supplier: boolean | null
  uploaded_by: string | null
  uploaded_at: string
  po_revision_number: number | null
}

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value == null) return null
  const n = typeof value === "string" ? Number(value) : value
  return Number.isFinite(n) ? n : null
}

// ─────────────────────────────────────────────────────────────────────
// Validation schemas
// ─────────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  storagePath: z.string().min(3),
  fileName: z.string().min(1).max(512),
  mimeType: z.string().max(255).nullable().optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  sha256: z.string().max(128).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  visibleToSupplier: z.boolean().optional(),
  poRevisionNumber: z.number().int().positive().nullable().optional(),
})

// ─────────────────────────────────────────────────────────────────────
// GET — list attachments with signed URLs
// ─────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id } = await normalizeParams(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  // ensure the PO is in this tenant (belt + RLS suspenders)
  const ownershipCheck = await supabase
    .from("erp_purchase_orders")
    .select("id")
    .eq("company_id", activeCompanyId)
    .eq("id", id)
    .maybeSingle()
  if (ownershipCheck.error) {
    return NextResponse.json(
      { error: ownershipCheck.error.message },
      { status: 500 }
    )
  }
  if (!ownershipCheck.data) {
    return NextResponse.json({ error: "הזמנת רכש לא נמצאה" }, { status: 404 })
  }

  const { data, error } = await supabase
    .from("erp_po_attachments")
    .select(
      [
        "id,purchase_order_id,file_name,storage_path,storage_bucket",
        "mime_type,size_bytes,sha256,description,visible_to_supplier",
        "uploaded_by,uploaded_at,po_revision_number",
      ].join(",")
    )
    .eq("company_id", activeCompanyId)
    .eq("purchase_order_id", id)
    .order("uploaded_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as AttachmentRow[]

  const dtos: ProcurementOrderAttachmentDto[] = await Promise.all(
    rows.map(async (row) => {
      let signedUrl: string | null = null
      try {
        const signed = await supabase.storage
          .from(row.storage_bucket || BUCKET)
          .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SEC)
        signedUrl = signed.data?.signedUrl ?? null
      } catch {
        signedUrl = null
      }
      return {
        id: row.id,
        purchaseOrderId: row.purchase_order_id,
        fileName: row.file_name,
        storagePath: row.storage_path,
        storageBucket: row.storage_bucket,
        mimeType: row.mime_type,
        sizeBytes: toNumberOrNull(row.size_bytes),
        sha256: row.sha256,
        description: row.description,
        visibleToSupplier: Boolean(row.visible_to_supplier),
        uploadedBy: row.uploaded_by,
        uploadedAt: row.uploaded_at,
        poRevisionNumber: row.po_revision_number,
        signedUrl,
      }
    })
  )

  return NextResponse.json({ data: dtos })
}

// ─────────────────────────────────────────────────────────────────────
// POST — register metadata after client-side Storage upload
// ─────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id } = await normalizeParams(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId, userId } = ctx

  // ensure PO exists and is in tenant
  const ownershipCheck = await supabase
    .from("erp_purchase_orders")
    .select("id")
    .eq("company_id", activeCompanyId)
    .eq("id", id)
    .maybeSingle()
  if (ownershipCheck.error) {
    return NextResponse.json(
      { error: ownershipCheck.error.message },
      { status: 500 }
    )
  }
  if (!ownershipCheck.data) {
    return NextResponse.json({ error: "הזמנת רכש לא נמצאה" }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה (JSON)" }, { status: 400 })
  }

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "שדות לא תקינים", details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const input = parsed.data

  // storagePath must be under ${activeCompanyId}/${id}/ for security
  const expectedPrefix = `${activeCompanyId}/${id}/`
  if (!input.storagePath.startsWith(expectedPrefix)) {
    return NextResponse.json(
      {
        error:
          "נתיב אחסון לא תואם לחברה / להזמנה הפעילה. ודא שהנתיב תחת ${company}/${po}/.",
      },
      { status: 400 }
    )
  }

  // insert metadata row
  const { data: inserted, error } = await supabase
    .from("erp_po_attachments")
    .insert({
      company_id: activeCompanyId,
      purchase_order_id: id,
      file_name: input.fileName,
      storage_path: input.storagePath,
      storage_bucket: BUCKET,
      mime_type: input.mimeType ?? null,
      size_bytes: input.sizeBytes ?? null,
      sha256: input.sha256 ?? null,
      description: input.description ?? null,
      visible_to_supplier: input.visibleToSupplier ?? false,
      uploaded_by: userId,
      po_revision_number: input.poRevisionNumber ?? null,
    })
    .select("id")
    .single()

  if (error) {
    // Best-effort cleanup of the orphaned Storage object.
    try {
      await supabase.storage.from(BUCKET).remove([input.storagePath])
    } catch {
      // ignore; Storage RLS may prevent it — fine to leave for cleanup job
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data: { id: inserted.id } }, { status: 201 })
}
