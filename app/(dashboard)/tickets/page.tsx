import { TicketsManagementView } from "@/components/tickets/tickets-management-view"
import { getBuildingsList } from "@/lib/buildings"
import { getTicketsManagementViewModel } from "@/lib/tickets-management"

export const dynamic = "force-dynamic"

export default async function TicketsPage() {
  const [buildingsRes, ticketsVm] = await Promise.all([
    getBuildingsList(),
    getTicketsManagementViewModel(),
  ])

  const fetchFailed = Boolean(ticketsVm.error)

  return (
    <TicketsManagementView
      buildings={buildingsRes.data ?? []}
      buildingsError={buildingsRes.error}
      rows={fetchFailed ? [] : ticketsVm.rows}
      usedMockFallback={fetchFailed}
      fetchErrorMessage={ticketsVm.error}
    />
  )
}
