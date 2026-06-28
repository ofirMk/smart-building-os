import { redirect } from "next/navigation"

/**
 * /marker-ofek/procurement/reports → redirect to KPI dashboard (primary report).
 */
export default function ProcurementReportsIndexPage() {
  redirect("/marker-ofek/procurement/reports/kpi")
}
