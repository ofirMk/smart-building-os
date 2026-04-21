import type { Metadata } from "next"

import { PreConstructionDashboard } from "@/components/marker-ofek/pre-construction/pre-construction-dashboard"
import { loadPreConstructionDashboardData } from "@/lib/marker-ofek/pre-construction-dashboard-data"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "מרכז שליטה - קדם ביצוע",
  description:
    "דשבורד מכרזים: מדדים, שווי צנרת BoQ, והתפלגות סטטוס מסמכים לפני ביצוע.",
}

export default async function PreConstructionPillarPage() {
  const data = await loadPreConstructionDashboardData()

  return <PreConstructionDashboard data={data} />
}
