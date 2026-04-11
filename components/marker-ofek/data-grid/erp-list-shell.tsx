import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"

/** RTL page column for MDM / ERP list screens (sits on bg-slate-50 shell). */
export function ErpListPageRoot({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      dir="rtl"
      lang="he"
      className={cn(
        "mx-auto flex w-full max-w-6xl flex-col gap-4 pb-12 pt-1",
        className
      )}
    >
      {children}
    </div>
  )
}

export function ErpListBackLink({
  href,
  children,
  className,
}: {
  href: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
        className
      )}
    >
      <ArrowRight className="size-4 rotate-180" aria-hidden />
      {children}
    </Link>
  )
}

/** Top row: title block (visual right in RTL) + actions (visual left). */
export function ErpListHeaderRow({
  titleBlock,
  actions,
  className,
}: {
  titleBlock: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 flex-1">{titleBlock}</div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  )
}

export function ErpListTitleBlock({
  title,
  description,
  icon,
  className,
}: {
  title: string
  description?: string
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      {icon ? (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-800">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Filters / tabs row + search. Put filter chips or a Select in `filterSlot`.
 * Search uses full width on small screens; aligns end on larger.
 */
export function ErpListToolbar({
  filterSlot,
  searchSlot,
  className,
}: {
  filterSlot?: React.ReactNode
  searchSlot: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        className
      )}
    >
      {filterSlot ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">{filterSlot}</div>
      ) : (
        <div />
      )}
      <div className="relative w-full min-w-0 max-w-md sm:ms-auto">{searchSlot}</div>
    </div>
  )
}

/** White card shell — contrasts with slate-50 app background. */
export function ErpDataCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm",
        className
      )}
    >
      {children}
    </div>
  )
}
