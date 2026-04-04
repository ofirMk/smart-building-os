"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import { useModuleVisibilityOptional } from "@/components/marker-ofek/marker-ofek-dashboard-context"

/**
 * Redirects away from routes whose module is disabled (Marker Ofek home as fallback).
 */
export function ModuleRouteGate() {
  const pathname = usePathname() ?? ""
  const router = useRouter()
  const ctx = useModuleVisibilityOptional()

  React.useEffect(() => {
    if (!ctx?.hydrated) return
    const financialPath =
      pathname === "/marker-ofek/partner-finance" ||
      pathname.startsWith("/marker-ofek/partner-finance/") ||
      pathname === "/partner-finance" ||
      pathname.startsWith("/partner-finance/")
    if (financialPath && !ctx.markerAccess.viewFinancials) {
      router.replace("/marker-ofek/command-center")
      return
    }
    if (ctx.isPathAllowed(pathname)) return
    router.replace("/marker-ofek/command-center")
  }, [ctx, pathname, router])

  return null
}
