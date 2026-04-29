import { ExecutionEntityWorkspaceScaffold } from "@/components/marker-ofek/execution/execution-entity-workspace-scaffold"

type DefectDetailPageProps = {
  params: Promise<{ defectId: string }> | { defectId: string }
}

export default async function DefectDetailPage({ params }: DefectDetailPageProps) {
  const resolved = await Promise.resolve(params)
  const defectId = String(resolved.defectId ?? "")

  return (
    <ExecutionEntityWorkspaceScaffold
      mode="defects"
      title={`Execution · Defect ${defectId}`}
      subtitle="Scaffold detail route for defect handling inside canonical workspace."
    />
  )
}
