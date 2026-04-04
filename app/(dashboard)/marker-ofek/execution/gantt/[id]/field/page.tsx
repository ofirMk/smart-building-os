import { format } from "date-fns"
import Link from "next/link"

import { fetchProjectTasks } from "@/lib/marker-ofek/gantt-actions"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import FieldViewClient from "./field-view-client"

type PageProps = {
  params: Promise<{ id: string }> | { id: string }
}

export default async function MarkerOfekGanttFieldViewPage({ params }: PageProps) {
  const resolved = await Promise.resolve(params)
  const projectId = String(resolved.id ?? "").trim()
  const supabase = await createSupabaseServerAuthClient()
  const { data: project } = await supabase
    .schema("public")
    .from("projects")
    .select("name, internal_project_code")
    .eq("id", projectId)
    .maybeSingle()

  const tasks = await fetchProjectTasks(projectId)
  const today = format(new Date(), "yyyy-MM-dd")
  const todaysTasks = tasks.filter((task) => {
    const start = String(task.start_date ?? "").trim()
    const end = String(task.end_date ?? "").trim()
    if (!start || !end) return false
    return start <= today && today <= end
  })

  return (
    <div dir="rtl" className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">תצוגת שטח - משימות להיום</h1>
          <p className="text-sm text-muted-foreground">
            {String(project?.name ?? "פרויקט")} ({String(project?.internal_project_code ?? "ללא קוד")})
          </p>
        </div>
        <Link
          href={`/marker-ofek/execution/gantt/${projectId}`}
          className="rounded-md border border-border-muted bg-bg-grid px-3 py-1.5 text-sm text-text-primary hover:bg-bg-main"
        >
          חזרה לגאנט מלא
        </Link>
      </div>
      <FieldViewClient projectId={projectId} initialTasks={todaysTasks} />
    </div>
  )
}
