import { BarChart3 } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { calculateTaskCostVariance, fetchProjectTasks } from "@/lib/actions/gantt-actions"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import GanttClient from "./gantt-client"

type PageProps = {
  params: Promise<{ id: string }> | { id: string }
}

export default async function MarkerOfekGanttProjectPage({ params }: PageProps) {
  const resolved = await Promise.resolve(params)
  const id = resolved.id
  const projectId = String(id ?? "").trim()

  const supabase = await createSupabaseServerAuthClient()
  const { data } = await supabase
    .schema("public")
    .from("projects")
    .select("name, internal_project_code")
    .eq("id", projectId)
    .maybeSingle()

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
    <div dir="rtl" className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 py-8 md:px-6">
      <header className="space-y-2 text-start">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-primary/70">
          Marker Ofek - Work Management
        </p>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          גאנט וניהול משימות
        </h1>
        <p className="text-sm text-muted-foreground">
          {projectCode ? `${projectName} (${projectCode})` : projectName}
        </p>
      </header>

      <Card className="border-border-muted bg-bg-grid">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-text-primary">
            <BarChart3 className="size-5 text-text-primary/70" aria-hidden />
            ממשק גאנט / WBS
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-text-primary">
          <GanttClient
            projectId={projectId}
            projectName={projectName}
            projectCode={projectCode || "MO-2026-001"}
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
        </CardContent>
      </Card>
    </div>
  )
}
