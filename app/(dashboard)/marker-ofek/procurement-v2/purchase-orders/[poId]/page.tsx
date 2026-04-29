import { ProcurementScaffold } from "@/components/marker-ofek/procurement-v2/procurement-scaffold"
import { loadProcurementWorkspaceData } from "@/lib/marker-ofek/procurement-data"

export default async function ProcurementPurchaseOrderPage({
  params,
}: {
  params: Promise<{ poId: string }>
}) {
  const { poId } = await params
  const data = await loadProcurementWorkspaceData()
  const rows = data.rows.filter((row) => row.id === poId)
  const poIds = new Set(rows.map((row) => row.id))
  return (
    <ProcurementScaffold
      title={`PO ${poId}`}
      subtitle="Scaffold: הזמנת רכש נבחרת עם Focus Pane לעריכת שורות והתקדמות אספקה."
      rows={rows}
      projects={data.projects}
      suppliers={data.suppliers}
      boqNodes={data.boqNodes}
      lines={data.lines.filter((line) => poIds.has(line.poId))}
      receipts={data.receipts.filter((receipt) => poIds.has(receipt.poId))}
      invoices={data.invoices.filter((invoice) => poIds.has(invoice.poId))}
      reconciliations={data.reconciliations.filter((rec) => poIds.has(rec.poId))}
      initialError={data.error}
    />
  )
}
