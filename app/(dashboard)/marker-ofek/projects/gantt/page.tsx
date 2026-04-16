import { GanttChartSquare } from "lucide-react"

import { DenseMasterDetailTemplate } from "@/components/layout/DenseMasterDetailTemplate"
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
    <DenseMasterDetailTemplate
      dir="rtl"
      eyebrow="Marker Ofek · Projects"
      title="מערכת ניהול גאנט"
      description={`פרויקט פעיל: ${projectName || "פרויקט בדיקה"}`}
      leading={<GanttChartSquare aria-hidden />}
      master={
        <div className="flex items-center justify-between gap-2 px-1 py-0.5">
          <p className="text-xs text-slate-600">לוח זמנים, תלותים ותצוגת TreeGrid בסגנון MS Project.</p>
        </div>
      }
      detail={<GanttBoard projectId={projectId} />}
    />
  )
}
