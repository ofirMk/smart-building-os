import { NextResponse, type NextRequest } from "next/server"

import { parseAndUpsertSupplierCatalog } from "@/lib/holden-erp/supplier-catalog-import"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_CSV_CHARS = 12 * 1024 * 1024

async function requireFinanceImportAccess(): Promise<
  { ok: true } | { ok: false; status: number; message: string }
> {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) {
    return { ok: false, status: 401, message: "Unauthorized" }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, marker_ofek_full_project_access")
    .eq("id", user.id)
    .maybeSingle()

  const role = profile?.role
  const fullAccess = profile?.marker_ofek_full_project_access === true
  if (role !== "admin" && !fullAccess) {
    return { ok: false, status: 403, message: "Forbidden" }
  }

  return { ok: true }
}

/**
 * ייבוא קטלוג מחירי ספק (CSV) → `erp_supplier_items` + `erp_supplier_price_lists`.
 *
 * JSON: `{ "supplierId": "uuid", "csv": "..." }`
 * או multipart: שדה `supplierId` + קובץ `file` (טקסט/CSV).
 */
export async function POST(req: NextRequest) {
  const gate = await requireFinanceImportAccess()
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.message }, { status: gate.status })
  }

  const contentType = req.headers.get("content-type") ?? ""
  let supplierId = ""
  let csvContent = ""

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData()
      supplierId = String(form.get("supplierId") ?? "").trim()
      const file = form.get("file")
      if (file instanceof File) {
        csvContent = await file.text()
      }
    } else {
      const body = (await req.json().catch(() => null)) as {
        supplierId?: string
        csv?: string
        csvContent?: string
      } | null
      supplierId = String(body?.supplierId ?? "").trim()
      csvContent = typeof body?.csv === "string" ? body.csv : String(body?.csvContent ?? "")
    }
  } catch {
    return NextResponse.json({ ok: false, error: "גוף הבקשה לא תקין" }, { status: 400 })
  }

  if (!supplierId) {
    return NextResponse.json({ ok: false, error: "חסר supplierId" }, { status: 400 })
  }
  if (!csvContent.trim()) {
    return NextResponse.json({ ok: false, error: "חסר תוכן CSV" }, { status: 400 })
  }
  if (csvContent.length > MAX_CSV_CHARS) {
    return NextResponse.json({ ok: false, error: "קובץ גדול מדי" }, { status: 413 })
  }

  const result = await parseAndUpsertSupplierCatalog(supplierId, csvContent)
  if (!result.ok) {
    return NextResponse.json(result, { status: 422 })
  }

  return NextResponse.json(result)
}
