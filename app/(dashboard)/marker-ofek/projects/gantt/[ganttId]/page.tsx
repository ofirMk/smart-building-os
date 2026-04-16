import { GanttChartSquare } from "lucide-react"
import { notFound } from "next/navigation"

import { fetchGanttById } from "@/app/actions/gantt-actions"
import { DenseMasterDetailTemplate } from "@/components/layout/DenseMasterDetailTemplate"
import { GanttBoard } from "@/components/marker-ofek/projects/gantt-board"

type PageProps = {
  params: Promise<{ ganttId: string }> | { ganttId: string }
}

export default async function MarkerOfekSingleGanttPage({ params }: PageProps) {
  const resolved = await Promise.resolve(params)
  const ganttId = String(resolved.ganttId ?? "").trim()
  if (!ganttId) notFound()

  const gantt = await fetchGanttById(ganttId)
  if (!gantt) notFound()

  return (
    <DenseMasterDetailTemplate
      dir="rtl"
      eyebrow="Marker Ofek · Gantt"
      title={gantt.name}
      description={`פרויקט · לוח זמנים אינטראקטיבי`}
      leading={<GanttChartSquare aria-hidden />}
      master={
        <div className="flex items-center justify-between gap-2 px-1 py-0.5">
          <p className="text-xs text-slate-600">
            סרגל כלים בסגנון MS Project — עריכה, הוספה ואחוזי ביצוע.
          </p>
        </div>
      }
      detail={
        <GanttBoard ganttId={gantt.id} projectId={gantt.project_id} ganttTitle={gantt.name} />
      }
    />
  )
}
