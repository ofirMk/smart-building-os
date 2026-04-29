"use client"

import * as React from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type WorkspaceLocale = "he" | "en"

type ThreeWayLabel = {
  key: string
  en: string
  he: string
}

type MasterDetailWorkspaceProps = {
  title: string
  description?: string
  headerActions?: React.ReactNode
  master: React.ReactNode
  detail: React.ReactNode
  footerActions?: React.ReactNode
  className?: string
  locale?: WorkspaceLocale
  masterLabel?: ThreeWayLabel
  detailLabel?: ThreeWayLabel
}

const DEFAULT_MASTER_LABEL: ThreeWayLabel = {
  key: "master_panel",
  en: "Master Panel",
  he: "פאנל אב",
}

const DEFAULT_DETAIL_LABEL: ThreeWayLabel = {
  key: "detail_panel",
  en: "Detail Panel",
  he: "פאנל בן",
}

function localizeLabel(label: ThreeWayLabel, locale: WorkspaceLocale) {
  return locale === "he" ? label.he : label.en
}

function fieldHint(label: ThreeWayLabel, locale: WorkspaceLocale) {
  return locale === "he" ? `${label.en} · ${label.key}` : `${label.he} · ${label.key}`
}

/**
 * @deprecated Use `EntityWorkspace` + `BentoSmartList` + slide-over FocusPane pattern.
 */
export function MasterDetailWorkspace({
  title,
  description,
  headerActions,
  master,
  detail,
  footerActions,
  className,
  locale = "he",
  masterLabel = DEFAULT_MASTER_LABEL,
  detailLabel = DEFAULT_DETAIL_LABEL,
}: MasterDetailWorkspaceProps) {
  return (
    <div
      dir={locale === "he" ? "rtl" : "ltr"}
      lang={locale === "he" ? "he" : "en"}
      className={cn(
        "flex flex-1 min-h-0 w-full min-w-0 max-w-full flex-col gap-3 overflow-hidden bg-background p-3 lg:p-4",
        className
      )}
    >
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
          <div className="min-w-0">
            <CardTitle className="text-lg font-semibold text-foreground">{title}</CardTitle>
            {description ? (
              <CardDescription className="mt-1 text-xs text-muted-foreground">
                {description}
              </CardDescription>
            ) : null}
          </div>
          {headerActions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{headerActions}</div> : null}
        </CardHeader>
      </Card>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-10">
        <aside className="flex min-h-0 flex-col lg:col-span-3">
          <Card className="flex min-h-0 flex-1 flex-col border-border bg-card shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{localizeLabel(masterLabel, locale)}</CardTitle>
              <CardDescription className="text-[11px]">{fieldHint(masterLabel, locale)}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-y-auto p-2">{master}</CardContent>
          </Card>
        </aside>
        <main className="flex min-h-0 flex-col lg:col-span-7">
          <Card className="flex min-h-0 flex-1 flex-col border-border bg-card shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{localizeLabel(detailLabel, locale)}</CardTitle>
              <CardDescription className="text-[11px]">{fieldHint(detailLabel, locale)}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-y-auto p-2">{detail}</CardContent>
          </Card>
        </main>
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
