import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { DiamondStandardDashboardV1 } from "@/components/dashboard/diamond-standard-dashboard-v1"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"

/**
 * דשבורד ראשי `/dashboard` — סטנדרט יהלום V1.0 (Pharmacy Clean, RTL).
 * היררכיה: Pulse → ליבה → תרשימי הנהלה → משימות (אקורדיון, סגור כברירת מחדל).
 */
export default async function DashboardHomePage() {
  const cookieStore = await cookies()
  const selectedCompany = resolveCompanyContext(
    cookieStore.get(COMPANY_COOKIE_KEY)?.value
  )
  if (!selectedCompany) {
    redirect("/")
  }
  if (selectedCompany === "holden_group") {
    redirect("/holden")
  }
  if (selectedCompany === "building_management_co") {
    redirect("/facility")
  }
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background text-foreground">
      <DiamondStandardDashboardV1 />
    </div>
  )
}
