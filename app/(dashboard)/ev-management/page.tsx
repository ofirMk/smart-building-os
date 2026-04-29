import type { EvEnergySummaryMock } from "@/components/ev-management/ev-meters-mock-data"
import { EvEnergyMetersDashboard } from "@/components/ev-management/ev-energy-meters-dashboard"

const emptySummary: EvEnergySummaryMock = {
  totalConsumptionMonthKwh: 0,
  estimatedRevenueNis: 0,
  activeChargers: 0,
  totalChargerSlots: 0,
}

export default function EvManagementPage() {
  return (
    <EvEnergyMetersDashboard
      summary={emptySummary}
      meters={[]}
      initialUnassignedPool={[]}
      tenantAssignOptions={[]}
    />
  )
}
