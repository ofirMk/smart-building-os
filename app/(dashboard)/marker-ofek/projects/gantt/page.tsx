import { GanttChartSquare } from "lucide-react"

import { GanttBoard } from "@/components/marker-ofek/projects/gantt-board"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

const FALLBACK_PROJECT_ID = "00000000-0000-0000-0000-000000000000"

export default async function MarkerOfekProjectsGanttPage() {
  const supabase = await createSupabaseServerAuthClient()
  const { data: project } = await supabase
    .schema("public")
    .from("projects")
    .select("id, name")
    .eq("is_deleted", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  const projectId = String(project?.id ?? "").trim() || FALLBACK_PROJECT_ID
  const projectName = String(project?.name ?? "").trim()

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-slate-50 p-4 sm:p-6" dir="rtl">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-start gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
            <GanttChartSquare className="size-5" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-indigo-700">Marker Ofek · Projects</p>
            <h1 className="text-xl font-bold text-slate-900">מערכת ניהול גאנט</h1>
            <p className="text-sm text-slate-600">פרויקט פעיל: {projectName || "פרויקט בדיקה"}</p>
          </div>
        </div>

        <GanttBoard projectId={projectId} />
      </section>
    </main>
  )
}
