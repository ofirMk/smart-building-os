import { GanttExecutionHub } from "@/components/marker-ofek/execution/gantt-execution-hub"
import { listProjectsForWbsSelector } from "@/lib/marker-ofek/wbs-structure-actions"

export default async function MarkerOfekGanttEntryPage() {
  const projects = await listProjectsForWbsSelector()
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-white">
      <GanttExecutionHub projects={projects} />
    </div>
  )
}
