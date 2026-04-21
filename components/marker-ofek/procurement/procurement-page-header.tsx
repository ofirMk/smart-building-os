import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

import { ProcurementIcon } from "@/components/marker-ofek/procurement/procurement-icon"
import { cn } from "@/lib/utils"

type ProcurementPageHeaderProps = {
  title: string
  subtitle?: string
  kicker?: string
  icon: LucideIcon
  primaryAction?: ReactNode
  /** תג או כפתור עזרה ליד הכותרת (למשל הבחנה קטלוג/גיליון) */
  titleAddon?: ReactNode
  className?: string
}

export function ProcurementPageHeader({
  title,
  subtitle,
  kicker,
  icon,
  primaryAction,
  titleAddon,
  className,
}: ProcurementPageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-slate-100 bg-card p-6 md:flex-row md:items-center md:justify-between md:p-8",
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-card">
          <ProcurementIcon icon={icon} className="size-6" />
        </div>
        <div className="min-w-0 space-y-1">
          {kicker ? (
            <p className="text-xs font-medium uppercase tracking-wider text-indigo-600">{kicker}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-pretty text-2xl font-bold tracking-tight text-[#1e293b] md:text-3xl">
              {title}
            </h1>
            {titleAddon}
          </div>
          {subtitle ? (
            <p className="max-w-2xl text-sm leading-relaxed text-slate-500">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {primaryAction ? (
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {primaryAction}
        </div>
      ) : null}
    </header>
  )
}
