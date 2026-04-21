"use client"

import * as React from "react"
import { FlaskConical, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  HOLDEN_SLATE_BUTTON_GHOST,
  HOLDEN_SLATE_BUTTON_OUTLINE,
} from "@/lib/theme/holden-slate"
import { cn } from "@/lib/utils"

type SimulationModeToggleProps = {
  enabled: boolean
  dirtyCount: number
  onToggle: (next: boolean) => void
  onReset: () => void
  className?: string
}

export function SimulationModeToggle({
  enabled,
  dirtyCount,
  onToggle,
  onReset,
  className,
}: SimulationModeToggleProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-card p-1 shadow-[0_1px_0_rgba(15,23,42,0.04)]",
        enabled && "border-amber-200 bg-amber-50/60",
        className
      )}
      role="group"
      aria-label="Simulation mode"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onToggle(!enabled)}
        className={cn(
          HOLDEN_SLATE_BUTTON_OUTLINE,
          enabled
            ? "border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-100"
            : undefined
        )}
      >
        <FlaskConical className="me-1 size-3.5" />
        {enabled ? "Simulation: ON" : "Simulation: OFF"}
      </Button>

      {enabled ? (
        <>
          <span className="rounded-md bg-amber-200/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-900">
            {dirtyCount} edits
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={dirtyCount === 0}
            className={HOLDEN_SLATE_BUTTON_GHOST}
          >
            <RotateCcw className="me-1 size-3.5" />
            Reset
          </Button>
        </>
      ) : null}
    </div>
  )
}
