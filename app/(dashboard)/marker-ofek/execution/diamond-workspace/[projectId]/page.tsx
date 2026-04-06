import { notFound } from "next/navigation"

import { DiamondWorkspacePageClient } from "./diamond-workspace-page-client"
import {
  calculateTaskCostVariance,
  fetchProjectTasks,
  fetchProjectWbsBundle,
} from "@/lib/marker-ofek/gantt-actions"
import { isProjectInManagingPartnerScope } from "@/lib/marker-ofek/effective-managing-partner-scope"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { getWorkspaceSettingsBootstrap } from "@/lib/marker-ofek/user-workspace-actions"

type PageProps = {
  params: Promise<{ projectId: string }> | { projectId: string }
}

function maxTaskEndIso(
  tasks: { end_date: string | null }[]
): string | null {
  let best: string | null = null
  let bestMs = -Infinity
  for (const t of tasks) {
    const e = t.end_date?.trim()
    if (!e) continue
    const ms = Date.parse(e)
    if (Number.isFinite(ms) && ms > bestMs) {
      bestMs = ms
      best = e
    }
  }
  return best
}

export default async function DiamondWorkspaceProjectPage({ params }: PageProps) {
  const resolved = await Promise.resolve(params)
  const projectId = String(resolved.projectId ?? "").trim()
  if (!projectId) notFound()

  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user?.email) {
    const allowed = await isProjectInManagingPartnerScope(
      projectId,
      user.email,
      user.id
    )
    if (!allowed) notFound()
  }

  const { data: proj } = await supabase
    .from("projects")
    .select("name, internal_project_code")
    .eq("id", projectId)
    .maybeSingle()

  if (!proj) notFound()

  const [tasks, wbs, variance, workspace] = await Promise.all([
    fetchProjectTasks(projectId),
    fetchProjectWbsBundle(projectId),
    calculateTaskCostVariance(projectId),
    getWorkspaceSettingsBootstrap(),
  ])

  const plannedDeadlineIso = maxTaskEndIso(tasks)

  return (
    <DiamondWorkspacePageClient
      projectId={projectId}
      projectName={String(proj.name ?? "").trim() || "פרויקט"}
      projectCode={String(proj.internal_project_code ?? "").trim()}
      initialLayout={workspace.diamondWorkspaceLayout}
      initialTasks={tasks}
      wbsNodes={wbs.nodes}
      plannedDeadlineIso={plannedDeadlineIso}
      variance={{
        plannedCost: variance.plannedCost,
        actualCost: variance.actualCost,
        variance: variance.variance,
        variancePercent: variance.variancePercent,
        status: variance.status,
      }}
    />
  )
}
