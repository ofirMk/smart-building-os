import { ContextualPrintButton } from "@/components/marker-ofek/print/contextual-print-button"
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
    <div dir="rtl" className="flex min-h-0 flex-1 flex-col">
      {/* Contextual PDF toolbar — pulls the current PO id from the URL and
          opens `/print/purchase-orders/<id>` with the live record. */}
      <div className="sticky top-0 z-10 flex items-center justify-end gap-2 border-b border-border bg-background/80 px-4 py-2 backdrop-blur print:hidden">
        <ContextualPrintButton kind="purchase-orders" id={poId} />
      </div>
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
    </div>
  )
}
