import type { Metadata } from "next"

import { ProcurementScaffold } from "@/components/marker-ofek/procurement-v2/procurement-scaffold"
import { loadProcurementWorkspaceData } from "@/lib/marker-ofek/procurement-data"

export const metadata: Metadata = {
  title: "Procurement Workspace",
  description: "Scaffold from procurement master spec",
}

export default async function ProcurementV2Page() {
  const data = await loadProcurementWorkspaceData()
  return (
    <ProcurementScaffold
      title="Procurement (רכש)"
      subtitle="Scaffold: ניהול ספקים ומחירונים, הזמנות רכש, קליטת GRN ותיאום חשבוניות ספק."
      rows={data.rows}
      projects={data.projects}
      suppliers={data.suppliers}
      boqNodes={data.boqNodes}
      lines={data.lines}
      receipts={data.receipts}
      invoices={data.invoices}
      reconciliations={data.reconciliations}
      initialError={data.error}
    />
  )
}
