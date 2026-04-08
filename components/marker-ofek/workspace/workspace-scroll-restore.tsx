"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import type { WorkspaceSettingsSnapshot } from "@/lib/marker-ofek/workspace-types"

function normPath(p: string): string {
  return p.replace(/\/$/, "") || "/"
}

/**
 * משחזר גלילה לפי נתיב מהצילום האחרון ב־user_workspace_settings.settings.diamondUi.scrollByPath
 */
export function WorkspaceScrollRestore({
  initialWorkspace,
}: {
  initialWorkspace: WorkspaceSettingsSnapshot
}) {
  const pathname = usePathname() ?? "/"
  const scrollMap = initialWorkspace.uiSettings?.scrollByPath
  const y = scrollMap?.[normPath(pathname)]

  React.useEffect(() => {
    if (typeof y !== "number" || !Number.isFinite(y) || y < 8) return
    const id = requestAnimationFrame(() => {
      window.scrollTo({ top: y, behavior: "auto" })
    })
    return () => cancelAnimationFrame(id)
  }, [pathname, y])

  return null
}
