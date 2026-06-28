/**
 * GET /api/procurement/suppliers/search
 *
 * P1 #8 — Lightweight supplier typeahead endpoint.
 * Returns minimal fields needed for a combobox: id, supplier_number, name, status.
 *
 * Query params:
 *   q     — text search (matches name or supplier_number), default ""
 *   limit — max results (default 20, max 50)
 *   kind  — filter by "supplier" | "subcontractor" | "all" (default "all")
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SupplierSearchRow = {
  id: string
  supplier_number: string
  name: string
  status: string | null
  supplier_kind: string
  qualification_status: string | null
}

export async function GET(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  const kind = req.nextUrl.searchParams.get("kind")?.trim() ?? "all"
  const limitParam = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10)))

  let query = supabase
    .from("erp_md_suppliers")
    .select("id, supplier_number, name, status, supplier_kind, qualification_status")
    .eq("company_id", activeCompanyId)
    .neq("status", "BLOCKED")
    .order("name", { ascending: true })
    .limit(limitParam)

  if (q.length >= 1) {
    query = query.or(`name.ilike.%${q}%,supplier_number.ilike.%${q}%`)
  }

  if (kind !== "all") {
    query = query.eq("supplier_kind", kind)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as SupplierSearchRow[]

  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      supplierNumber: r.supplier_number,
      name: r.name,
      status: r.status,
      kind: r.supplier_kind,
      qualificationStatus: r.qualification_status,
    })),
  })
}
