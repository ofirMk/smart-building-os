/**
 * GET /api/master-data/po-types
 *
 * מחזיר את רשימת סוגי הזמנת הרכש של החברה.
 * משמש כ-dropdown ב-po-general-tab.
 */
import { type NextRequest, NextResponse } from "next/server"

import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const ctx = await requireMasterDataApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx.ctx

  const { data, error } = await supabase
    .from("erp_md_po_types")
    .select("id,code,name_he,name_en,default_text_he,default_text_en,is_active")
    .eq("company_id", activeCompanyId)
    .eq("is_active", true)
    .order("code")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
