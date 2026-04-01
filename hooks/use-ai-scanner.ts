"use client"

import * as React from "react"
import { toast } from "sonner"

export type AiScanType = "invoice" | "contract" | "general"

const SIMULATION_WINDOW_MS = 13_000
const TICK_MS = 120
const MAX_SIMULATED_PROGRESS = 88

function statusForType(type: AiScanType, p: number): string {
  if (p < 10) {
    if (type === "invoice") return "מתחיל סריקה..."
    if (type === "contract") return "מתחיל ניתוח חוזה..."
    return "מתחיל עיבוד..."
  }
  if (p < 30) {
    if (type === "invoice") return "מעלה מסמך לכספת הענן..."
    if (type === "contract") return "מעלה מסמך חוזה לכספת המסמכים..."
    return "מעלה קובץ לשרת..."
  }
  if (p < 60) {
    if (type === "invoice") {
      return "מפענח נתונים באמצעות בינה מלאכותית (AI)..."
    }
    if (type === "contract") {
      return "מחלץ סעיפי BoQ, כמויות ואבני דרך מהמסמך..."
    }
    return "מפענח מסמך באמצעות בינה מלאכותית..."
  }
  if (p < 85) {
    if (type === "invoice") {
      return "מזהה ספקים ומנרמל מק\"טים (MDM)..."
    }
    if (type === "contract") {
      return "מזהה התחייבויות, יעדים ומבנה תשלומים..."
    }
    return "מארגן ומנקה נתונים מהמסמך..."
  }
  if (type === "invoice") {
    return "משווה מחירים ושומר נתונים למערכת..."
  }
  if (type === "contract") {
    return "משווה לתקציב פרויקט ומכין שמירה..."
  }
  return "משלים שמירה ואימות נתונים..."
}

export type UseAiScannerReturn = {
  isScanning: boolean
  scanProgress: number
  scanStatus: string
  startScanSimulation: (type: AiScanType) => void
  completeScan: () => void
  resetScan: () => void
  abortScan: () => void
  /** מזהה סשן סריקה — משתנה ב־abort; להשוואה אחרי await כדי להתעלם מתשובה מאוחרת */
  getScanEpoch: () => number
}

/**
 * סימולציית התקדמות אחידה לכל פעולות ה-AI במערכת (חשבוניות, חוזים וכו').
 * ESC מבטל סימולציה ומחזיר למצב הזנה ידנית (ראה abortScan).
 */
export function useAiScanner(): UseAiScannerReturn {
  const [isScanning, setIsScanning] = React.useState(false)
  const [scanProgress, setScanProgress] = React.useState(0)
  const [scanStatus, setScanStatus] = React.useState("")
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const scanTypeRef = React.useRef<AiScanType>("general")
  /** מונה שמתעדכן בתחילת כל סריקה וב־abort — מאפשר להתעלם מתשובות שרת אחרי ביטול */
  const scanEpochRef = React.useRef(0)

  const clearSimulation = React.useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const getScanEpoch = React.useCallback(() => scanEpochRef.current, [])

  const resetScan = React.useCallback(() => {
    clearSimulation()
    setIsScanning(false)
    setScanProgress(0)
    setScanStatus("")
  }, [clearSimulation])

  const abortScan = React.useCallback(() => {
    clearSimulation()
    scanEpochRef.current += 1
    setIsScanning(false)
    setScanProgress(0)
    setScanStatus("")
    toast.message("הסריקה בוטלה — ניתן להזין נתונים ידנית", {
      duration: 3500,
    })
  }, [clearSimulation])

  React.useEffect(() => {
    return () => {
      clearSimulation()
    }
  }, [clearSimulation])

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      if (!isScanning) return
      event.preventDefault()
      abortScan()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [isScanning, abortScan])

  const startScanSimulation = React.useCallback(
    (type: AiScanType) => {
      clearSimulation()
      scanEpochRef.current += 1
      scanTypeRef.current = type
      setIsScanning(true)
      setScanProgress(0)
      setScanStatus(statusForType(type, 0))

      const scanStartedAt = Date.now()

      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - scanStartedAt
        const p = Math.min(
          MAX_SIMULATED_PROGRESS,
          (elapsed / SIMULATION_WINDOW_MS) * MAX_SIMULATED_PROGRESS
        )
        setScanProgress(p)
        setScanStatus(statusForType(scanTypeRef.current, p))
      }, TICK_MS)
    },
    [clearSimulation]
  )

  const completeScan = React.useCallback(() => {
    clearSimulation()
    setScanProgress(100)
    setScanStatus("הסריקה הושלמה בהצלחה!")
  }, [clearSimulation])

  return {
    isScanning,
    scanProgress,
    scanStatus,
    startScanSimulation,
    completeScan,
    resetScan,
    abortScan,
    getScanEpoch,
  }
}
