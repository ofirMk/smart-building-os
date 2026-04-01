"use client"

import { cn } from "@/lib/utils"

export type PowerChartProps = {
  /** ערכי גובה יחסיים 0–100 (למשל מוק או נורמל מקוט״ש) */
  heightsPct: number[]
  /** תווית לכל עמודה (למשל יום 1 או תאריך עברי) */
  labels: string[]
  className?: string
}

const DEFAULT_HEIGHTS = [40, 65, 45, 80, 55, 90, 70] as const

/**
 * גרף עמודות צריכת חשמל — רינדור בצד הלקוח.
 * אזור עמודות בגובה קבוע כדי ש־`height: %` יחושב ביחס לאב מוגדר (לא מתקפל ל־0).
 */
export function PowerChart({ heightsPct, labels, className }: PowerChartProps) {
  const safeHeights =
    heightsPct.length > 0 ? heightsPct : [...DEFAULT_HEIGHTS]
  const safeLabels =
    labels.length >= safeHeights.length
      ? labels
      : [
          ...labels,
          ...Array.from(
            { length: safeHeights.length - labels.length },
            (_, j) => `יום ${labels.length + j + 1}`
          ),
        ]

  return (
    <div
      className={cn(
        "flex h-64 min-h-[250px] w-full items-stretch gap-2 pt-2 md:gap-4",
        className
      )}
    >
      {safeHeights.map((raw, i) => {
        const pct = Math.min(100, Math.max(4, raw))
        const label = safeLabels[i] ?? `יום ${i + 1}`
        return (
          <div
            key={`power-bar-${i}-${label}`}
            className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
          >
            <div className="flex min-h-0 flex-1 flex-col justify-end">
              <div
                className="w-full min-h-[3px] rounded-t-sm bg-gradient-to-t from-blue-950 via-cyan-700 to-cyan-400 shadow-[0_0_18px_-6px_rgba(34,211,238,0.4)] transition-opacity hover:opacity-90"
                style={{ height: `${pct}%` }}
              />
            </div>
            <span className="mt-2 shrink-0 text-center text-[0.65rem] leading-tight text-gray-500 sm:text-xs">
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
