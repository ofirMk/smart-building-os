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
  const idle = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (!pathname.startsWith("/marker-ofek") && !pathname.startsWith("/partner-finance")) {
      return
    }
    if (pathname === "/marker-ofek/command-center") {
      return
    }
    if (timer.current) clearTimeout(timer.current)
    if (idle.current != null && "cancelIdleCallback" in window) {
      window.cancelIdleCallback(idle.current)
      idle.current = null
    }
    timer.current = setTimeout(() => {
      if (lastSent.current === pathname) return
      const write = () => {
        lastSent.current = pathname
        void recordLastDashboardVisit(pathname)
      }
      if ("requestIdleCallback" in window) {
        idle.current = window.requestIdleCallback(write, { timeout: 1200 })
      } else {
        write()
      }
    }, 1200)
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (idle.current != null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idle.current)
        idle.current = null
      }
    }
  }, [pathname])

  return null
}
