import { BarChart3 } from "lucide-react"

import {
  fetchProjectBoq,
  fetchProjectTasks,
  fetchResourceEngine,
  fetchTaskBoqLinks,
  listSupplierEntitiesForGantt,
} from "@/lib/marker-ofek/gantt-actions"
import { isProjectInManagingPartnerScope } from "@/lib/marker-ofek/effective-managing-partner-scope"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { notFound } from "next/navigation"

import GanttMsProjectEditor from "@/components/marker-ofek/execution/gantt-ms-project-editor"

type PageProps = {
  params: Promise<{ id: string }> | { id: string }
}

export default async function ProjectGanttEditorPage({ params }: PageProps) {
  const resolved = await Promise.resolve(params)
  const projectId = String(resolved.id ?? "").trim()

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

  const [tasks, boqLinks, projectBoq, resourceEngine, supplierEntities] = await Promise.all([
    fetchProjectTasks(projectId),
    fetchTaskBoqLinks(projectId),
    fetchProjectBoq(projectId),
    fetchResourceEngine(projectId),
    listSupplierEntitiesForGantt(),
  ])

  return (
    <div dir="rtl" className="mx-auto flex w-full max-w-[1800px] flex-col gap-6 bg-[#FFFFFF]">
      <header className="space-y-2 border-b border-slate-100 pb-4 text-start">
        <p className="text-xs font-semibold tracking-[0.18em] text-slate-500">
          מרקר אופק — תכנון לוח זמנים
        </p>
        <div className="flex items-center gap-2">
          <BarChart3 className="size-5 text-indigo-600" aria-hidden />
          <h1 className="page-title text-[#0f172a]">עורך תרשים גאנט</h1>
        </div>
        <p className="text-sm text-slate-500">
          {projectCode ? `${projectName} (${projectCode})` : projectName}
        </p>
        <p className="text-xs text-slate-400">
          רשת משימות, ציר זמן, משאבים ותקציב — בסגנון MS Project (RTL).
        </p>
      </header>

      <GanttMsProjectEditor
        projectId={projectId}
        projectName={projectName}
        projectCode={projectCode || "MO-2026-001"}
        projectOptions={projectOptions}
        initialTasks={tasks}
        initialBoqLinks={boqLinks}
        projectBoq={projectBoq}
        initialResourceEngine={resourceEngine}
        supplierEntities={supplierEntities}
      />
    </div>
  )
}
