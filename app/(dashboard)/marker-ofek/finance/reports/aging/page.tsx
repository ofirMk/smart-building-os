import type { Metadata } from "next"

import { fetchAgingReport } from "@/lib/marker-ofek/finance-aging-actions"

import { AgingReportClient } from "./aging-report-client"

export const metadata: Metadata = {
  title: "דוח גילוי חובות",
}

export default async function AgingReportPage() {
  const data = await fetchAgingReport()
  return <AgingReportClient initial={data} />
}
