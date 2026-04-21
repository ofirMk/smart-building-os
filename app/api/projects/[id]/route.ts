import { type NextRequest, NextResponse } from "next/server"

import {
  requireMasterDataApiContext,
  sanitizeOptionalString,
} from "@/lib/erp/master-data-api"

type ProjectStatus = "ACTIVE" | "COMPLETED" | "DRAFT"

type ProjectRow = {
  id: string
  company_id: string
  project_number: string
  name: string
  status: ProjectStatus
  start_date: string | null
  end_date: string | null
  project_manager_id: string | null
}

type UpdateProjectBody = {
  projectNumber?: unknown
  name?: unknown
  status?: unknown
  startDate?: unknown
  endDate?: unknown
  projectManagerId?: unknown
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeParams(
  params: Promise<{ id: string }> | { id: string }
): Promise<{ id: string }> {
  return Promise.resolve(params)
}

function normalizeStatus(value: unknown): ProjectStatus | null {
  const status = sanitizeOptionalString(value)?.toUpperCase()
  if (status === "ACTIVE" || status === "COMPLETED" || status === "DRAFT") return status
  return null
}

function toProjectDto(row: ProjectRow) {
  return {
    id: row.id,
    companyId: row.company_id,
    projectNumber: row.project_number,
    name: row.name,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    projectManagerId: row.project_manager_id,
  }
}

async function loadProject(req: NextRequest, projectId: string) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate

  const { supabase, companyId } = gate.ctx
  const { data, error } = await supabase
    .from("erp_proj_projects")
    .select("*")
    .eq("id", projectId)
    .eq("company_id", companyId)
    .maybeSingle()

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: error.message }, { status: 500 }),
    }
  }
  if (!data) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Project not found" }, { status: 404 }),
    }
  }

  return { ok: true as const, data: toProjectDto(data as ProjectRow) }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeParams(params)
  const loaded = await loadProject(req, id)
  if (!loaded.ok) return loaded.response
  return NextResponse.json({ data: loaded.data })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response

  const { supabase, companyId } = gate.ctx
  const body = (await req.json().catch(() => null)) as UpdateProjectBody | null

  const patch: Record<string, string | null> = {}
  const projectNumber = sanitizeOptionalString(body?.projectNumber)
  const name = sanitizeOptionalString(body?.name)
  const status = normalizeStatus(body?.status)

  if (projectNumber !== null) patch.project_number = projectNumber
  if (name !== null) patch.name = name
  if (status) patch.status = status
  if (body?.startDate !== undefined) patch.start_date = sanitizeOptionalString(body.startDate)
  if (body?.endDate !== undefined) patch.end_date = sanitizeOptionalString(body.endDate)
  if (body?.projectManagerId !== undefined) {
    patch.project_manager_id = sanitizeOptionalString(body.projectManagerId)
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields supplied for update" }, { status: 400 })
  }

  const { error } = await supabase
    .from("erp_proj_projects")
    .update(patch)
    .eq("id", id)
    .eq("company_id", companyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const loaded = await loadProject(req, id)
  if (!loaded.ok) return loaded.response
  return NextResponse.json({ data: loaded.data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response

  const { supabase, companyId } = gate.ctx
  const { error } = await supabase
    .from("erp_proj_projects")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

