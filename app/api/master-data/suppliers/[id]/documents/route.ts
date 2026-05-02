/**
 * `/api/master-data/suppliers/[id]/documents` — Phase 9.2
 *
 * GET — מחזיר את רשימת המסמכים המצורפים לספק (`erp_supplier_attachments`).
 *
 * זהו ה-data source של ה-tab "מסמכים" במסך Supplier Master/Detail
 * (Phase 9.1). מקביל לטאב "מסמכים לספק" ב-Priority (Batch #5, תמונה #23).
 *
 * MVP: read-only. POST/DELETE יבואו ב-Phase 9.4 כש-bucket
 * `supplier-attachments` ב-Storage יהיה מוכן.
 */

import { type NextRequest, NextResponse } from "next/server"
import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeParams(
  params: Promise<{ id: string }> | { id: string },
): Promise<{ id: string }> {
  return Promise.resolve(params)
}

export type SupplierDocumentDto = {
  id: string
  fileName: string
  documentType: string | null
  description: string | null
  mimeType: string | null
  sizeBytes: number | null
  storagePath: string
  storageBucket: string
  uploadedAt: string
  isLocked: boolean
}

type Row = {
  id: string
  file_name: string
  document_type: string | null
  description: string | null
  mime_type: string | null
  size_bytes: number | string | null
  storage_path: string
  storage_bucket: string
  uploaded_at: string
  is_locked: boolean
}

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
      "id,file_name,document_type,description,mime_type,size_bytes,storage_path,storage_bucket,uploaded_at,is_locked",
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
  const dto: SupplierDocumentDto[] = rows.map((r) => ({
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
  }))

  return NextResponse.json({ data: dto })
}
