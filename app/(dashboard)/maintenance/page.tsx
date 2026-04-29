import type { PreventiveMaintenanceSummaryMock } from "@/components/maintenance/preventive-maintenance-mock-data"
import { PreventiveMaintenanceDashboard } from "@/components/maintenance/preventive-maintenance-dashboard"

const emptySummary: PreventiveMaintenanceSummaryMock = {
  maintenancesThisMonth: 0,
  expiringContractsSoon: 0,
  activeVendors: 0,
}

export default function MaintenancePage() {
  return (
    <PreventiveMaintenanceDashboard
      summary={emptySummary}
      rows={[]}
    />
  )
}
