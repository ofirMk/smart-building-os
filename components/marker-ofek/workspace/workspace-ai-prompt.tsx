"use client"

import { Sparkles } from "lucide-react"

import type { WorkspaceEfficiencyAnalysis } from "@/lib/marker-ofek/workspace-types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type Props = {
  analysis: WorkspaceEfficiencyAnalysis
  onShowPreview: () => void
  onIgnore: () => void
  onDismissPattern: () => void
  className?: string
}

export function WorkspaceAiPrompt({
  analysis,
  onShowPreview,
  onIgnore,
  onDismissPattern,
  className,
}: Props) {
  return (
    <div
      dir="rtl"
      role="status"
      className={cn(
        "pointer-events-auto rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/95 via-white to-slate-50/90 p-4 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.12)] ring-1 ring-emerald-500/10 backdrop-blur-sm",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-emerald-200/70 bg-card text-emerald-700 shadow-sm">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-800/80">
            עוזר יעילות
          </p>
          <p className="text-sm leading-relaxed text-slate-800">{analysis.summary}</p>
          {analysis.frictionPoints.length > 0 ? (
            <ul className="list-inside list-disc space-y-0.5 text-[12px] text-slate-600">
              {analysis.frictionPoints.slice(0, 4).map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              className="h-8 border-emerald-200 bg-emerald-600 text-white hover:bg-emerald-500"
              onClick={onShowPreview}
            >
              הצג תצוגה מקדימה
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-slate-600 hover:bg-slate-100"
              onClick={onIgnore}
            >
              התעלם
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-slate-200 text-slate-600"
              onClick={onDismissPattern}
            >
              אל תציג שוב דפוס זה
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
