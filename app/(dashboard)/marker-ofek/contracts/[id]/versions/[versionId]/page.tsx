import { ContractsEntityWorkspaceScaffold } from "@/components/marker-ofek/contracts/contracts-entity-workspace-scaffold"
import { loadContractsWorkspaceData } from "@/lib/marker-ofek/contracts-data"

type ContractVersionPageProps = {
  params:
    | Promise<{ id: string; versionId: string }>
    | { id: string; versionId: string }
}

export default async function ContractVersionPage({ params }: ContractVersionPageProps) {
  const resolved = await Promise.resolve(params)
  const id = String(resolved.id ?? "")
  const versionId = String(resolved.versionId ?? "")
  const data = await loadContractsWorkspaceData()
  const rows = data.rows.filter((row) => row.id === id)

  return (
    <ContractsEntityWorkspaceScaffold
      title={`Contract ${id} · Version ${versionId}`}
      subtitle="Scaffold: contract versions / change orders in canonical EntityWorkspace."
      focusPaneTitle="FocusPane: Version details / BOQ adjustments"
      rows={rows}
      projects={data.projects}
      partners={data.partners}
      initialError={data.error}
    />
  )
}
