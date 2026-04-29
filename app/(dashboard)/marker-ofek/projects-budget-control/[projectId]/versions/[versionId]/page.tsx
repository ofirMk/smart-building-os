import { ProjectsBudgetControlScaffold } from "@/components/marker-ofek/projects-budget-control/projects-budget-control-scaffold"
import { loadProjectsBudgetControlData } from "@/lib/marker-ofek/projects-budget-control-data"

export default async function ProjectsBudgetControlVersionPage({
  params,
}: {
  params: Promise<{ projectId: string; versionId: string }>
}) {
  const { projectId, versionId } = await params
  const data = await loadProjectsBudgetControlData({ projectId, versionId })
  return (
    <ProjectsBudgetControlScaffold
      title={`Project ${projectId} · Version ${versionId}`}
      subtitle="Scaffold: מהדורת תכנון/ביצוע עם תמיכה ב-Inline Edit ובנעילת מהדורה."
      focusPaneTitle="Focus Pane: תמחור פעילות לסעיף נבחר במהדורה"
      rows={data.rows}
      initialError={data.error}
    />
  )
}
