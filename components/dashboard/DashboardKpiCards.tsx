"use client"

import { motion } from "framer-motion"
import { useRouter } from "next/navigation"

import { cn } from "@/lib/utils"

export type DashboardKpiData = {
  facilitiesValue: string
  facilitiesSub: string
  openTicketsValue: string
  openTicketsSub: string
  energyValue: string
  energySub: string
  slaValue: string
  slaSub: string
}

const kpiContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.06,
    },
  },
}

const kpiItem = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.48,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
}

const cardHoverTransition = {
  type: "spring" as const,
  stiffness: 420,
  damping: 28,
}

export function DashboardKpiCards({ p }: { p: DashboardKpiData }) {
  const router = useRouter()

  function handleSlaDoubleClick() {
    router.push("/tickets")
  }

  function handlePowerDoubleClick() {
    router.push("/ev-management")
  }

  function handleTicketsDoubleClick() {
    router.push("/tickets")
  }

  function handleFacilitiesDoubleClick() {
    router.push("/amenities")
  }

  const cardClassName = cn(
    "relative flex min-h-[220px] w-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm",
    "cursor-pointer transition-[border-color,box-shadow] duration-300 ease-out",
    "hover:border-cyan-500/50 hover:shadow-[0_0_20px_rgba(6,182,212,0.15)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
  )

  return (
    <motion.div
      className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4"
      variants={kpiContainer}
      initial="hidden"
      animate="show"
    >
      <motion.div
        role="button"
        tabIndex={0}
        variants={kpiItem}
        whileHover={{ scale: 1.02 }}
        transition={cardHoverTransition}
        className={cardClassName}
        onDoubleClick={handleFacilitiesDoubleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            handleFacilitiesDoubleClick()
          }
        }}
      >
        <div className="absolute end-0 top-0 h-full w-1 bg-green-500" />
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">סטטוס מתקנים</h3>
        <div className="mb-2 text-3xl font-bold text-foreground">{p.facilitiesValue}</div>
        <p className="text-xs text-muted-foreground">{p.facilitiesSub}</p>
      </motion.div>

      <motion.div
        role="button"
        tabIndex={0}
        variants={kpiItem}
        whileHover={{ scale: 1.02 }}
        transition={cardHoverTransition}
        className={cardClassName}
        onDoubleClick={handleTicketsDoubleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            handleTicketsDoubleClick()
          }
        }}
      >
        <div className="absolute end-0 top-0 h-full w-1 bg-red-500" />
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">קריאות שירות פתוחות</h3>
        <div className="mb-2 text-3xl font-bold text-foreground">{p.openTicketsValue}</div>
        <p className="text-xs text-muted-foreground">{p.openTicketsSub}</p>
      </motion.div>

      <motion.div
        role="button"
        tabIndex={0}
        variants={kpiItem}
        whileHover={{ scale: 1.02 }}
        transition={cardHoverTransition}
        className={cardClassName}
        onDoubleClick={handlePowerDoubleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            handlePowerDoubleClick()
          }
        }}
      >
        <div className="absolute end-0 top-0 h-full w-1 bg-yellow-500" />
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">צריכת אנרגיה (החודש)</h3>
        <div className="mb-2 text-3xl font-bold text-foreground">{p.energyValue}</div>
        <p className="text-xs text-muted-foreground">{p.energySub}</p>
      </motion.div>

      <motion.div
        role="button"
        tabIndex={0}
        variants={kpiItem}
        whileHover={{ scale: 1.02 }}
        transition={cardHoverTransition}
        className={cardClassName}
        onDoubleClick={handleSlaDoubleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            handleSlaDoubleClick()
          }
        }}
      >
        <div className="absolute end-0 top-0 h-full w-1 bg-blue-500" />
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">מדד יעילות SLA</h3>
        <div className="mb-2 text-3xl font-bold text-foreground">{p.slaValue}</div>
        <p className="text-xs text-muted-foreground">{p.slaSub}</p>
      </motion.div>
    </motion.div>
  )
}
