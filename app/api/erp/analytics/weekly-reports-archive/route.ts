import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const weeklyReportRowSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  generatedAt: z.string(),
  topProjectId: z.string().nullable(),
  topProjectName: z.string(),
  topProjectOffsetVelocityDays: z.coerce.number(),
  summary: z.object({
    totalProjects: z.coerce.number(),
    totalRevenue: z.coerce.number(),
    averageMarginPct: z.coerce.number(),
    highVarianceCount: z.coerce.number(),
    healthyProjects: z.coerce.number(),
    attentionProjects: z.coerce.number(),
    forecastingAccuracyIndex: z.coerce.number(),
    offsetVelocityDays: z.coerce.number(),
    projectHealthScore: z.coerce.number(),
  }),
  pmAccuracyRanking: z.array(
    z.object({
      managerId: z.string(),
      managerName: z.string(),
      forecastingAccuracyPct: z.coerce.number(),
      sampleCount: z.coerce.number(),
      rank: z.coerce.number(),
    })
  ),
  riskAlerts: z.array(
    z.object({
      projectId: z.string(),
      projectName: z.string(),
      healthScore: z.coerce.number(),
      pdfUrl: z.string().url(),
    })
  ),
  pdfLinks: z.array(
    z.object({
      projectId: z.string(),
      projectName: z.string(),
      url: z.string().url(),
    })
  ),
  emailRecipients: z.array(z.string()),
  whatsappTargets: z.array(z.string()),
  whatsappSent: z.boolean(),
  emailSent: z.boolean(),
})

const archiveResponseSchema = z.object({
  rows: z.array(weeklyReportRowSchema),
})

export async function GET(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 12)
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(52, Math.round(limitParam)))
    : 12

  const res = await supabase
    .from("erp_weekly_pulse_reports")
    .select(
      "id,company_id,generated_at,top_project_id,top_project_name,top_project_offset_velocity_days,summary_payload,pm_ranking_payload,risk_alerts_payload,pdf_links_payload,email_recipients,whatsapp_targets,whatsapp_sent,email_sent"
    )
    .eq("company_id", activeCompanyId)
    .order("generated_at", { ascending: false })
    .limit(limit)

  if (res.error) {
    return NextResponse.json({ error: res.error.message }, { status: 500 })
  }

  const rows = (res.data ?? []).map((row) => ({
    id: String((row as { id?: string }).id ?? ""),
    companyId: String((row as { company_id?: string }).company_id ?? ""),
    generatedAt: String((row as { generated_at?: string }).generated_at ?? ""),
    topProjectId: (row as { top_project_id?: string | null }).top_project_id ?? null,
    topProjectName: String((row as { top_project_name?: string | null }).top_project_name ?? ""),
    topProjectOffsetVelocityDays: Number(
      (row as { top_project_offset_velocity_days?: number | null }).top_project_offset_velocity_days ?? 0
    ),
    summary: ((row as { summary_payload?: unknown }).summary_payload ?? {}) as Record<string, unknown>,
    pmAccuracyRanking: ((row as { pm_ranking_payload?: unknown }).pm_ranking_payload ??
      []) as Array<Record<string, unknown>>,
    riskAlerts: ((row as { risk_alerts_payload?: unknown }).risk_alerts_payload ??
      []) as Array<Record<string, unknown>>,
    pdfLinks: ((row as { pdf_links_payload?: unknown }).pdf_links_payload ?? []) as Array<Record<string, unknown>>,
    emailRecipients: ((row as { email_recipients?: string[] | null }).email_recipients ?? []) as string[],
    whatsappTargets: ((row as { whatsapp_targets?: string[] | null }).whatsapp_targets ?? []) as string[],
    whatsappSent: Boolean((row as { whatsapp_sent?: boolean | null }).whatsapp_sent),
    emailSent: Boolean((row as { email_sent?: boolean | null }).email_sent),
  }))

  const payload = archiveResponseSchema.parse({ rows })
  return NextResponse.json({ data: payload })
}
