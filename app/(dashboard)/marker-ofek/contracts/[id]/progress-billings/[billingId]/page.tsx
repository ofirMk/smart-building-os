import { ContractsEntityWorkspaceScaffold } from "@/components/marker-ofek/contracts/contracts-entity-workspace-scaffold"
import { loadContractsWorkspaceData } from "@/lib/marker-ofek/contracts-data"

type ContractProgressBillingPageProps = {
  params:
    | Promise<{ id: string; billingId: string }>
    | { id: string; billingId: string }
}

export default async function ContractProgressBillingPage({
  params,
}: ContractProgressBillingPageProps) {
  const resolved = await Promise.resolve(params)
  const id = String(resolved.id ?? "")
  const billingId = String(resolved.billingId ?? "")
  const data = await loadContractsWorkspaceData()
  const rows = data.rows.filter((row) => row.id === id)

  return (
    <ContractsEntityWorkspaceScaffold
      title={`Contract ${id} · Billing ${billingId}`}
      subtitle="Scaffold: progress billing flow in canonical EntityWorkspace."
      focusPaneTitle="FocusPane: Billing lines / deductions / retention"
      rows={rows}
      projects={data.projects}
      partners={data.partners}
      initialError={data.error}
    />
  )
}
