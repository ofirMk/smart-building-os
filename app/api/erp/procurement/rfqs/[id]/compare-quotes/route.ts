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

  const { data, error } = await supabase
    .from("erp_rfq_quote_comparison_vw")
    .select("*")
    .eq("company_id", activeCompanyId)
    .eq("rfq_id", id)
    .order("rfq_line_description", { ascending: true })
    .order("price_rank", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

