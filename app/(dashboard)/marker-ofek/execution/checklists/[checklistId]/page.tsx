import { ExecutionEntityWorkspaceScaffold } from "@/components/marker-ofek/execution/execution-entity-workspace-scaffold"

type ChecklistDetailPageProps = {
  params: Promise<{ checklistId: string }> | { checklistId: string }
}

export default async function ChecklistDetailPage({ params }: ChecklistDetailPageProps) {
  const resolved = await Promise.resolve(params)
  const checklistId = String(resolved.checklistId ?? "")

  return (
    <ExecutionEntityWorkspaceScaffold
      mode="checklists"
      title={`Execution · Checklist ${checklistId}`}
      subtitle="Scaffold detail route for QA/Safety checklist review inside canonical workspace."
    />
  )
}
