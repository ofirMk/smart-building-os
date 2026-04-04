"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { recordLastDashboardVisit } from "@/lib/marker-ofek/user-dashboard-config-actions"

/**
 * שומר את נתיב ה־ERP האחרון (למעט מרכז הפיקוד) לכרטיס "ברוך שובך".
 */
export function DashboardLastVisitTracker() {
  const pathname = usePathname() ?? ""
  const lastSent = React.useRef<string | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    if (!pathname.startsWith("/marker-ofek") && !pathname.startsWith("/partner-finance")) {
      return
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (lastSent.current === pathname) return
      lastSent.current = pathname
      void recordLastDashboardVisit(pathname)
    }, 800)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [pathname])

  return null
}
