"use client"

import type { BuildingStructureRawData } from "@/lib/marker-ofek/tender-intake-types"
import { cn } from "@/lib/utils"

function parseBuildingData(
  raw: unknown
): BuildingStructureRawData {
  if (!raw || typeof raw !== "object") {
    return { summary_he: "", segments: [] }
  }
  const o = raw as Record<string, unknown>
  const summary_he =
    typeof o.summary_he === "string" ? o.summary_he : ""
  const rawSegs = Array.isArray(o.segments) ? o.segments : []
  const segments = rawSegs
    .map((row, i) => {
      if (!row || typeof row !== "object") return null
      const r = row as Record<string, unknown>
      return {
        id: String(r.id ?? `s-${i}`),
        label_he: String(r.label_he ?? r.label ?? `קטע ${i + 1}`),
        segment_type: String(r.segment_type ?? "other"),
        order_from_top:
          typeof r.order_from_top === "number" ? r.order_from_top : i,
        floor_range:
          typeof r.floor_range === "string" ? r.floor_range : undefined,
        notes: typeof r.notes === "string" ? r.notes : undefined,
      }
    })
    .filter(Boolean) as BuildingStructureRawData["segments"]

  segments.sort((a, b) => a.order_from_top - b.order_from_top)

  const seenLabels = new Set<string>()
  const uniqueSegments = segments.filter((seg) => {
    const k = seg.label_he.trim().toLowerCase()
    if (seenLabels.has(k)) return false
    seenLabels.add(k)
    return true
  })

  return { summary_he, segments: uniqueSegments }
}

const segmentWidth: Record<string, string> = {
  roof: "w-full max-w-[220px]",
  residential: "w-full max-w-[280px]",
  parking: "w-full max-w-[260px]",
  ground: "w-full max-w-[240px]",
  commercial: "w-full max-w-[270px]",
  basement: "w-full max-w-[250px]",
  mechanical: "w-full max-w-[200px]",
  other: "w-full max-w-[240px]",
}

export function TenderBuildingVisualization({
  data,
  className,
}: {
  data: unknown
  className?: string
}) {
  const { summary_he, segments } = parseBuildingData(data)

  if (segments.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground",
          className
        )}
      >
        אין עדיין מודל אנכי. לאחר ניתוח מסמכים יוצג כאן תרשים קומות (גג →
        מרתף).
      </div>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      {summary_he ? (
        <p className="text-sm text-muted-foreground">{summary_he}</p>
      ) : null}
      <div className="flex flex-col items-center gap-2 py-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          גג ← מרתף
        </p>
        <div className="flex w-full max-w-sm flex-col items-center gap-2">
          {segments.map((seg, index) => (
            <div
              key={`${seg.order_from_top}-${seg.id}-${index}`}
              className={cn(
                "rounded-md border bg-card px-4 py-3 text-center shadow-sm transition-colors",
                segmentWidth[seg.segment_type] ?? segmentWidth.other
              )}
            >
              <div className="text-sm font-semibold leading-tight">
                {seg.label_he}
              </div>
              {seg.floor_range ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  {seg.floor_range}
                </div>
              ) : null}
              <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                {seg.segment_type}
              </div>
              {seg.notes ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  {seg.notes}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
