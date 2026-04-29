import { NextResponse } from "next/server"
import { z } from "zod"

import { apiErrorResponse, unknownApiErrorResponse } from "@/lib/api/api-error"
import { formatWeeklyPulseMessage, sendWeeklyPulseWhatsAppAlert } from "@/lib/erp/notifications"
import { getDefaultSystemSupportEmail, sendTransactionalEmail } from "@/lib/infrastructure/email-service"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import { parseApiData } from "@/lib/utils/api-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const globalHealthPayloadSchema = z.object({
  companyId: z.string(),
  generatedAt: z.string(),
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
  projects: z.array(
    z.object({
      projectId: z.string(),
      projectName: z.string(),
      projectHealthScore: z.coerce.number(),
      totalRevenue: z.coerce.number(),
      marginPct: z.coerce.number(),
      highVarianceCount: z.coerce.number(),
      netProfitability: z.coerce.number(),
      requiresAttention: z.boolean(),
      offsetVelocityDays: z.coerce.number(),
      highestVariancePct: z.coerce.number().optional().default(0),
    })
  ),
  pmAccuracyRanking: z.array(
    z.object({
      managerId: z.string(),
      managerName: z.string(),
      forecastingAccuracyIndex: z.coerce.number(),
      forecastingAccuracyPct: z.coerce.number(),
      averageAbsoluteDeviationDays: z.coerce.number(),
      paymentTermsBaselineDays: z.coerce.number(),
      sampleCount: z.coerce.number(),
      rank: z.coerce.number(),
    })
  ),
})

type GlobalHealthPayload = z.infer<typeof globalHealthPayloadSchema>

function getExpectedAuthHeader(): string | null {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return null
  return `Bearer ${secret}`
}

