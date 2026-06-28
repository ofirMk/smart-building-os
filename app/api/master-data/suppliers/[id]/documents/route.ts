/**
 * `/api/master-data/suppliers/[id]/documents` — Phase 9.2
 *
 * GET  — מחזיר רשימת מסמכים מצורפים לספק (`erp_supplier_attachments`)
 *        כולל **signed URL** קצר-מועד (TTL 600s) להורדה/תצוגה.
 *
 * POST — רישום metadata אחרי שהלקוח כבר העלה את הקובץ ל-Storage
 *        bucket `supplier-attachments` תחת הנתיב
 *        `${activeCompanyId}/${supplierId}/${random}_${safeFileName}`.
 *
 *        השרת מאמת:
 *          (1) ה-supplier_id שייך לחברה הפעילה (belt-and-suspenders ל-RLS).
 *          (2) `storagePath` מתחיל ב-`${activeCompanyId}/${supplierId}/`
 *              — מונע cross-tenant ו-cross-supplier leakage גם אם RLS
 *              של Storage נפרץ.
 *
 * הזרימה (parallel ל-PO attachments — Phase 7.13.1.B):
 *   1. הלקוח: upload ל-Storage (RLS = `user_has_company_access(prefix)`).
 *   2. הלקוח: POST למטא-דאטה.
 *   3. אם POST נכשל — הלקוח עושה rollback של ה-Storage object.
 *
 * המחיקה ב-`./[documentId]/route.ts`.
 */

import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUCKET = "supplier-attachments"
const SIGNED_URL_TTL_SEC = 600

// השארת רשימת ה-types ב-source code (כפול ב-migration) כדי לתפוס
// קלט ערכים לא חוקיים כבר ב-API ולא ב-Postgres CHECK.
const DOCUMENT_TYPES = [
  "SERVICE_CONTRACT",
  "TECH_SPEC",
  "PRICE_QUOTE",
  "WITHHOLDING_TAX_CERT",
  "BOOKKEEPING_CERT",
  "INSURANCE_CERT",
  "BUSINESS_LICENSE",
  "BANK_DETAILS",
  "OTHER",
] as const
type SupplierDocumentType = (typeof DOCUMENT_TYPES)[number]

function normalizeParams(
  params: Promise<{ id: string }> | { id: string },
): Promise<{ id: string }> {
  return Promise.resolve(params)
}

// ─────────────────────────────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────────────────────────────

export type SupplierDocumentDto = {
  id: string
  fileName: string
  documentType: SupplierDocumentType | null
  description: string | null
  mimeType: string | null
  sizeBytes: number | null
  storagePath: string
  storageBucket: string
  uploadedAt: string
  isLocked: boolean
  isFlagged: boolean
  signedUrl: string | null
}

type Row = {
  id: string
  file_name: string
  document_type: SupplierDocumentType | null
  description: string | null
  mime_type: string | null
  size_bytes: number | string | null
  storage_path: string
  storage_bucket: string
  uploaded_at: string
  is_locked: boolean
  is_flagged: boolean
}

// ─────────────────────────────────────────────────────────────────────
// Validation (POST)
// ─────────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  storagePath: z.string().min(3),
  fileName: z.string().min(1).max(512),
  mimeType: z.string().max(255).nullable().optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  sha256: z.string().max(128).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  documentType: z.enum(DOCUMENT_TYPES).nullable().optional(),
})

