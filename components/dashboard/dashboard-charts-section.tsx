"use client"

import * as React from "react"

import { EvEnergyChart } from "@/components/dashboard/ev-energy-chart"
import { TicketsStatusChart } from "@/components/dashboard/tickets-status-chart"
import type {
  EvDailyKwhDatum,
  TicketStatusDatum,
} from "@/lib/dashboard-charts-data"

type DashboardChartsSectionProps = {
  ticketsByStatus: TicketStatusDatum[]
  evDailyKwh: EvDailyKwhDatum[]
}

const skeleton = (
  <div className="grid animate-pulse grid-cols-1 gap-4 md:grid-cols-2">
    <div className="h-[380px] rounded-xl border border-border/60 bg-muted/25" />
    <div className="h-[380px] rounded-xl border border-border/60 bg-muted/25" />
  </div>
)

/**
 * Recharts מודד רוחב/גובה ב-DOM; עיכוב עד אחרי mount מונע אזהרות width/height -1 ב-SSR/הידרציה.
 */
export function DashboardChartsSection({
  ticketsByStatus,
  evDailyKwh,
}: DashboardChartsSectionProps) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return skeleton
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <TicketsStatusChart data={ticketsByStatus} />
      <EvEnergyChart data={evDailyKwh} />
    </div>
  )
}
