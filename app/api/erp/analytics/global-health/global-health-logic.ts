import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"
import { projectProfitabilitySchema } from "@/lib/erp/project-profitability-schema"
import { parseApiData } from "@/lib/utils/api-client"
import {
  computePmAccuracyRanking,
  type PmProfileLookup,
  type ProjectForecastingSample,
} from "@/lib/erp/forecasting-accuracy-logic"

/** Per-project row shape consumed by the weekly-pulse cron. */
const healthProjectSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  projectManagerId: z.string().nullable(),
  projectHealthScore: z.coerce.number(),
  totalRevenue: z.coerce.number(),
  marginPct: z.coerce.number(),
  highVarianceCount: z.coerce.number(),
  netProfitability: z.coerce.number(),
  openOffsetExposure: z.coerce.number(),
  highestVariancePct: z.coerce.number(),
  averageAbsoluteDeviationDays: z.coerce.number(),
  paymentTermsDays: z.coerce.number(),
  forecastingAccuracyIndex: z.coerce.number(),
  offsetVelocityDays: z.coerce.number(),
  requiresAttention: z.boolean(),
})

const pmAccuracyRankingSchema = z.object({
  managerId: z.string(),
  managerName: z.string(),
  forecastingAccuracyIndex: z.coerce.number(),
  forecastingAccuracyPct: z.coerce.number(),
  averageAbsoluteDeviationDays: z.coerce.number(),
  paymentTermsBaselineDays: z.coerce.number(),
  sampleCount: z.coerce.number(),
  rank: z.coerce.number(),
})

export const globalHealthResponseSchema = z.object({
  companyId: z.string(),
  generatedAt: z.string(),
  summary: z.object({
    totalProjects: z.coerce.number(),
    totalRevenue: z.coerce.number(),
    averageMarginPct: z.coerce.number(),
    highVarianceCount: z.coerce.number(),
    healthyProjects: z.coerce.number(),
    attentionProjects: z.coerce.number(),
    totalOffsetRecoveryNis: z.coerce.number(),
    forecastingAccuracyIndex: z.coerce.number(),
    offsetVelocityDays: z.coerce.number(),
    projectHealthScore: z.coerce.number(),
  }),
  projects: z.array(healthProjectSchema),
  pmAccuracyRanking: z.array(pmAccuracyRankingSchema),
})

export type GlobalHealthResponse = z.infer<typeof globalHealthResponseSchema>
type HealthProjectRow = z.infer<typeof healthProjectSchema>

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface ActiveProjectRow {
  id: string
  name?: string | null
  project_manager_id?: string | null
}

interface ProfileRow {
  id: string
  full_name: string | null
}

function toIso(value: string | null | undefined): string | null {
  if (!value) return null
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString()
}

function addDays(baseIso: string | null, days: number): string | null {
  if (!baseIso) return null
  const base = new Date(baseIso)
  if (Number.isNaN(base.getTime())) return null
  const next = new Date(base)
  next.setUTCDate(next.getUTCDate() + Math.max(0, Math.round(days)))
  return next.toISOString()
}

