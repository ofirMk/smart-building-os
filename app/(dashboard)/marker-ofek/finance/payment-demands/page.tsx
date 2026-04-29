import { FinanceEntityWorkspaceScaffold } from "@/components/marker-ofek/finance/finance-entity-workspace-scaffold"

export default function FinancePaymentDemandsPage() {
  return (
    <FinanceEntityWorkspaceScaffold
      mode="payment-demands"
      title="Finance · Payment Demands"
      subtitle="Scaffold for payment demands generated from approved contract billings and supplier invoices."
    />
  )
}
