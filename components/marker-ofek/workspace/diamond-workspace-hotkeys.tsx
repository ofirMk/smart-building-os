"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { useSmartWorkspace } from "./smart-workspace-context"

function shouldIgnoreHotkeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable=true], [data-hotkeys-ignore], [role='textbox']"
    )
  )
}

/** קיצורי Diamond Workstation — לוכדים ב־capture כדי לעקוף Tab של הדפדפן כשאפשר */
export function DiamondWorkspaceHotkeys() {
  const pathname = usePathname() ?? ""
  const ws = useSmartWorkspace()

  React.useEffect(() => {
    if (!pathname.startsWith("/marker-ofek") || !ws) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreHotkeys(e.target)) return

      if (e.ctrlKey && !e.altKey && !e.metaKey && e.key === "Tab") {
        e.preventDefault()
        e.stopImmediatePropagation()
        if (e.shiftKey) ws.cycleWorkspaceTab(-1)
        else ws.cycleWorkspaceTab(1)
        return
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault()
        ws.activateWorkspaceTabIndex(parseInt(e.key, 10) - 1)
        return
      }

      if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === "q" || e.key === "Q")) {
        e.preventDefault()
        ws.closeCurrentWorkspaceTab()
        return
      }

      if (
        e.ctrlKey &&
        !e.shiftKey &&
        !e.altKey &&
        (e.key === "\\" || e.code === "Backslash" || e.key === "|")
      ) {
        e.preventDefault()
        ws.toggleSplitViewHotkey()
        return
      }
    }

    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [pathname, ws])

  return null
}
