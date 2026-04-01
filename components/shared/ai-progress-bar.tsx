"use client"

import { Progress } from "@/components/ui/progress"

export type AiProgressBarProps = {
  isScanning: boolean
  progress: number
  status: string
}

/**
 * פס התקדמות אחיד לסריקות AI — מוצג רק בזמן סריקה פעילה.
 */
export function AiProgressBar({
  isScanning,
  progress,
  status,
}: AiProgressBarProps) {
  if (!isScanning) return null

  return (
    <div className="mt-4 w-full space-y-2">
      <Progress value={progress} className="h-2.5" />
      <p className="animate-pulse text-center text-sm text-muted-foreground">
        {status}
      </p>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        לחץ על ESC כדי לבטל ולהזין נתונים ידנית
      </p>
    </div>
  )
}
