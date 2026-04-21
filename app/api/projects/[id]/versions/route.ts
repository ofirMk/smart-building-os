import { type NextRequest, NextResponse } from "next/server"

import {
  requireMasterDataApiContext,
  sanitizeOptionalString,
} from "@/lib/erp/master-data-api"

type VersionStatus = "DRAFT" | "APPROVED"

type PlanningVersionRow = {
  id: string
  company_id: string
  project_id: string
  version_number: number
  description: string
  is_base_version: boolean
  is_execution_version: boolean
  status: VersionStatus
}

type CreateVersionBody = {
  versionNumber?: unknown
  description?: unknown
  isBaseVersion?: unknown
  isExecutionVersion?: unknown
  status?: unknown
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeParams(
  params: Promise<{ id: string }> | { id: string }
): Promise<{ id: string }> {
  return Promise.resolve(params)
}

function normalizeStatus(value: unknown): VersionStatus {
  return sanitizeOptionalString(value)?.toUpperCase() === "APPROVED" ? "APPROVED" : "DRAFT"
}

function toVersionDto(row: PlanningVersionRow) {
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    versionNumber: row.version_number,
    description: row.description,
    isBaseVersion: row.is_base_version,
    isExecutionVersion: row.is_execution_version,
    status: row.status,
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: projectId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response

  const { supabase, companyId } = gate.ctx
  const project = await supabase
    .from("erp_proj_projects")
    .select("id")
    .eq("id", projectId)
    .eq("company_id", companyId)
    .maybeSingle()

  if (project.error) return NextResponse.json({ error: project.error.message }, { status: 500 })
  if (!project.data) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  const { data, error } = await supabase
    .from("erp_proj_planning_versions")
    .select("*")
    .eq("project_id", projectId)
    .eq("company_id", companyId)
    .order("version_number", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: ((data ?? []) as PlanningVersionRow[]).map(toVersionDto) })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: projectId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response

  const { supabase, companyId } = gate.ctx
  const body = (await req.json().catch(() => null)) as CreateVersionBody | null

  const project = await supabase
    .from("erp_proj_projects")
    .select("id")
    .eq("id", projectId)
    .eq("company_id", companyId)
    .maybeSingle()

  if (project.error) return NextResponse.json({ error: project.error.message }, { status: 500 })
  if (!project.data) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  const requestedVersion = Number(body?.versionNumber)
  let versionNumber = Number.isFinite(requestedVersion) && requestedVersion > 0 ? requestedVersion : null

  if (!versionNumber) {
    const latest = await supabase
      .from("erp_proj_planning_versions")
      .select("version_number")
      .eq("project_id", projectId)
      .eq("company_id", companyId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latest.error) return NextResponse.json({ error: latest.error.message }, { status: 500 })
    versionNumber = Number(latest.data?.version_number ?? 0) + 1
  }

  const { data, error } = await supabase
    .from("erp_proj_planning_versions")
    .insert({
      company_id: companyId,
      project_id: projectId,
      version_number: versionNumber,
      description: sanitizeOptionalString(body?.description) ?? "",
      is_base_version: body?.isBaseVersion === true,
      is_execution_version: body?.isExecutionVersion === true,
      status: normalizeStatus(body?.status),
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: toVersionDto(data as PlanningVersionRow) }, { status: 201 })
}

