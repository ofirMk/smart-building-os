import * as React from "react"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { cn } from "@/lib/utils"

export type ErpBreadcrumbItem = { label: string; href?: string | null }

/** Page column for master–detail screens (on bg-slate-50 shell). */
export function ErpMasterDetailLayout({
  children,
  className,
  title,
  subtitle,
  status,
}: {
  children: React.ReactNode
  className?: string
  /** כותרת עליונה אופציונלית (למסכים פשוטים ללא breadcrumbs מלאים) */
  title?: string
  subtitle?: string
  /** תווית סטטוס (למשל «פעיל») */
  status?: string
}) {
  return (
    <div
      dir="rtl"
      lang="he"
      className={cn(
        "mx-auto flex w-full max-w-6xl flex-col gap-5 pb-12 pt-1",
        className
      )}
    >
      {title ? (
        <header className="border-b border-slate-100 pb-4 text-start dark:border-slate-800">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl dark:text-slate-50">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
            {status ? (
              <span className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                {status}
              </span>
            ) : null}
          </div>
        </header>
      ) : null}
      {children}
    </div>
  )
}

export function ErpMasterDetailBreadcrumbs({
  items,
  className,
}: {
  items: ErpBreadcrumbItem[]
  className?: string
}) {
  return (
    <nav
      aria-label="מיקום במערכת"
      className={cn(
        "flex flex-wrap items-center gap-1 text-[12px] text-muted-foreground",
        className
      )}
    >
      {items.map((item, idx) => (
        <span
          key={`${item.label}-${idx}`}
          className="inline-flex items-center gap-1"
        >
          {idx > 0 ? (
            <ChevronLeft className="size-3 opacity-60" aria-hidden />
          ) : null}
          {item.href ? (
            <Link
              href={item.href}
              className="transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

export function ErpMasterDetailPageHeader({
  breadcrumbs,
  title,
  subtitle,
  actions,
  className,
}: {
  breadcrumbs: ErpBreadcrumbItem[]
  title: string
  subtitle?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-slate-800",
        className
      )}
    >
      <ErpMasterDetailBreadcrumbs items={breadcrumbs} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 text-start">
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl dark:text-slate-50">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  )
}

/** Master form card — white surface, dense grid inside (Gold Standard: p-6). */
export function ErpMasterCard({
  title,
  children,
  className,
}: {
  title?: string
  children: React.ReactNode
  className?: string
}) {
  const headingId = React.useId()
  return (
    <section
      className={cn(
        "rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-950",
        className
      )}
      aria-labelledby={title ? headingId : undefined}
    >
      {title ? (
        <h2
          id={headingId}
          className="mb-4 text-[13px] font-semibold text-slate-800 dark:text-slate-100"
        >
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  )
}

/** Card shell around Shadcn Tabs — detail band below master. */
export function ErpTabsWrapper({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700/80 dark:bg-slate-950",
        className
      )}
    >
      {children}
    </section>
  )
}
