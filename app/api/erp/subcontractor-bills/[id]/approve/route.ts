import { type NextRequest, NextResponse } from "next/server"

import { normalizeRouteParams, requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeRouteParams(params)
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const billLookup = await supabase
    .from("erp_subcontractor_bills")
    .select("id, project_id, supplier_id, status")
    .eq("id", id)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (billLookup.error) {
    return NextResponse.json({ error: billLookup.error.message }, { status: 500 })
  }
  if (!billLookup.data) {
    return NextResponse.json({ error: "Subcontractor bill not found" }, { status: 404 })
  }

  const poRows = await supabase
    .from("erp_purchase_orders")
    .select("id, po_number, status")
    .eq("company_id", activeCompanyId)
    .eq("project_id", billLookup.data.project_id)
    .neq("status", "CANCELLED")
  if (poRows.error) {
    return NextResponse.json({ error: poRows.error.message }, { status: 500 })
  }

  const poById = new Map<string, string>()
  for (const po of poRows.data ?? []) {
    poById.set(String(po.id), String((po as { po_number?: string }).po_number ?? ""))
  }
  const poIds = [...poById.keys()]

  if (poIds.length > 0) {
    const unoffsetRows = await supabase
      .from("erp_purchase_order_lines")
      .select("purchase_order_id")
      .eq("company_id", activeCompanyId)
      .eq("project_id", billLookup.data.project_id)
      .eq("subcontractor_id", billLookup.data.supplier_id)
      .eq("is_offset", false)
      .in("purchase_order_id", poIds)

    if (unoffsetRows.error) {
      return NextResponse.json({ error: unoffsetRows.error.message }, { status: 500 })
    }

    if ((unoffsetRows.data ?? []).length > 0) {
      const poNumbers = Array.from(
        new Set(
          (unoffsetRows.data ?? [])
            .map((row: { purchase_order_id?: string }) =>
              poById.get(String(row.purchase_order_id ?? "")) ?? null
            )
            .filter((n: string | null): n is string => Boolean(n))
        )
      )
      return NextResponse.json(
        {
          error: "לא ניתן לאשר חשבון קבלן משנה לפני קיזוז שורות הרכש",
          code: "OFFSET_GUARD_BLOCKED",
          data: { unoffsetPoNumbers: poNumbers },
        },
        { status: 409 }
      )
    }
  }

  const updated = await supabase
    .from("erp_subcontractor_bills")
    .update({ status: "APPROVED" })
    .eq("id", id)
    .eq("company_id", activeCompanyId)
    .select("id, status")
    .maybeSingle()
  if (updated.error) {
    return NextResponse.json({ error: updated.error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      id: updated.data?.id ?? id,
      status: updated.data?.status ?? "APPROVED",
    },
  })
}
