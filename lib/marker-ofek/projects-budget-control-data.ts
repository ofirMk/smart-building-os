import { cookies } from "next/headers"

import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { formatError } from "@/lib/format-error"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export type ProjectBudgetControlRow = {
  id: string
  projectId: string
  projectCode: string
  projectName: string
  versionId: string
  versionNumber: number
  versionType: "TENDER" | "ZERO" | "EXECUTION"
  structureCode: string
  title: string
  progressPercent: number
  plannedBudget: number
  actualCost: number
}

type LoadProjectsBudgetControlParams = {
  projectId?: string
  versionId?: string
}

type LoadProjectsBudgetControlResult = {
  rows: ProjectBudgetControlRow[]
  error: string | null
}

type ProjectRow = {
  id: string
  project_code: string
  name: string
}

type VersionRow = {
  id: string
  project_id: string
  version_number: number
  version_kind: "TENDER" | "ZERO" | "EXECUTION"
}

type BoqRow = {
  id: string
  version_id: string
  structure_code: string
  title: string
  executed_percent: number | null
  planned_total_cost: number | null
}

type ActualRow = {
  boq_node_id: string
  actual_amount: number | null
}

export async function loadProjectsBudgetControlData(
  params: LoadProjectsBudgetControlParams = {}
): Promise<LoadProjectsBudgetControlResult> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) {
      return { rows: [], error: "נדרשת התחברות כדי לצפות בנתוני פרויקטים ותקציב." }
    }

    const cookieStore = await cookies()
    const companyId = resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value)
    if (!companyId) return { rows: [], error: "חסר הקשר חברה בסשן." }

    const projectsQuery = supabase
      .from("pbc_projects")
      .select("id, project_code, name")
      .eq("company_id", companyId)
      .order("name", { ascending: true })

    const filteredProjectsQuery = params.projectId
      ? projectsQuery.eq("id", params.projectId)
      : projectsQuery

    const projectsRes = await filteredProjectsQuery
    if (projectsRes.error) {
      return { rows: [], error: projectsRes.error.message }
    }

    const projects = (projectsRes.data ?? []) as ProjectRow[]
    if (projects.length === 0) {
      return { rows: [], error: null }
    }

    const projectIds = projects.map((row) => row.id)
    const versionsQuery = supabase
      .from("pbc_planning_versions")
      .select("id, project_id, version_number, version_kind")
      .eq("company_id", companyId)
      .in("project_id", projectIds)

    const filteredVersionsQuery = params.versionId
      ? versionsQuery.eq("id", params.versionId)
      : versionsQuery.order("version_number", { ascending: false })

    const versionsRes = await filteredVersionsQuery
    if (versionsRes.error) {
      return { rows: [], error: versionsRes.error.message }
    }

    const versions = (versionsRes.data ?? []) as VersionRow[]
    if (versions.length === 0) {
      return { rows: [], error: null }
    }

    const versionIds = versions.map((row) => row.id)
    const boqRes = await supabase
      .from("pbc_boq_nodes")
      .select("id, version_id, structure_code, title, executed_percent, planned_total_cost")
      .eq("company_id", companyId)
      .in("version_id", versionIds)
      .order("structure_code", { ascending: true })

    if (boqRes.error) {
      return { rows: [], error: boqRes.error.message }
    }

    const boqRows = (boqRes.data ?? []) as BoqRow[]
    if (boqRows.length === 0) {
      return { rows: [], error: null }
    }

    const boqIds = boqRows.map((row) => row.id)
    const actualRes = await supabase
      .from("pbc_actual_cost_entries")
      .select("boq_node_id, actual_amount")
      .eq("company_id", companyId)
      .in("boq_node_id", boqIds)

    if (actualRes.error) {
      return { rows: [], error: actualRes.error.message }
    }

    const actualRows = (actualRes.data ?? []) as ActualRow[]
    const actualByBoqId = new Map<string, number>()
    for (const row of actualRows) {
      const prev = actualByBoqId.get(row.boq_node_id) ?? 0
      const next = prev + Number(row.actual_amount ?? 0)
      actualByBoqId.set(row.boq_node_id, Number(next.toFixed(2)))
    }

    const projectById = new Map(projects.map((row) => [row.id, row]))
    const versionById = new Map(versions.map((row) => [row.id, row]))

    const rows: ProjectBudgetControlRow[] = boqRows
      .map((boqRow) => {
        const version = versionById.get(boqRow.version_id)
        if (!version) return null
        const project = projectById.get(version.project_id)
        if (!project) return null
        return {
          id: boqRow.id,
          projectId: project.id,
          projectCode: project.project_code,
          projectName: project.name,
          versionId: version.id,
          versionNumber: Number(version.version_number ?? 0),
          versionType: version.version_kind,
          structureCode: boqRow.structure_code,
          title: boqRow.title,
          progressPercent: Number(boqRow.executed_percent ?? 0),
          plannedBudget: Number(boqRow.planned_total_cost ?? 0),
          actualCost: Number(actualByBoqId.get(boqRow.id) ?? 0),
        } satisfies ProjectBudgetControlRow
      })
      .filter((row): row is ProjectBudgetControlRow => Boolean(row))
      .sort((a, b) => {
        if (a.projectName !== b.projectName) return a.projectName.localeCompare(b.projectName, "he")
        if (a.versionNumber !== b.versionNumber) return b.versionNumber - a.versionNumber
        return a.structureCode.localeCompare(b.structureCode, "he")
      })

    return { rows, error: null }
  } catch (error) {
    return { rows: [], error: formatError(error) }
  }
}
