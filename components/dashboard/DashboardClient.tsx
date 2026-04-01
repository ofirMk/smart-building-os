"use client"

import { motion } from "framer-motion"

import { PowerChart } from "@/components/charts/PowerChart"
import { DashboardKpiCards, type DashboardKpiData } from "@/components/dashboard/DashboardKpiCards"

export type DashboardClientData = DashboardKpiData & {
  powerHeightsPct: number[]
  powerLabels: string[]
  buildingRows: Array<{ label: string; percentage: number; barColor: string }>
}

/** Delay so charts appear after KPI stagger (~4 cards × stagger + entrance). */
const CHARTS_ENTRANCE_DELAY_SEC = 0.72

const chartsEase = [0.22, 1, 0.36, 1] as const

export function DashboardClient({ data }: { data: DashboardClientData }) {
  return (
    <div
      className="-mx-4 min-h-[calc(100vh-3.5rem)] bg-[#0a0a0a] px-4 py-6 font-sans text-gray-100 md:-mx-6 md:px-6 md:py-10"
      dir="rtl"
    >
      <header className="mb-10 border-b border-gray-800 pb-6">
        <h1 className="mb-2 bg-gradient-to-l from-cyan-400 to-blue-600 bg-clip-text text-3xl font-bold text-transparent md:text-4xl">
          מרקר אופק — מרכז פיקוד נכסים
        </h1>
        <p className="text-gray-400">
          פרויקט אשקלון | 4 בנייני מגורים, 16 קומות | מבט על בזמן אמת
        </p>
      </header>

      <DashboardKpiCards
        p={{
          facilitiesValue: data.facilitiesValue,
          facilitiesSub: data.facilitiesSub,
          openTicketsValue: data.openTicketsValue,
          openTicketsSub: data.openTicketsSub,
          energyValue: data.energyValue,
          energySub: data.energySub,
          slaValue: data.slaValue,
          slaSub: data.slaSub,
        }}
      />

      <motion.div
        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.58,
          delay: CHARTS_ENTRANCE_DELAY_SEC,
          ease: chartsEase,
        }}
      >
        <div className="rounded-2xl border border-gray-800 bg-[#111111] p-6 shadow-lg">
          <h2 className="mb-6 flex items-center gap-2 text-xl font-semibold">
            <span className="inline-block h-6 w-2 rounded-full bg-cyan-500" />
            צריכת חשמל (7 ימים אחרונים)
          </h2>
          <PowerChart heightsPct={data.powerHeightsPct} labels={data.powerLabels} />
        </div>

        <div className="rounded-2xl border border-gray-800 bg-[#111111] p-6 shadow-lg">
          <h2 className="mb-6 flex items-center gap-2 text-xl font-semibold">
            <span className="inline-block h-6 w-2 rounded-full bg-blue-500" />
            פילוח קריאות לפי בניין
          </h2>
          <div className="space-y-4 pt-2">
            {data.buildingRows.map((row) => (
              <ProgressBar
                key={row.label}
                label={row.label}
                percentage={row.percentage}
                color={row.barColor}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function ProgressBar({
  label,
  percentage,
  color,
}: {
  label: string
  percentage: number
  color: string
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm text-gray-400">
        <span>{label}</span>
        <span>{percentage}%</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-gray-800">
        <div
          className={`h-2.5 rounded-full ${color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
