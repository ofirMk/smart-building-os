"use client"

import Link from "next/link"
import * as React from "react"
import {
  ArrowRight,
  ChevronRight,
  GitBranch,
  Map,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  getSystemMapStats,
  MARKER_OFEK_SYSTEM_MAP_ROOT,
  type SystemMapNode,
  type SystemMapStatus,
} from "@/lib/marker-ofek/system-map-data"

function defaultExpandedIds(
  nodes: SystemMapNode[],
  maxDepth = 2,
  depth = 0
): string[] {
  const ids: string[] = []
  for (const n of nodes) {
    if (n.children.length === 0) continue
    if (depth < maxDepth) {
      ids.push(n.id)
      ids.push(...defaultExpandedIds(n.children, maxDepth, depth + 1))
    }
  }
  return ids
}

function statusBadgeClass(status: SystemMapStatus): string {
  switch (status) {
    case "active":
      return "border-emerald-500/40 bg-emerald-500/15 text-emerald-800"
    case "in-progress":
      return "border-amber-500/45 bg-amber-500/15 text-amber-900"
    case "planned":
      return "border-border/70 bg-muted/50 text-muted-foreground"
    default:
      return ""
  }
}

function statusLabel(status: SystemMapStatus): string {
  switch (status) {
    case "active":
      return "פעיל"
    case "in-progress":
      return "בפיתוח"
    case "planned":
      return "מתוכנן"
    default:
      return status
  }
}

function StatusBadge({ status }: { status: SystemMapStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 text-[10px] font-medium uppercase tracking-wide",
        statusBadgeClass(status)
      )}
    >
      {statusLabel(status)}
    </Badge>
  )
}

function MapTreeNode({
  node,
  expanded,
  toggle,
}: {
  node: SystemMapNode
  expanded: Set<string>
  toggle: (id: string) => void
}) {
  const hasChildren = node.children.length > 0
  const isOpen = expanded.has(node.id)

  return (
    <div className="select-none">
      <div
        className={cn(
          "flex gap-1 rounded-lg py-2 pe-2 transition-colors hover:bg-muted/40",
          hasChildren && "ps-1"
        )}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => toggle(node.id)}
            className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-expanded={isOpen}
            aria-label={isOpen ? "כווץ" : "הרחב"}
          >
            <ChevronRight
              className={cn(
                "size-4 transition-transform duration-200",
                isOpen && "rotate-90"
              )}
              aria-hidden
            />
          </button>
        ) : (
          <span className="w-7 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1 border-s border-border/50 ps-3">
          <div className="flex flex-wrap items-center gap-2 gap-y-1">
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {node.id}
            </span>
            <span className="font-medium text-foreground">{node.title}</span>
            <StatusBadge status={node.status} />
          </div>
          {node.description ? (
            <p className="mt-1 text-sm leading-snug text-muted-foreground">
              {node.description}
            </p>
          ) : null}
        </div>
      </div>
      {hasChildren && isOpen ? (
        <div className="ms-4 border-s border-violet-500/20 ps-2 sm:ms-7 sm:ps-3">
          {node.children.map((child) => (
            <MapTreeNode
              key={child.id}
              node={child}
              expanded={expanded}
              toggle={toggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function MarkerOfekSystemMapPage() {
  const stats = React.useMemo(
    () => getSystemMapStats(MARKER_OFEK_SYSTEM_MAP_ROOT),
    []
  )

  const [expanded, setExpanded] = React.useState<Set<string>>(() => {
    return new Set(defaultExpandedIds(MARKER_OFEK_SYSTEM_MAP_ROOT, 2))
  })

  const toggle = React.useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const expandAll = React.useCallback(() => {
    const all = new Set<string>()
    function walk(nodes: SystemMapNode[]) {
      for (const n of nodes) {
        if (n.children.length) {
          all.add(n.id)
          walk(n.children)
        }
      }
    }
    walk(MARKER_OFEK_SYSTEM_MAP_ROOT)
    setExpanded(all)
  }, [])

  const collapseToRoots = React.useCallback(() => {
    setExpanded(
      new Set(
        MARKER_OFEK_SYSTEM_MAP_ROOT.filter((n) => n.children.length).map(
          (n) => n.id
        )
      )
    )
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8 pb-12">
      <Link
        href="/marker-ofek"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה ללוח בקרה
      </Link>

      <header className="pharmacy-hero-card p-6 md:p-8">
        <div className="relative flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-600">
              <Map className="size-6" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-violet-600/90">
                מרקר אופק · ארכיטקטורה חיה
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-[#1e293b] md:text-3xl">
                מפת המערכת (Roadmap)
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                היררכיית ERP 0–7 (WBS): סטטוס פיתוח לפי צמתים — פעיל, בפיתוח,
                או מתוכנן. הנתונים מגיעים מקובץ יחיד לעדכון שוטף.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 text-slate-500">
            <GitBranch className="size-5 opacity-80" aria-hidden />
            <span className="text-sm">אינדקס WBS חי</span>
          </div>
        </div>

        <div className="relative mt-8 rounded-xl border border-slate-100 bg-background/80 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              השלמה לפי צמתים פעילים:{" "}
              <strong className="text-[#1e293b] tabular-nums">
                {stats.active} / {stats.total}
              </strong>{" "}
              ({stats.percentActive}%)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={expandAll}
                className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-[#1e293b] hover:bg-slate-100"
              >
                הרחב הכול
              </button>
              <button
                type="button"
                onClick={collapseToRoots}
                className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-[#1e293b] hover:bg-slate-100"
              >
                כווץ לשכבות
              </button>
            </div>
          </div>
          <div
            className="h-3 overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
            aria-valuenow={stats.percentActive}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="אחוז צמתים פעילים"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${stats.percentActive}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" />
              פעיל
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-500" />
              בפיתוח
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-slate-500" />
              מתוכנן
            </span>
          </div>
        </div>
      </header>

      <Card className="border-border/70 shadow-md">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="text-lg">עץ WBS 0–7</CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            לחצו על החץ להרחבה. עדכנו סטטוסים ב־
            <code className="rounded bg-muted px-1 font-mono text-xs">
              lib/marker-ofek/system-map-data.ts
            </code>
          </p>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-0.5">
            {MARKER_OFEK_SYSTEM_MAP_ROOT.map((node) => (
              <MapTreeNode
                key={node.id}
                node={node}
                expanded={expanded}
                toggle={toggle}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
