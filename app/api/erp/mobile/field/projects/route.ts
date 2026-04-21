import { type NextRequest, NextResponse } from "next/server"

import {
  requireMobileFieldApiContext,
} from "@/lib/erp/mobile-field-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const ctx = await requireMobileFieldApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId, userId, siteManagerOnly } = ctx

  let query = supabase
    .from("erp_proj_projects")
    .select("id, project_number, name, status, project_manager_id")
    .eq("company_id", activeCompanyId)
    .order("updated_at", { ascending: false })

  if (siteManagerOnly) {
    query = query.eq("project_manager_id", userId)
  }

  const loaded = await query
  if (loaded.error) {
    return NextResponse.json({ error: loaded.error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: (loaded.data ?? []).map((row: any) => ({
      id: String(row.id),
      projectNumber: String(row.project_number ?? ""),
      name: String(row.name ?? ""),
      status: String(row.status ?? "DRAFT"),
      assignedToCurrentUser: row.project_manager_id === userId,
    })),
  })
}
