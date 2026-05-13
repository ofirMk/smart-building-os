import { ContractsEntityWorkspaceScaffold } from "@/components/marker-ofek/contracts/contracts-entity-workspace-scaffold"
import { ContextualPrintButton } from "@/components/marker-ofek/print/contextual-print-button"
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
    <div dir="rtl" className="flex min-h-0 flex-1 flex-col">
      {/* Contextual PDF toolbar — the billingId IS the client-progress-bill uuid.
          Also surfaces the parent contract print button for one-click access. */}
      <div className="sticky top-0 z-10 flex items-center justify-end gap-2 border-b border-border bg-background/80 px-4 py-2 backdrop-blur print:hidden">
        <ContextualPrintButton kind="contracts" id={id} label="הדפס חוזה מזמין" />
        <ContextualPrintButton kind="client-bills" id={billingId} />
      </div>
      <ContractsEntityWorkspaceScaffold
        title={`Contract ${id} · Billing ${billingId}`}
        subtitle="Scaffold: progress billing flow in canonical EntityWorkspace."
        focusPaneTitle="FocusPane: Billing lines / deductions / retention"
        rows={rows}
        projects={data.projects}
        partners={data.partners}
        initialError={data.error}
      />
    </div>
  )
}
