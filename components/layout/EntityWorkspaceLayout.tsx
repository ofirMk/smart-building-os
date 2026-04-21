"use client"

import * as React from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type EntityWorkspaceLayoutProps = {
  title: string
  description?: string
  headerActions?: React.ReactNode
  sidebar: React.ReactNode
  main: React.ReactNode
  footerActions?: React.ReactNode
  className?: string
}

export function EntityWorkspaceLayout({
  title,
  description,
  headerActions,
  sidebar,
  main,
  footerActions,
  className,
}: EntityWorkspaceLayoutProps) {
  return (
    <div
      dir="rtl"
      className={cn(
        "flex h-[calc(100dvh-4rem)] min-h-0 w-full max-w-full min-w-0 flex-col gap-2 overflow-hidden bg-background p-2 text-foreground lg:p-3",
        className
      )}
    >
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
            {description ? (
              <CardDescription className="mt-1 text-xs text-muted-foreground">
                {description}
              </CardDescription>
            ) : null}
          </div>
          {headerActions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{headerActions}</div> : null}
        </CardHeader>
      </Card>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-10">
        <aside className="min-h-0 space-y-2 lg:col-span-3 lg:sticky lg:top-16 lg:self-start lg:overflow-y-auto">
          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Contextual Intelligence</CardTitle>
              <CardDescription className="text-[11px]">
                Health · Profit · Forecast
              </CardDescription>
            </CardHeader>
            <CardContent className="p-2">{sidebar}</CardContent>
          </Card>
        </aside>
        <main className="min-h-0 overflow-y-auto lg:col-span-7">{main}</main>
      </div>

      {footerActions ? (
        <Card className="sticky bottom-0 z-20 border-border bg-card/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/90">
          <CardContent className="flex flex-wrap items-center justify-end gap-2 p-3">
            {footerActions}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
