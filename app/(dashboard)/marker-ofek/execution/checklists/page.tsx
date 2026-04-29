import { ExecutionEntityWorkspaceScaffold } from "@/components/marker-ofek/execution/execution-entity-workspace-scaffold"

export default function ExecutionChecklistsPage() {
  return (
    <ExecutionEntityWorkspaceScaffold
      mode="checklists"
      title="Execution · QA/Safety Checklists"
      subtitle="Scaffold for QA and Safety checklist workflows with score tracking and issue escalation."
    />
  )
}
