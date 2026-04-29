import { ExecutionEntityWorkspaceScaffold } from "@/components/marker-ofek/execution/execution-entity-workspace-scaffold"

type DailyLogDetailPageProps = {
  params: Promise<{ logId: string }> | { logId: string }
}

export default async function DailyLogDetailPage({ params }: DailyLogDetailPageProps) {
  const resolved = await Promise.resolve(params)
  const logId = String(resolved.logId ?? "")

  return (
    <ExecutionEntityWorkspaceScaffold
      mode="daily-logs"
      title={`Execution · Daily Log ${logId}`}
      subtitle="Scaffold detail route for daily log review inside canonical workspace."
    />
  )
}
