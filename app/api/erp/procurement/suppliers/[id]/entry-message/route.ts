import { type NextRequest, NextResponse } from "next/server"

import { normalizeRouteParams, requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeRouteParams(params)
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const result = await supabase.rpc("erp_supplier_message_on_entry", {
    p_company_id: activeCompanyId,
    p_supplier_id: id,
  })
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })

  return NextResponse.json({ data: result.data ?? null })
}

