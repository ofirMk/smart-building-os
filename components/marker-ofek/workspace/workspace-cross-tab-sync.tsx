"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { useWorkspaceBroadcast } from "./smart-workspace-context"

/** רענון נתונים כשחלון אחר משדר עדכון שולחן עבודה */
export function WorkspaceCrossTabSync() {
  const router = useRouter()
  const onMessage = React.useCallback(
    (msg: { type: string }) => {
      if (msg.type === "workspace-invalidate") {
        router.refresh()
      }
    },
    [router]
  )
  useWorkspaceBroadcast(onMessage)
  return null
}
