import { FinanceEntityWorkspaceScaffold } from "@/components/marker-ofek/finance/finance-entity-workspace-scaffold"

export default function FinanceCashFlowPage() {
  return (
    <FinanceEntityWorkspaceScaffold
      mode="cash-flow"
      title="Finance · Cash Flow"
      subtitle="Scaffold for monthly cash-flow forecast and actual movements."
    />
  )
}