function getWeeklyPulseRecipients(): string[] {
  const fromEnv = process.env.ERP_WEEKLY_PULSE_EMAIL_TO?.trim()
  if (!fromEnv) return [getDefaultSystemSupportEmail()]
  return fromEnv
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function getBaseAppUrl(req: Request): string {
  const envBase = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (envBase) return envBase.replace(/\/+$/, "")
  const origin = new URL(req.url).origin
  return origin.replace(/\/+$/, "")
}

function getWeeklyPulseManagerNames(): string[] {
  const fromEnv = process.env.ERP_WEEKLY_PULSE_MANAGER_NAMES?.trim()
  if (!fromEnv) return ["Ophir", "Yehuda"]
  return fromEnv
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
}

async function resolveWeeklyPulseManagerTargets(supabase: any): Promise<string[]> {
  const names = getWeeklyPulseManagerNames()
  const targets = new Set<string>()
  for (const name of names) {
    const profileRes = await supabase
      .from("profiles")
      .select("full_name")
      .ilike("full_name", `${name}%`)
      .limit(2)
    if (profileRes.error) continue
    for (const row of profileRes.data ?? []) {
      const fullName = String((row as { full_name?: string | null }).full_name ?? "").trim()
      if (fullName) targets.add(fullName)
    }
  }
  if (targets.size === 0) {
    for (const name of names) targets.add(name)
  }
  return Array.from(targets)
}

function asArchiveSummary(health: GlobalHealthPayload["summary"]) {
  return {
    totalProjects: Number(health.totalProjects ?? 0),
    totalRevenue: Number(health.totalRevenue ?? 0),
    averageMarginPct: Number(health.averageMarginPct ?? 0),
    highVarianceCount: Number(health.highVarianceCount ?? 0),
    healthyProjects: Number(health.healthyProjects ?? 0),
    attentionProjects: Number(health.attentionProjects ?? 0),
    forecastingAccuracyIndex: Number(health.forecastingAccuracyIndex ?? 0),
    offsetVelocityDays: Number(health.offsetVelocityDays ?? 0),
    projectHealthScore: Number(health.projectHealthScore ?? 0),
  }
}

export async function GET(req: Request) {
  try {
    const expected = getExpectedAuthHeader()
    if (!expected) {
      return apiErrorResponse(500, "CRON_SECRET_MISSING", "CRON_SECRET is not configured")
    }
    if (req.headers.get("authorization") !== expected) {
      return apiErrorResponse(401, "UNAUTHORIZED", "Unauthorized")
    }

    const supabase = createSupabaseServiceRoleClient()
    const activeProjects = await supabase
      .from("erp_proj_projects")
      .select("company_id")
      .eq("status", "ACTIVE")
    if (activeProjects.error) {
      return apiErrorResponse(500, "ACTIVE_PROJECTS_QUERY_FAILED", activeProjects.error.message)
    }

    const companyIds = Array.from(
      new Set(
        (activeProjects.data ?? [])
          .map((row) => (row as { company_id?: string | null }).company_id)
          .filter((value): value is string => Boolean(value))
      )
    )
    if (companyIds.length === 0) {
      return NextResponse.json({ ok: true, message: "No ACTIVE projects found" })
    }

    const cronSecret = process.env.CRON_SECRET?.trim() ?? ""
    const baseAppUrl = getBaseAppUrl(req)
    const recipients = getWeeklyPulseRecipients()
    const whatsappTargets = await resolveWeeklyPulseManagerTargets(supabase)
    const dispatchResults: Array<{
      companyId: string
      message: string
      whatsappSent: boolean
      emailSent: boolean
      pdfAttachments: number
      topProjectName: string | null
      topProjectOffsetVelocityDays: number
    }> = []

    for (const companyId of companyIds) {
    const globalHealthResponse = await fetch(new URL("/api/erp/analytics/global-health", req.url), {
      method: "GET",
      cache: "no-store",
      headers: {
        "x-company-id": companyId,
        "x-active-company-id": companyId,
        "x-cron-secret": cronSecret,
      },
    })
    const globalHealth = await parseApiData(globalHealthResponse, {
      schema: globalHealthPayloadSchema,
    })

    const summaryMessage = formatWeeklyPulseMessage({
      companyId,
      totalRevenue: globalHealth.summary.totalRevenue,
      averageMarginPct: globalHealth.summary.averageMarginPct,
      highVarianceCount: globalHealth.summary.highVarianceCount,
      healthyProjects: globalHealth.summary.healthyProjects,
      attentionProjects: globalHealth.summary.attentionProjects,
      topPerformerName:
        [...globalHealth.projects].sort((a, b) => b.projectHealthScore - a.projectHealthScore)[0]?.projectName,
      lowestHealthName:
        [...globalHealth.projects].sort((a, b) => a.projectHealthScore - b.projectHealthScore)[0]?.projectName,
    })
    const lowestHealthProjects = [...globalHealth.projects]
      .sort((a, b) => a.projectHealthScore - b.projectHealthScore)
      .slice(0, 3)
    const topHealthProjects = [...globalHealth.projects]
      .sort((a, b) => b.projectHealthScore - a.projectHealthScore)
      .slice(0, 3)
    const topProjectByOffsetVelocity = [...globalHealth.projects]
      .filter((project) => project.offsetVelocityDays > 0)
      .sort((a, b) => a.offsetVelocityDays - b.offsetVelocityDays)[0] ?? null
    const pmRankingTop = [...globalHealth.pmAccuracyRanking]
      .sort((a, b) => b.forecastingAccuracyIndex - a.forecastingAccuracyIndex)
      .slice(0, 5)
    const attentionProjects = [...globalHealth.projects]
      .filter((project) => project.projectHealthScore < 70)
      .sort((a, b) => a.projectHealthScore - b.projectHealthScore)
      .slice(0, 5)
    const riskAlertPdfLinks = attentionProjects.map((project) => ({
      projectId: project.projectId,
      projectName: project.projectName,
      healthScore: Number(project.projectHealthScore.toFixed(2)),
      pdfUrl: `${baseAppUrl}/api/erp/projects/${project.projectId}/executive-summary`,
    }))

    const whatsappResult = await sendWeeklyPulseWhatsAppAlert({
      companyId,
      totalRevenue: globalHealth.summary.totalRevenue,
      averageMarginPct: globalHealth.summary.averageMarginPct,
      highVarianceCount: globalHealth.summary.highVarianceCount,
      healthyProjects: globalHealth.summary.healthyProjects,
      attentionProjects: globalHealth.summary.attentionProjects,
      topPerformerName: topProjectByOffsetVelocity?.projectName,
      lowestHealthName: lowestHealthProjects[0]?.projectName,
      managerTargets: whatsappTargets,
      topProjectOffsetVelocityDays: Number(topProjectByOffsetVelocity?.offsetVelocityDays ?? 0),
    })

    const attachments: Array<{
      filename: string
      contentBase64: string
      contentType: string
    }> = []
    const pdfLinks: Array<{ projectId: string; projectName: string; url: string }> = []
    for (const project of globalHealth.projects) {
      const pdfUrl = `${baseAppUrl}/api/erp/projects/${project.projectId}/executive-summary`
      pdfLinks.push({
        projectId: project.projectId,
        projectName: project.projectName,
        url: pdfUrl,
      })
      const pdfRes = await fetch(
        new URL(`/api/erp/projects/${project.projectId}/executive-summary`, req.url),
        {
          method: "GET",
          cache: "no-store",
          headers: {
            "x-company-id": companyId,
            "x-active-company-id": companyId,
            "x-cron-secret": cronSecret,
          },
        }
      )
      if (!pdfRes.ok) continue
      const buffer = Buffer.from(await pdfRes.arrayBuffer())
      attachments.push({
        filename: `executive-summary-${project.projectId.slice(0, 8)}.pdf`,
        contentBase64: buffer.toString("base64"),
        contentType: "application/pdf",
      })
    }

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#0f172a;">
        <h2 style="margin:0 0 12px;">Executive Pulse</h2>
        <p style="margin:0 0 12px;"><strong>Company:</strong> ${escapeHtml(companyId)}</p>
        <p style="margin:0 0 12px;"><strong>Total Revenue:</strong> ${globalHealth.summary.totalRevenue.toLocaleString(
          "he-IL"
        )} NIS · <strong>Avg Margin:</strong> ${globalHealth.summary.averageMarginPct.toFixed(
          1
        )}% · <strong>High Variance:</strong> ${globalHealth.summary.highVarianceCount.toFixed(0)}</p>
        <p style="margin:0 0 12px;">${escapeHtml(summaryMessage)}</p>
        <p style="margin:0 0 8px;"><strong>Top Project (Green Corner)</strong></p>
        <ul style="margin:0 0 12px;padding-left:20px;">
          ${
            topProjectByOffsetVelocity
              ? `<li>${escapeHtml(topProjectByOffsetVelocity.projectName)} · Offset Velocity ${topProjectByOffsetVelocity.offsetVelocityDays.toFixed(2)} days</li>`
              : "<li>No linked offset data this week</li>"
          }
        </ul>
        <p style="margin:0 0 8px;"><strong>Top-Performing Projects by Health</strong></p>
        <ul style="margin:0 0 12px;padding-left:20px;">
          ${
            topHealthProjects.length === 0
              ? "<li>No active projects</li>"
              : topHealthProjects
                  .map(
                    (project) =>
                      `<li>${escapeHtml(project.projectName)} · Health ${project.projectHealthScore.toFixed(
                        1
                      )} · Margin ${project.marginPct.toFixed(1)}% · Revenue ${project.totalRevenue.toLocaleString(
                        "he-IL"
                      )} NIS</li>`
                  )
                  .join("")
          }
        </ul>
        <p style="margin:0 0 8px;"><strong>Projects Requiring Attention (Health &lt; 70)</strong></p>
        <ul style="margin:0 0 8px;padding-left:20px;">
          ${
            attentionProjects.length === 0
              ? "<li>No active projects</li>"
              : attentionProjects
                  .map(
                    (project) =>
                      `<li>${escapeHtml(project.projectName)} · Health ${project.projectHealthScore.toFixed(
                        1
                      )} · Net ${project.netProfitability.toLocaleString("he-IL")} NIS · High Variance ${project.highVarianceCount.toFixed(
                        0
                      )} · <a href="${baseAppUrl}/api/erp/projects/${project.projectId}/executive-summary">Executive PDF</a></li>`
                  )
                  .join("")
          }
        </ul>
        <p style="margin:0 0 8px;"><strong>Manager Forecasting Accuracy Index</strong></p>
        <ul style="margin:0 0 8px;padding-left:20px;">
          ${
            pmRankingTop.length === 0
              ? "<li>No approved billing samples yet</li>"
              : pmRankingTop
                  .map(
                    (pm) =>
                      `<li>#${pm.rank.toFixed(0)} ${escapeHtml(pm.managerName)} · ${pm.forecastingAccuracyPct.toFixed(
                        1
                      )}% · Avg Deviation ${pm.averageAbsoluteDeviationDays.toFixed(2)} days</li>`
                  )
                  .join("")
          }
        </ul>
      </div>
    `
    const emailResult = await sendTransactionalEmail({
      to: recipients,
      subject: `Executive Pulse · Company ${companyId}`,
      html,
      attachments,
    })

    await supabase.from("erp_weekly_pulse_reports").insert({
      company_id: companyId,
      generated_at: globalHealth.generatedAt,
      top_project_id: topProjectByOffsetVelocity?.projectId ?? null,
      top_project_name: topProjectByOffsetVelocity?.projectName ?? "",
      top_project_offset_velocity_days: Number(topProjectByOffsetVelocity?.offsetVelocityDays ?? 0),
      summary_payload: asArchiveSummary(globalHealth.summary),
      pm_ranking_payload: pmRankingTop,
      risk_alerts_payload: riskAlertPdfLinks,
      pdf_links_payload: pdfLinks,
      email_recipients: recipients,
      whatsapp_targets: whatsappTargets,
      whatsapp_sent: whatsappResult.sent,
      email_sent: emailResult.ok,
    })

    dispatchResults.push({
      companyId,
      message: summaryMessage,
      whatsappSent: whatsappResult.sent,
      emailSent: emailResult.ok,
      pdfAttachments: attachments.length,
      topProjectName: topProjectByOffsetVelocity?.projectName ?? null,
      topProjectOffsetVelocityDays: Number(topProjectByOffsetVelocity?.offsetVelocityDays ?? 0),
    })
    }

    return NextResponse.json({
      ok: true,
      processedCompanies: dispatchResults.length,
      dispatchResults,
    })
  } catch (error) {
    return unknownApiErrorResponse(500, "ERP_WEEKLY_PULSE_FAILED", error)
  }
}
