import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { DiamondStandardDashboardV1 } from "@/components/dashboard/diamond-standard-dashboard-v1"

/**
 * דשבורד ראשי `/dashboard` — סטנדרט יהלום V1.0 (Pharmacy Clean, RTL).
 * היררכיה: Pulse → ליבה → תרשימי הנהלה → משימות (אקורדיון, סגור כברירת מחדל).
 */
export default async function DashboardHomePage() {
  const cookieStore = await cookies()
  const selectedCompany = cookieStore.get("selected_company")?.value
  if (!selectedCompany) {
    redirect("/")
  }
  if (selectedCompany === "holden_group") {
    redirect("/holden")
  }
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background text-foreground">
      <DiamondStandardDashboardV1 />
    </div>
  )
}
