import { EvEnergyMetersDashboard } from "@/components/ev-management/ev-energy-meters-dashboard"
import {
  EV_ENERGY_SUMMARY_MOCK,
  EV_SMART_METERS_MOCK,
  EV_TENANT_ASSIGN_OPTIONS,
  EV_UNASSIGNED_POOL_MOCK,
} from "@/components/ev-management/ev-meters-mock-data"

export default function EvManagementPage() {
  return (
    <EvEnergyMetersDashboard
      summary={EV_ENERGY_SUMMARY_MOCK}
      meters={EV_SMART_METERS_MOCK}
      initialUnassignedPool={EV_UNASSIGNED_POOL_MOCK}
      tenantAssignOptions={EV_TENANT_ASSIGN_OPTIONS}
    />
  )
}