// ─────────────────────────────────────────────────────────────────────
// GET — list with signed URLs
// ─────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  const { id: supplierId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const { data, error } = await supabase
    .from("erp_supplier_attachments")
    .select(
      "id,file_name,document_type,description,mime_type,size_bytes,storage_path,storage_bucket,uploaded_at,is_locked,is_flagged",
    )
    .eq("company_id", activeCompanyId)
    .eq("supplier_id", supplierId)
    .order("uploaded_at", { ascending: false })

  if (error) {
    // טבלה עוד לא קיימת בסביבה? נחזיר רשימה ריקה במקום 500. ברגע שהמיגרציה
    // תרוץ בסביבה — נתוני אמת יופיעו אוטומטית.
    if (
      error.message?.toLowerCase().includes("does not exist") ||
      error.code === "42P01"
    ) {
      return NextResponse.json({ data: [] satisfies SupplierDocumentDto[] })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as Row[]

  const dto: SupplierDocumentDto[] = await Promise.all(
    rows.map(async (r) => {
      let signedUrl: string | null = null
      try {
        const signed = await supabase.storage
          .from(r.storage_bucket || BUCKET)
          .createSignedUrl(r.storage_path, SIGNED_URL_TTL_SEC)
        signedUrl = signed.data?.signedUrl ?? null
      } catch {
        signedUrl = null
      }
      return {
        id: r.id,
        fileName: r.file_name,
        documentType: r.document_type,
        description: r.description,
        mimeType: r.mime_type,
        sizeBytes: r.size_bytes != null ? Number(r.size_bytes) : null,
        storagePath: r.storage_path,
        storageBucket: r.storage_bucket,
        uploadedAt: r.uploaded_at,
        isLocked: r.is_locked,
        isFlagged: r.is_flagged ?? false,
        signedUrl,
      }
    }),
  )

  return NextResponse.json({ data: dto })
}

// ─────────────────────────────────────────────────────────────────────
// POST — register metadata after client-side Storage upload
// ─────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  const { id: supplierId } = await normalizeParams(params)

  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId, userId } = gate.ctx

  // ensure supplier exists in this tenant (belt + RLS suspenders)
  const ownership = await supabase
    .from("erp_md_suppliers")
    .select("id")
    .eq("company_id", activeCompanyId)
    .eq("id", supplierId)
    .maybeSingle()
  if (ownership.error) {
    return NextResponse.json(
      { error: ownership.error.message },
      { status: 500 },
    )
  }
  if (!ownership.data) {
    return NextResponse.json({ error: "ספק לא נמצא" }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: "בקשה לא תקינה (JSON)" },
      { status: 400 },
    )
  }

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "שדות לא תקינים", details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const input = parsed.data

  // הנתיב חייב להיות תחת ${activeCompanyId}/${supplierId}/ — אכיפה כפולה
  // של RLS Storage. זה הקו ההגנה האחרון מפני cross-tenant leakage.
  const expectedPrefix = `${activeCompanyId}/${supplierId}/`
  if (!input.storagePath.startsWith(expectedPrefix)) {
    return NextResponse.json(
      {
        error:
          "נתיב אחסון לא תואם לחברה / לספק הפעיל. ודא שהנתיב תחת ${company}/${supplier}/.",
      },
      { status: 400 },
    )
  }

  const { data: inserted, error } = await supabase
    .from("erp_supplier_attachments")
    .insert({
      company_id: activeCompanyId,
      supplier_id: supplierId,
      file_name: input.fileName,
      storage_path: input.storagePath,
      storage_bucket: BUCKET,
      mime_type: input.mimeType ?? null,
      size_bytes: input.sizeBytes ?? null,
      sha256: input.sha256 ?? null,
      description: input.description ?? null,
      document_type: input.documentType ?? null,
      uploaded_by: userId,
    })
    .select("id")
    .single()

  if (error) {
    // best-effort cleanup של ה-orphan ב-Storage. אם RLS Storage חוסם —
    // לא קריטי, יש לנו janitor מתוכנן ל-Phase עתיד.
    try {
      await supabase.storage.from(BUCKET).remove([input.storagePath])
    } catch {
      // ignore
    }
    // 23505 = unique_violation — קרוב לוודאי dedup על sha256.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "מסמך זה כבר קיים אצל הספק (כפילות לפי sha256)" },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data: { id: inserted.id } }, { status: 201 })
}
