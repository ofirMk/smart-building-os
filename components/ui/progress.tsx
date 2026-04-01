"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export type ProgressProps = React.HTMLAttributes<HTMLDivElement> & {
  value?: number
}

/**
 * פס התקדמות (Shadcn-style) — ללא תלות ב-Radix.
 */
function Progress({
  className,
  value = 0,
  ...props
}: ProgressProps) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/15",
        className
      )}
      {...props}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export { Progress }
