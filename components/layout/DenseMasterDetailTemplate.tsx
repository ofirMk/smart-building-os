/**
 * DenseMasterDetailTemplate — global ERP shell (wide, data-dense, master/detail).
 *
 * How to use on new screens:
 * 1. Wrap the page body in this component (not the full dashboard shell).
 * 2. Pass `title` + optional `description`, `backLink`, `headerActions`, `leading` (icon).
 * 3. Master: primary fields or metadata. Put `<Tabs>` here (from `@/components/ui/tabs`) for
 *    secondary groupings — keep tab list height compact (`h-8` triggers via Tabs primitives).
 * 4. Detail: line grids, tables, subforms — use `DenseDetailPanel` for consistent borders.
 * 5. Apply density to controls: `ERP_DENSE_INPUT_CLASS`, `ERP_DENSE_LABEL_CLASS`, small buttons (`size="sm"`).
 * 6. Avoid `max-w-*` on inner forms unless necessary; the outer container is full width.
 */

"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"

/** Classic ERP control density — pass to Input, SelectTrigger, etc. */
export const ERP_DENSE_INPUT_CLASS =
  "h-8 min-h-8 px-2 py-1 text-sm leading-tight"

export const ERP_DENSE_LABEL_CLASS =
  "text-xs font-medium leading-none text-muted-foreground"

export const ERP_DENSE_SECTION_GAP = "gap-1.5"

export type DenseMasterDetailTemplateProps = {
  /** Usually "rtl" for Marker Ofek */
  dir?: "rtl" | "ltr"
  /** Screen title (entity / document name) */
  title: string
  /** Eyebrow above title, e.g. module name */
  eyebrow?: string
  /** Subtitle under title */
  description?: string
  /** Optional icon or badge to the left of the title block (RTL) */
  leading?: React.ReactNode
  backLink?: { href: string; label: string }
  /** Primary actions (Save, New, …) — rendered in header row */
  headerActions?: React.ReactNode
  /** Master band: tabs + key fields */
  master: React.ReactNode
  /** Detail band: grids / tables */
  detail: React.ReactNode
  /** Optional footer row (e.g. sticky actions) */
  footer?: React.ReactNode
  className?: string
}

export function DenseMasterDetailTemplate({
  dir = "rtl",
  title,
  eyebrow,
  description,
  leading,
  backLink,
  headerActions,
  master,
  detail,
  footer,
  className,
}: DenseMasterDetailTemplateProps) {
  return (
    <div
      dir={dir}
      lang={dir === "rtl" ? "he" : undefined}
      className={cn(
        "flex w-full min-w-0 max-w-none flex-col",
        "gap-1.5 px-2 pb-3 pt-1 md:px-3",
        "bg-white text-sm text-slate-900 antialiased dark:!bg-white dark:!text-slate-900",
        className
      )}
    >
      {backLink ? (
        <Link
          href={backLink.href}
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowRight className="size-3.5 shrink-0 rotate-180" aria-hidden />
          {backLink.label}
        </Link>
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border/80 pb-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {leading ? (
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/80 text-primary [&_svg]:size-5">
              {leading}
            </div>
          ) : null}
          <div className="min-w-0 text-start">
            {eyebrow ? (
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="truncate text-base font-semibold leading-tight tracking-tight md:text-lg">
              {title}
            </h1>
            {description ? (
              <p className="mt-0.5 max-w-4xl text-xs leading-snug text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {headerActions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">{headerActions}</div>
        ) : null}
      </header>

      <DenseMasterPanel>{master}</DenseMasterPanel>

      <DenseDetailPanel>{detail}</DenseDetailPanel>

      {footer ? (
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border/80 pt-2">
          {footer}
        </footer>
      ) : null}
    </div>
  )
}

/** Master region — tabs + header fields; tight padding */
export function DenseMasterPanel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      aria-label="אזור ראשי"
      className={cn(
        "min-h-0 rounded-md border border-slate-200/90 bg-slate-50/80 p-2 shadow-sm dark:border-border/70 dark:bg-card/40",
        className
      )}
    >
      {children}
    </section>
  )
}

/** Detail region — tables / line editors */
export function DenseDetailPanel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      aria-label="פירוט שורות"
      className={cn(
        "min-h-0 flex-1 overflow-hidden rounded-md border border-slate-200/90 bg-white p-1.5 shadow-sm dark:border-border/70 dark:bg-card/30",
        className
      )}
    >
      {children}
    </section>
  )
}
