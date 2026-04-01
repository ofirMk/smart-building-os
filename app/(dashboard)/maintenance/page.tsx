import { PreventiveMaintenanceDashboard } from "@/components/maintenance/preventive-maintenance-dashboard"
import {
  PREVENTIVE_MAINTENANCE_ROWS_MOCK,
  PREVENTIVE_MAINTENANCE_SUMMARY_MOCK,
} from "@/components/maintenance/preventive-maintenance-mock-data"

export default function MaintenancePage() {
  return (
    <PreventiveMaintenanceDashboard
      summary={PREVENTIVE_MAINTENANCE_SUMMARY_MOCK}
      rows={PREVENTIVE_MAINTENANCE_ROWS_MOCK}
    />
  )
}
