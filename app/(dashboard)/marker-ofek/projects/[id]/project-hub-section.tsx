import { notFound } from "next/navigation"

import { fetchGanttsByProject } from "@/app/actions/gantt-actions"
import { ProjectMasterHub360 } from "@/components/marker-ofek/projects/project-master-hub-360"
import {
  getProjectMasterHubMock,
  PROJECT_HUB_SLUG_ALIASES,
} from "@/lib/marker-ofek/project-master-hub-mock"
import { ensureProjectSiteForProject } from "@/lib/marker-ofek/project-execution-actions"
import { ensureProjectVaultDefaultFolders } from "@/lib/marker-ofek/wbs-plan-link-actions"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type { MarkerOfekProjectRow } from "@/types/marker-ofek"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function MarkerOfekProjectHubSection({ id }: { id: string }) {
  const supabase = await createSupabaseServerAuthClient()

  let project: MarkerOfekProjectRow | null = null

  if (UUID_RE.test(id)) {
    const { data, error } = await supabase
      .from("projects")
      .select(
        "id, internal_project_code, name, address, client_name, tender_id, status, is_deleted, deleted_at, created_at"
      )
      .eq("id", id)
      .eq("is_deleted", false)
      .maybeSingle()
    if (!error && data) project = data as MarkerOfekProjectRow
  } else {
    const alias = PROJECT_HUB_SLUG_ALIASES[id]
    if (alias) {
      const { data, error } = await supabase
        .from("projects")
        .select(
          "id, internal_project_code, name, address, client_name, tender_id, status, is_deleted, deleted_at, created_at"
        )
        .eq("internal_project_code", alias.internalProjectCode)
        .eq("is_deleted", false)
        .maybeSingle()
      if (!error && data) project = data as MarkerOfekProjectRow
    }
  }

  if (!project) notFound()

  await ensureProjectSiteForProject(project.id)
  await ensureProjectVaultDefaultFolders(project.id)

  const aliasMeta = PROJECT_HUB_SLUG_ALIASES[id]
  const displayName =
    project.name?.trim() ||
    aliasMeta?.fallbackName ||
    "פרויקט"
  const addressLine =
    project.address?.trim() ||
    aliasMeta?.fallbackAddress ||
    null

  const mock = getProjectMasterHubMock(project.id)
  const ganttCharts = await fetchGanttsByProject(project.id)

  return (
    <ProjectMasterHub360
      projectId={project.id}
      displayName={displayName}
      internalCode={project.internal_project_code}
      status={project.status}
      addressLine={addressLine}
      mock={mock}
      ganttCharts={ganttCharts}
    />
  )
}
