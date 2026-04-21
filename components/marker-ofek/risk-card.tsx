"use client"

import { AlertTriangle, Info, ShieldCheck } from "lucide-react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface RiskCardProps {
  title: string
  level: "High" | "Medium" | "Low"
  source: string
  recommendation: string
  /** אם המקור הוא קישור ישיר (למשל עוגן ב-PDF) */
  sourceHref?: string
}

const LEVEL_LABEL_HE: Record<RiskCardProps["level"], string> = {
  High: "חומרה גבוהה",
  Medium: "בינוני",
  Low: "נמוך",
}

export function RiskCard({
  title,
  level,
  source,
  recommendation,
  sourceHref,
}: RiskCardProps) {
  const styles = {
    High: "border-s-red-600 bg-red-50 text-red-900",
    Medium: "border-s-amber-500 bg-amber-50 text-amber-900",
    Low: "border-s-blue-500 bg-blue-50 text-blue-900",
  }

  const sourceIsUrl = /^https?:\/\//i.test(source.trim())
  const href = sourceHref ?? (sourceIsUrl ? source.trim() : undefined)

  const LevelIcon =
    level === "High" ? (
      <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden />
    ) : level === "Low" ? (
      <Info className="h-4 w-4 text-blue-600" aria-hidden />
    ) : (
      <Info className="h-4 w-4 text-amber-600" aria-hidden />
    )

  return (
    <Card
      className={`border-s-4 ${styles[level]} mb-3 shadow-sm transition-all hover:scale-[1.01]`}
    >
      <CardHeader className="p-3 pb-1">
        <CardTitle className="flex items-center gap-2 text-sm font-bold">
          {LevelIcon}
          <span className="min-w-0 flex-1">{title}</span>
          <span className="shrink-0 rounded-full bg-card/70 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {LEVEL_LABEL_HE[level]}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 text-[11px] leading-relaxed">
        <p className="mb-2 text-slate-600">
          <span className="font-medium text-slate-500">מקור בחוזה: </span>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-blue-700 underline underline-offset-2 hover:text-blue-900"
            >
              {sourceIsUrl ? source.trim() : source}
            </a>
          ) : (
            <span className="opacity-90 italic">&quot;{source}&quot;</span>
          )}
        </p>
        <div className="flex items-start gap-1 font-bold text-blue-800">
          <ShieldCheck className="h-3 w-3 mt-0.5 shrink-0" aria-hidden />
          <span>המלצה: {recommendation}</span>
        </div>
      </CardContent>
    </Card>
  )
}
