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

type CreateProjectBody = {
  projectNumber?: unknown
  name?: unknown
  status?: unknown
  startDate?: unknown
  endDate?: unknown
  projectManagerId?: unknown
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeStatus(value: unknown): ProjectStatus {
  const status = sanitizeOptionalString(value)?.toUpperCase()
  if (status === "ACTIVE" || status === "COMPLETED" || status === "DRAFT") return status
  return "DRAFT"
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

export async function GET(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response

  const { supabase, companyId } = gate.ctx
  const q = sanitizeOptionalString(req.nextUrl.searchParams.get("q"))
  const status = sanitizeOptionalString(req.nextUrl.searchParams.get("status"))?.toUpperCase()

  let query = supabase
    .from("erp_proj_projects")
    .select("*")
    .eq("company_id", companyId)
    .order("project_number", { ascending: true })

  if (status === "ACTIVE" || status === "COMPLETED" || status === "DRAFT") {
    query = query.eq("status", status)
  }
  if (q) {
    query = query.or(`name.ilike.%${q}%,project_number.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: ((data ?? []) as ProjectRow[]).map(toProjectDto),
  })
}

export async function POST(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response

  const { supabase, companyId } = gate.ctx
  const body = (await req.json().catch(() => null)) as CreateProjectBody | null

  const projectNumber = sanitizeOptionalString(body?.projectNumber)
  const name = sanitizeOptionalString(body?.name)
  const startDate = sanitizeOptionalString(body?.startDate)
  const endDate = sanitizeOptionalString(body?.endDate)
  const projectManagerId = sanitizeOptionalString(body?.projectManagerId)
  const status = normalizeStatus(body?.status)

  if (!projectNumber || !name) {
    return NextResponse.json({ error: "projectNumber and name are required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("erp_proj_projects")
    .insert({
      company_id: companyId,
      project_number: projectNumber,
      name,
      status,
      start_date: startDate,
      end_date: endDate,
      project_manager_id: projectManagerId,
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ data: toProjectDto(data as ProjectRow) }, { status: 201 })
}

