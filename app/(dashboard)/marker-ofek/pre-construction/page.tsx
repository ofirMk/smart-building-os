import type { Metadata } from "next"

import { PreConstructionDashboard } from "./_components/pre-construction-dashboard"
import { loadPreConstructionDashboardData } from "@/lib/marker-ofek/pre-construction-dashboard-data"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "מרכז שליטה — קדם ביצוע | מרקר אופק",
  description:
    "דשבורד מכרזים: מדדים, שווי צנרת BoQ, והתפלגות סטטוס מסמכים לפני ביצוע.",
}

export default async function PreConstructionPillarPage() {
  const data = await loadPreConstructionDashboardData()

  return <PreConstructionDashboard data={data} />
}
