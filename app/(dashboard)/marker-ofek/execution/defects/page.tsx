import { ExecutionEntityWorkspaceScaffold } from "@/components/marker-ofek/execution/execution-entity-workspace-scaffold"

export default function ExecutionDefectsPage() {
  return (
    <ExecutionEntityWorkspaceScaffold
      mode="defects"
      title="Execution · Defects"
      subtitle="Scaffold for QA/Safety defects with contractor assignment and resolution tracking."
    />
  )
}
