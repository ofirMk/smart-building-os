import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  assertMobileProjectAccess,
  requireMobileFieldApiContext,
} from "@/lib/erp/mobile-field-api"

const createWorkLogSchema = z.object({
  projectId: z.string().uuid(),
  workDate: z.string().trim().min(8),
  wbsChapter: z.string().trim().min(1),
  workersCount: z.coerce.number().int().min(0),
  machineryHours: z.coerce.number().min(0),
  progressPct: z.coerce.number().min(0).max(100),
  note: z.string().trim().max(500).optional().nullable(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const ctx = await requireMobileFieldApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId, userId, siteManagerOnly } = ctx

  const body = await req.json().catch(() => null)
  const parsed = createWorkLogSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }

  const access = await assertMobileProjectAccess({
    supabase,
    activeCompanyId,
    projectId: parsed.data.projectId,
    userId,
    siteManagerOnly,
  })
  if (!access.ok) return access.response

  const inserted = await supabase
    .from("erp_field_work_logs")
    .insert({
      company_id: activeCompanyId,
      project_id: parsed.data.projectId,
      work_date: parsed.data.workDate,
      wbs_chapter: parsed.data.wbsChapter,
      workers_count: parsed.data.workersCount,
      machinery_hours: parsed.data.machineryHours,
      progress_pct: parsed.data.progressPct,
      note: parsed.data.note ?? null,
      reported_by_user_id: userId,
    })
    .select("*")
    .single()
  if (inserted.error) {
    return NextResponse.json({ error: inserted.error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      id: String(inserted.data.id),
      projectId: String(inserted.data.project_id),
      workDate: String(inserted.data.work_date),
      wbsChapter: String(inserted.data.wbs_chapter),
      workersCount: Number(inserted.data.workers_count ?? 0),
      machineryHours: Number(inserted.data.machinery_hours ?? 0),
      progressPct: Number(inserted.data.progress_pct ?? 0),
    },
  })
}
