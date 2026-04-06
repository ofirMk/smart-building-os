"use client"

import * as React from "react"
import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

const severityStyles = {
  critical: {
    border: "border-s-red-500",
    bg: "bg-red-50/30",
    icon: "text-red-600",
  },
  warning: {
    border: "border-s-amber-500",
    bg: "bg-amber-50/30",
    icon: "text-amber-600",
  },
} as const

export type LegalRiskSidebarCardProps = {
  title: string
  severity?: keyof typeof severityStyles
  children: React.ReactNode
  /** טקסט לכפתור ניסוח חלופי (למשל מה-Agent) */
  alternativeActionLabel?: string
  onAlternativeAction?: () => void
}

export function LegalRiskSidebarCard({
  title,
  severity = "critical",
  children,
  alternativeActionLabel,
  onAlternativeAction,
}: LegalRiskSidebarCardProps) {
  const s = severityStyles[severity]

  return (
    <Card className={cn("border-s-4 shadow-sm", s.border, s.bg)}>
      <CardHeader className="p-3">
        <CardTitle className="flex items-center gap-2 text-sm font-bold">
          <AlertTriangle className={cn("h-4 w-4 shrink-0", s.icon)} aria-hidden />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-3 pt-0">
        <div className="text-xs text-slate-700">{children}</div>
        {alternativeActionLabel ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-[10px] text-blue-600"
            onClick={onAlternativeAction}
          >
            {alternativeActionLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
