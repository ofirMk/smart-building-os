import { ExecutionEntityWorkspaceScaffold } from "@/components/marker-ofek/execution/execution-entity-workspace-scaffold"

export default function DailyLogsPage() {
  return (
    <ExecutionEntityWorkspaceScaffold
      mode="daily-logs"
      title="Execution · Daily Logs"
      subtitle="Scaffold for daily site reporting, workforce presence, and progress summaries."
    />
  )
}
