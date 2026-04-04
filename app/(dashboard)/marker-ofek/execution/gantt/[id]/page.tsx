import { BarChart3 } from "lucide-react"

import { calculateTaskCostVariance, fetchProjectTasks } from "@/lib/marker-ofek/gantt-actions"
import { isProjectInManagingPartnerScope } from "@/lib/marker-ofek/effective-managing-partner-scope"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { notFound } from "next/navigation"
import GanttClient from "./gantt-client"

type PageProps = {
  params: Promise<{ id: string }> | { id: string }
}

export default async function MarkerOfekGanttProjectPage({ params }: PageProps) {
  const resolved = await Promise.resolve(params)
  const id = resolved.id
  const projectId = String(id ?? "").trim()

  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user?.email) {
    const allowed = await isProjectInManagingPartnerScope(projectId, user.email, user.id)
    if (!allowed) notFound()
  }

  const { data } = await supabase
    .schema("public")
    .from("projects")
    .select("name, internal_project_code")
    .eq("id", projectId)
    .maybeSingle()

  const { data: projectRows } = await supabase
    .schema("public")
    .from("projects")
    .select("id, name, internal_project_code")
    .eq("is_deleted", false)
    .order("name", { ascending: true })

  const projectOptions =
    (projectRows ?? []) as { id: string; name: string; internal_project_code: string }[]

  const projectName = String(data?.name ?? "").trim() || "פרויקט לא מזוהה"
  const projectCode = String(data?.internal_project_code ?? "").trim()
  const [tasks, variance] = await Promise.all([
    fetchProjectTasks(projectId),
    calculateTaskCostVariance(projectId),
  ])

  const perTaskVariance = Object.fromEntries(
    variance.perTask.map((row) => [
      row.taskId,
      { estimatedCost: row.estimatedCost, actualCost: row.actualCost },
    ])
  )

  return (
    <div dir="rtl" className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 bg-[#FFFFFF]">
      <header className="space-y-2 border-b border-slate-100 pb-4 text-start">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Marker Ofek - Work Management
        </p>
        <div className="flex items-center gap-2">
          <BarChart3 className="size-5 text-indigo-600" aria-hidden />
          <h1 className="page-title text-[#0f172a]">גאנט וניהול משימות</h1>
        </div>
        <p className="text-sm text-slate-500">
          {projectCode ? `${projectName} (${projectCode})` : projectName}
        </p>
      </header>

      <GanttClient
        projectId={projectId}
        projectName={projectName}
        projectCode={projectCode || "MO-2026-001"}
        projectOptions={projectOptions}
        initialTasks={tasks}
        perTaskVariance={perTaskVariance}
        summary={{
          plannedCost: variance.plannedCost,
          actualCost: variance.actualCost,
          variance: variance.variance,
          variancePercent: variance.variancePercent,
          status: variance.status,
        }}
      />
    </div>
  )
}
