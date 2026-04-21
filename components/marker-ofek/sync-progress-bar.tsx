"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, n))
}

type SyncProgressBarProps = {
  /** Gantt / field progress (0–100), or null if unknown */
  fieldPercent: number | null
  /** Current billing (נוכחי %) */
  billedPercent: number
  className?: string
}

/**
 * Dual thin bars: field (Gantt) on top, billing below.
 * When field > billed, the excess field segment is amber (unbilled execution).
 */
export function SyncProgressBar({
  fieldPercent,
  billedPercent,
  className,
}: SyncProgressBarProps) {
  const field = fieldPercent != null ? clampPct(fieldPercent) : null
  const billed = clampPct(billedPercent)
  const gap =
    field != null ? Math.round((field - billed) * 100) / 100 : null

  const tooltip =
    field != null
      ? `Field: ${field.toFixed(1)}% | Billed: ${billed.toFixed(1)}% | Gap: ${gap! >= 0 ? "+" : ""}${gap!.toFixed(1)}%`
      : `Field: — | Billed: ${billed.toFixed(1)}% | Gap: —`

  const showFieldBar = field != null && field > 0
  const billedShareOfField =
    field != null && field > 0 ? Math.min(billed, field) / field : 0
  const unbilledShareOfField =
    field != null && field > 0 && field > billed
      ? (field - Math.min(billed, field)) / field
      : 0

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className={cn(
          "w-full max-w-[11rem] cursor-help rounded-md border border-transparent p-1 text-start outline-none transition-colors hover:border-slate-100 hover:bg-background/80",
          className
        )}
      >
        <div className="flex flex-col gap-1">
          <div
            className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
            aria-hidden
          >
            {showFieldBar ? (
              <div
                className="absolute inset-y-0 start-0 flex overflow-hidden rounded-full"
                style={{ width: `${field}%` }}
              >
                {billed > 0 && (
                  <div
                    className="h-full shrink-0 bg-indigo-600"
                    style={{ width: `${billedShareOfField * 100}%` }}
                  />
                )}
                {unbilledShareOfField > 0 && (
                  <div
                    className="h-full bg-amber-500"
                    style={{ width: `${unbilledShareOfField * 100}%` }}
                  />
                )}
              </div>
            ) : null}
          </div>
          <div
            className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
            aria-hidden
          >
            <div
              className="absolute inset-y-0 start-0 rounded-full bg-slate-500"
              style={{ width: `${billed}%` }}
            />
          </div>
          <p className="font-currency-mono text-[10px] leading-tight text-slate-500 tabular-nums">
            {field != null ? (
              <>
                <span className="text-indigo-700">{field.toFixed(1)}%</span>
                <span className="text-slate-400"> · </span>
                <span className="text-slate-600">{billed.toFixed(1)}%</span>
              </>
            ) : (
              <>
                <span className="text-slate-400">— · </span>
                <span className="text-slate-600">{billed.toFixed(1)}%</span>
              </>
            )}
          </p>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[20rem] font-currency-mono text-[11px]">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}
