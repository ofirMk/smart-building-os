"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * מסך מסמך Diamond: בעברית RTL — עמודה ראשונה (ימין) טפסים, שנייה (שמאל) תצוגת A4.
 */
export function HoldenSplitDocumentShell({
  title,
  subtitle,
  rightPane,
  leftPane,
  className,
}: {
  title: string
  subtitle?: string
  rightPane: React.ReactNode
  leftPane: React.ReactNode
  className?: string
}) {
  return (
    <div
      dir="rtl"
      lang="he"
      className={cn(
        "flex-1 min-h-0 bg-slate-950 text-slate-100",
        className
      )}
    >
      <header className="border-b border-slate-800/80 px-4 py-4 md:px-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-500/90">
          Holden ERP
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-50 md:text-2xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
        ) : null}
      </header>

      <div className="grid gap-6 px-4 py-6 lg:grid-cols-2 lg:gap-8 lg:px-8">
        <section className="order-1 flex min-h-0 flex-col gap-4 lg:order-1">{rightPane}</section>
        <section className="order-2 flex min-h-0 justify-center lg:order-2 lg:justify-start">
          {leftPane}
        </section>
      </div>
    </div>
  )
}

export function HoldenA4Paper({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "w-full max-w-[210mm] rounded-sm border border-slate-800 bg-slate-950 p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.8),0_25px_50px_-12px_rgba(0,0,0,0.65)] md:p-8",
        className
      )}
    >
      <div className="mx-auto min-h-[280mm] w-full max-w-[190mm] rounded bg-card px-6 py-8 text-foreground shadow-inner shadow-slate-200/80">
        {children}
      </div>
    </div>
  )
}
