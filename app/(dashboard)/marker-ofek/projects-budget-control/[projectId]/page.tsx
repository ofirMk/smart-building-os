import { ProjectsBudgetControlScaffold } from "@/components/marker-ofek/projects-budget-control/projects-budget-control-scaffold"
import { loadProjectsBudgetControlData } from "@/lib/marker-ofek/projects-budget-control-data"

export default async function ProjectsBudgetControlProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const data = await loadProjectsBudgetControlData({ projectId })
  return (
    <ProjectsBudgetControlScaffold
      title={`Project ${projectId}`}
      subtitle="Scaffold: פרויקט פעיל עם מהדורת ביצוע חודשית, ניהול BOQ ועדכון אחוזי ביצוע."
      focusPaneTitle="Focus Pane: פירוק סעיף BOQ למשאבים (Task BOM)"
      rows={data.rows}
      initialError={data.error}
    />
  )
}
