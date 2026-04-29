import { ProcurementScaffold } from "@/components/marker-ofek/procurement-v2/procurement-scaffold"
import { loadProcurementWorkspaceData } from "@/lib/marker-ofek/procurement-data"

export default async function ProcurementSupplierPage({
  params,
}: {
  params: Promise<{ supplierId: string }>
}) {
  const { supplierId } = await params
  const data = await loadProcurementWorkspaceData()
  const rows = data.rows.filter((row) => row.supplierId === supplierId)
  const poIds = new Set(rows.map((row) => row.id))
  return (
    <ProcurementScaffold
      title={`Supplier ${supplierId}`}
      subtitle="Scaffold: פרטי ספק, מחירונים מוסכמים ואובליגו פתוח."
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
