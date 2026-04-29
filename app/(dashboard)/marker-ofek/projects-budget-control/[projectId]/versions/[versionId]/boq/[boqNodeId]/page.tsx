import { ProjectsBudgetControlScaffold } from "@/components/marker-ofek/projects-budget-control/projects-budget-control-scaffold"
import { loadProjectsBudgetControlData } from "@/lib/marker-ofek/projects-budget-control-data"

export default async function ProjectsBudgetControlBoqNodePage({
  params,
}: {
  params: Promise<{ projectId: string; versionId: string; boqNodeId: string }>
}) {
  const { projectId, versionId, boqNodeId } = await params
  const data = await loadProjectsBudgetControlData({ projectId, versionId })
  return (
    <ProjectsBudgetControlScaffold
      title={`Project ${projectId} · Version ${versionId} · BOQ ${boqNodeId}`}
      subtitle="Scaffold: סעיף BOQ נבחר + מסך פירוט משאבים (Task BOM / Pricing)."
      focusPaneTitle={`Focus Pane: פירוט משאבים לסעיף ${boqNodeId}`}
      rows={data.rows}
      initialError={data.error}
      initialSelectedNodeId={boqNodeId}
    />
  )
}