function daysDiff(startIso: string | null, endIso: string | null): number | null {
  if (!startIso || !endIso) return null
  const start = new Date(startIso)
  const end = new Date(endIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return Math.abs((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

function parseVariancePct(input: string | number | null | undefined): number {
  if (input === null || input === undefined) return 0
  const raw = typeof input === "string" ? input.replace(/%/g, "").trim() : String(input)
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function GET(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const activeProjectsRes = await supabase
    .from("erp_proj_projects")
    .select("id,name,project_manager_id")
    .eq("company_id", activeCompanyId)
    .eq("status", "ACTIVE")
    .order("name", { ascending: true })
  if (activeProjectsRes.error) {
    return NextResponse.json({ error: activeProjectsRes.error.message }, { status: 500 })
  }

  const projects = (activeProjectsRes.data ?? []) as ActiveProjectRow[]

  const managerIds = Array.from(
    new Set(
      projects
        .map((p) => p.project_manager_id ?? null)
        .filter((value): value is string => Boolean(value))
    )
  )
  const profiles: PmProfileLookup = new Map()
  if (managerIds.length > 0) {
    const profilesRes = await supabase
      .from("profiles")
      .select("id,full_name")
      .in("id", managerIds)
    if (!profilesRes.error) {
      for (const row of (profilesRes.data ?? []) as ProfileRow[]) {
        profiles.set(row.id, row.full_name?.trim() || null)
      }
    }
  }

  const projectRows = await Promise.all(
    projects.map(async (project): Promise<HealthProjectRow> => {
      try {
        const [linkedPoLinesRes, linkedBillsRes, contractTermsRes, closedBillsRes] = await Promise.all([
          supabase
            .from("erp_purchase_order_lines")
            .select("id,created_at,linked_subcontractor_bill_id")
            .eq("company_id", activeCompanyId)
            .eq("project_id", project.id)
            .not("linked_subcontractor_bill_id", "is", null),
          supabase
            .from("erp_subcontractor_bills")
            .select("id,created_at")
            .eq("company_id", activeCompanyId)
            .eq("project_id", project.id),
          supabase
            .from("erp_client_contracts")
            .select("id,payment_terms_days")
            .eq("company_id", activeCompanyId)
            .eq("project_id", project.id),
          supabase
            .from("erp_client_progress_bills")
            .select("id,client_contract_id,status,submitted_at,approved_at,erp_client_contracts!inner(project_id)")
            .eq("company_id", activeCompanyId)
            .eq("erp_client_contracts.project_id", project.id)
            .eq("status", "APPROVED"),
        ])
        const linkedBillCreatedById = new Map<string, string>()
        if (!linkedBillsRes.error) {
          for (const bill of linkedBillsRes.data ?? []) {
            const id = String((bill as { id?: string }).id ?? "")
            const createdAt = String((bill as { created_at?: string | null }).created_at ?? "")
            if (id && createdAt) linkedBillCreatedById.set(id, createdAt)
          }
        }
        const offsetVelocityValues: number[] = []
        if (!linkedPoLinesRes.error) {
          for (const row of linkedPoLinesRes.data ?? []) {
            const poCreated = toIso((row as { created_at?: string | null }).created_at)
            const linkedBillId = (row as { linked_subcontractor_bill_id?: string | null })
              .linked_subcontractor_bill_id
            const linkedBillCreated = linkedBillId
              ? toIso(linkedBillCreatedById.get(linkedBillId) ?? null)
              : null
            const velocity = daysDiff(poCreated, linkedBillCreated)
            if (velocity !== null) offsetVelocityValues.push(velocity)
          }
        }
        const offsetVelocityDays =
          offsetVelocityValues.length > 0
            ? offsetVelocityValues.reduce((sum, value) => sum + value, 0) / offsetVelocityValues.length
            : 0

        const profitabilityRes = await fetch(
          new URL(`/api/erp/projects/${project.id}/profitability`, req.url),
          {
            method: "GET",
            cache: "no-store",
            headers: {
              cookie: req.headers.get("cookie") ?? "",
              "x-company-id": activeCompanyId,
              "x-active-company-id": activeCompanyId,
              "x-cron-secret": req.headers.get("x-cron-secret") ?? "",
            },
          }
        )
        const profitability = await parseApiData(profitabilityRes, {
          schema: projectProfitabilitySchema,
        })
        const openOffsetExposure = Number(
          profitability.riskMap?.openOffsetsAmount ?? profitability.offsetExposure ?? 0
        )
        const revenue = Number(profitability.totalApprovedClientAmount ?? 0)
        const marginPct = Number(
          profitability.profitabilityScore?.currentMarginPct ??
            profitability.currentMarginPct ??
            0
        )
        const highVarianceCount = Number(
          profitability.riskMap?.highVarianceOverridesCount ?? 0
        )
        const highestVariancePct = parseVariancePct(
          profitability.riskMap?.highestVariancePct ?? null
        )
        const paymentTermsByContractId = new Map<string, number>()
        if (!contractTermsRes.error) {
          for (const row of contractTermsRes.data ?? []) {
            const contractId = String((row as { id?: string }).id ?? "")
            const paymentTermsDays = Number(
              (row as { payment_terms_days?: number | null }).payment_terms_days ?? 30
            )
            if (contractId) paymentTermsByContractId.set(contractId, paymentTermsDays)
          }
        }
        const deviationValues = (closedBillsRes.data ?? [])
          .map((bill) => {
            const submittedAt = toIso((bill as { submitted_at?: string | null }).submitted_at)
            const actualApprovedAt = toIso((bill as { approved_at?: string | null }).approved_at)
            const contractId = String((bill as { client_contract_id?: string | null }).client_contract_id ?? "")
            const paymentTermsDays = paymentTermsByContractId.get(contractId) ?? 30
            const expectedArrivalDate = addDays(submittedAt, paymentTermsDays)
            return daysDiff(expectedArrivalDate, actualApprovedAt)
          })
          .filter((value): value is number => value !== null)
        const averageAbsoluteDeviationDays =
          deviationValues.length > 0
            ? deviationValues.reduce((sum, value) => sum + value, 0) / deviationValues.length
            : Number(profitability.cashFlowForecast?.averageApprovalLagDays ?? 0)
        const paymentTerms = profitability.cashFlowForecast?.timeline?.[0]?.paymentTermsDays ?? 30
        const paymentTermsDays = Number(paymentTerms)
        const forecastingAccuracyIndex =
          paymentTermsDays > 0
            ? Math.max(0, 1 - averageAbsoluteDeviationDays / paymentTermsDays)
            : 0
        const projectHealthScore = Number(profitability.healthScore ?? 0)

        return {
          projectId: project.id,
          projectName: project.name?.trim() || project.id.slice(0, 8),
          projectManagerId: project.project_manager_id ?? null,
          projectHealthScore: Number(projectHealthScore.toFixed(2)),
          totalRevenue: Number(revenue.toFixed(2)),
          marginPct: Number(marginPct.toFixed(2)),
          highVarianceCount: Number(highVarianceCount.toFixed(0)),
          netProfitability: Number((profitability.netProfitability ?? 0).toFixed(2)),
          openOffsetExposure: Number(openOffsetExposure.toFixed(2)),
          highestVariancePct: Number(highestVariancePct.toFixed(2)),
          averageAbsoluteDeviationDays: Number(averageAbsoluteDeviationDays.toFixed(2)),
          paymentTermsDays: Number(paymentTermsDays.toFixed(2)),
          forecastingAccuracyIndex: Number(forecastingAccuracyIndex.toFixed(4)),
          offsetVelocityDays: Number(offsetVelocityDays.toFixed(2)),
          requiresAttention: projectHealthScore < 70,
        }
      } catch {
        return {
          projectId: project.id,
          projectName: project.name?.trim() || project.id.slice(0, 8),
          projectManagerId: project.project_manager_id ?? null,
          projectHealthScore: 0,
          totalRevenue: 0,
          marginPct: 0,
          highVarianceCount: 0,
          netProfitability: 0,
          openOffsetExposure: 0,
          highestVariancePct: 0,
          averageAbsoluteDeviationDays: 0,
          paymentTermsDays: 0,
          forecastingAccuracyIndex: 0,
          offsetVelocityDays: 0,
          requiresAttention: true,
        }
      }
    })
  )

  const orderedRows = [...projectRows].sort((a, b) => {
    if (a.requiresAttention !== b.requiresAttention) return a.requiresAttention ? -1 : 1
    return a.projectHealthScore - b.projectHealthScore
  })

  const healthyProjects = orderedRows.filter((row) => row.projectHealthScore >= 70).length
  const attentionProjects = orderedRows.length - healthyProjects
  const totalOffsetRecoveryNis = orderedRows.reduce(
    (sum, row) => sum + row.openOffsetExposure,
    0
  )
  const totalRevenue = orderedRows.reduce((sum, row) => sum + row.totalRevenue, 0)
  const marginRows = orderedRows.filter((row) => Number.isFinite(row.marginPct))
  const averageMarginPct =
    marginRows.length > 0
      ? marginRows.reduce((sum, row) => sum + row.marginPct, 0) / marginRows.length
      : 0
  const highVarianceCount = orderedRows.reduce(
    (sum, row) => sum + row.highVarianceCount,
    0
  )
  const forecastingAccuracyIndex =
    orderedRows.length > 0
      ? orderedRows.reduce((sum, row) => sum + row.forecastingAccuracyIndex, 0) / orderedRows.length
      : 0
  const offsetVelocityRows = orderedRows.filter((row) => row.offsetVelocityDays > 0)
  const offsetVelocityDays =
    offsetVelocityRows.length > 0
      ? offsetVelocityRows.reduce((sum, row) => sum + row.offsetVelocityDays, 0) /
        offsetVelocityRows.length
      : 0
  const projectHealthScore =
    orderedRows.length > 0
      ? orderedRows.reduce((sum, row) => sum + row.projectHealthScore, 0) / orderedRows.length
      : 0

  const samples: ProjectForecastingSample[] = orderedRows.map((row) => ({
    projectId: row.projectId,
    projectManagerId: row.projectManagerId,
    averageAbsoluteDeviationDays: row.averageAbsoluteDeviationDays,
    paymentTermsDays: row.paymentTermsDays,
    projectName: row.projectName,
  }))
  const ranked = computePmAccuracyRanking(samples, profiles)
  const pmAccuracyRanking = ranked.map((row, idx) => ({
    managerId: row.projectManagerId,
    managerName: row.projectManagerName ?? row.projectManagerId.slice(0, 8),
    forecastingAccuracyIndex: row.forecastingAccuracyIndex,
    forecastingAccuracyPct: row.forecastingAccuracyPct,
    averageAbsoluteDeviationDays: row.averageAbsoluteDeviationDays,
    paymentTermsBaselineDays: row.averagePaymentTermsDays,
    sampleCount: row.projectsCount,
    rank: idx + 1,
  }))

  const payload: GlobalHealthResponse = globalHealthResponseSchema.parse({
    companyId: activeCompanyId,
    generatedAt: new Date().toISOString(),
    summary: {
      totalProjects: orderedRows.length,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      averageMarginPct: Number(averageMarginPct.toFixed(2)),
      highVarianceCount,
      healthyProjects,
      attentionProjects,
      totalOffsetRecoveryNis: Number(totalOffsetRecoveryNis.toFixed(2)),
      forecastingAccuracyIndex: Number(forecastingAccuracyIndex.toFixed(4)),
      offsetVelocityDays: Number(offsetVelocityDays.toFixed(2)),
      projectHealthScore: Number(projectHealthScore.toFixed(2)),
    },
    projects: orderedRows,
    pmAccuracyRanking,
  })

  return NextResponse.json({ data: payload })
}
