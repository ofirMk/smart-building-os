import { EvManagementTabs } from "@/components/ev-management/ev-management-tabs"
import {
  getEvChargingSessionsWithSpots,
  getEvMonthlyBillsWithSpots,
} from "@/lib/ev-management"

export async function EvManagementContent() {
  const [sessionsRes, billsRes] = await Promise.all([
    getEvChargingSessionsWithSpots(),
    getEvMonthlyBillsWithSpots(),
  ])

  return (
    <EvManagementTabs
      sessions={sessionsRes.data}
      bills={billsRes.data}
      sessionsError={sessionsRes.error}
      billsError={billsRes.error}
    />
  )
}
