import { ErpModuleHub } from "@/components/marker-ofek/erp-module-hub"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

/** דשבורד ראשי — מרכז פיקוד מודולרי של מרקר אופק */
export default async function MarkerOfekCommandCenterPage() {
  const cookieStore = await cookies()
  const selectedCompany = cookieStore.get("selected_company")?.value
  if (!selectedCompany) {
    redirect("/")
  }
  if (selectedCompany === "holden_group") {
    redirect("/dashboard/holden")
  }
  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 py-6 md:px-6 md:py-8">
      <ErpModuleHub />
    </div>
  )
}
