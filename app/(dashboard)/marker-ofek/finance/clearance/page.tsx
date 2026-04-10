import { FinancialClearanceClient } from "@/components/marker-ofek/finance/financial-clearance-client"
import { fetchPendingFinancialClearanceAction } from "@/lib/holden-erp/finance-actions"

export default async function FinanceClearancePage() {
  const res = await fetchPendingFinancialClearanceAction()
  const rows = res.ok ? res.rows : []

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#070b12] text-slate-100">
      <FinancialClearanceClient initialRows={rows} loadError={res.ok ? null : res.error} />
    </div>
  )
}
