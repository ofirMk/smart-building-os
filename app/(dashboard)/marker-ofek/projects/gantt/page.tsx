import { GanttChartSquare } from "lucide-react"

import { fetchGanttManagementList } from "@/app/actions/gantt-actions"
import { DenseMasterDetailTemplate } from "@/components/layout/DenseMasterDetailTemplate"
import { GanttInvestorHero } from "@/components/marker-ofek/pitch/gantt-investor-hero"
import { GanttPortfolioClient } from "@/components/marker-ofek/projects/gantt-portfolio-client"

export default async function MarkerOfekProjectsGanttPage() {
  const rows = await fetchGanttManagementList()

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <GanttInvestorHero />
      <DenseMasterDetailTemplate
        dir="rtl"
        eyebrow="Marker Ofek · Projects"
        title="ניהול תרשימי גאנט"
        description="יצירה, פתיחה וניהול לוחות זמנים מרובים לכל פרויקט."
        leading={<GanttChartSquare aria-hidden />}
        master={
          <div className="flex items-center justify-between gap-2 px-1 py-0.5">
            <p className="text-xs text-slate-600">
              ארכיטקטורת Multi-Gantt — כל פרויקט יכול להחזיק מספר לוחות זמנים.
            </p>
          </div>
        }
        detail={<GanttPortfolioClient initialRows={rows} />}
      />
    </div>
  )
}
