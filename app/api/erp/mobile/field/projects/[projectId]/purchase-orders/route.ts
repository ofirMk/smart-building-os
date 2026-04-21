import { type NextRequest, NextResponse } from "next/server"

import {
  assertMobileProjectAccess,
  requireMobileFieldApiContext,
} from "@/lib/erp/mobile-field-api"
import { normalizeRouteParams } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> | { projectId: string } }
) {
  const { projectId } = await normalizeRouteParams(params)
  const ctx = await requireMobileFieldApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId, userId, siteManagerOnly } = ctx

  const access = await assertMobileProjectAccess({
    supabase,
    activeCompanyId,
    projectId,
    userId,
    siteManagerOnly,
  })
  if (!access.ok) return access.response

  const search = req.nextUrl.searchParams.get("q")?.trim() ?? ""

  let query = supabase
    .from("erp_purchase_orders")
    .select(
      "id,po_number,title,status,issued_at,erp_purchase_order_lines(id,description,item_sku,quantity,unit_price,total_price)"
    )
    .eq("company_id", activeCompanyId)
    .eq("project_id", projectId)
    .neq("status", "CANCELLED")
    .order("created_at", { ascending: false })

  if (search.length > 0) {
    query = query.or(`po_number.ilike.%${search}%,title.ilike.%${search}%`)
  }

  const loaded = await query
  if (loaded.error) {
    return NextResponse.json({ error: loaded.error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: (loaded.data ?? []).map((po: any) => ({
      id: String(po.id),
      poNumber: String(po.po_number ?? ""),
      title: String(po.title ?? ""),
      status: String(po.status ?? "DRAFT"),
      issuedAt: (po.issued_at as string | null) ?? null,
      lines: (po.erp_purchase_order_lines ?? []).map((line: any) => ({
        id: String(line.id),
        description: String(line.description ?? ""),
        itemSku: line.item_sku ? String(line.item_sku) : null,
        quantity: Number(line.quantity ?? 0),
        unitPrice: Number(line.unit_price ?? 0),
        totalPrice: Number(line.total_price ?? 0),
      })),
    })),
  })
}
