import type { Metadata } from "next"

import { ContractsEntityWorkspaceScaffold } from "@/components/marker-ofek/contracts/contracts-entity-workspace-scaffold"
import { loadContractsWorkspaceData } from "@/lib/marker-ofek/contracts-data"

export const metadata: Metadata = {
  title: "Contracts",
  description: "Contracts module scaffold (EntityWorkspace 70/30)",
}

export default async function MarkerOfekContractsPage() {
  const data = await loadContractsWorkspaceData()
  return (
    <ContractsEntityWorkspaceScaffold
      title="Contracts Workspace (Scaffold)"
      subtitle="70/30 canonical workspace: BentoSmartList (Master) + KPI intelligence + FocusPane"
      rows={data.rows}
      projects={data.projects}
      partners={data.partners}
      initialError={data.error}
    />
  )
}
