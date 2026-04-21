import * as React from "react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

function formatOneDecimal(value: number): string {
  return Number(value || 0).toLocaleString("he-IL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

export function BentoMetricCard({
  label,
  value,
  suffix,
  subLabel,
  className,
  valueClassName,
}: {
  label: string
  value: number
  suffix?: string
  subLabel?: string
  className?: string
  valueClassName?: string
}) {
  return (
    <Card className={cn("rounded-xl border-slate-200 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>
      <CardContent className="space-y-1 px-3 py-2">
        <p className="text-[11px] text-slate-500">{label}</p>
        <p className={cn("font-mono text-sm font-semibold text-foreground", valueClassName)}>
          {formatOneDecimal(value)}
          {suffix ? ` ${suffix}` : ""}
        </p>
        {subLabel ? <p className="text-[11px] text-slate-500">{subLabel}</p> : null}
      </CardContent>
    </Card>
  )
}
