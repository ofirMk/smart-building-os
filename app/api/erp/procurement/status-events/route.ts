import { type NextRequest, NextResponse } from "next/server"

import { mapStatusEventRow, requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const entityType = req.nextUrl.searchParams.get("entityType")?.trim()
  const entityId = req.nextUrl.searchParams.get("entityId")?.trim()
  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("erp_procurement_status_events")
    .select("*")
    .eq("company_id", activeCompanyId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: (data ?? []).map(mapStatusEventRow) })
}

