"use client"

import * as React from "react"
import { useSonner } from "sonner"

import {
  playDiamondErrorThud,
  playDiamondSuccessChime,
} from "@/lib/marker-ofek/diamond-ui-audio"

/**
 * משוב שמיעה ל־toast (Sonner) — מנותק ממיקום ה־Toaster ב־DOM.
 */
export function SonnerAudioBridge() {
  const { toasts } = useSonner()
  const playedRef = React.useRef<Set<string | number>>(new Set())

  React.useEffect(() => {
    const alive = new Set<string | number>(toasts.map((t) => t.id))
    for (const id of playedRef.current) {
      if (!alive.has(id)) playedRef.current.delete(id)
    }
    for (const t of toasts) {
      if (playedRef.current.has(t.id)) continue
      playedRef.current.add(t.id)
      if (t.type === "success") playDiamondSuccessChime()
      else if (t.type === "error") playDiamondErrorThud()
    }
  }, [toasts])

  return null
}
