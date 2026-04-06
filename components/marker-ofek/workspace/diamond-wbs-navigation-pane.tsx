"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronLeft, FolderTree, LayoutGrid } from "lucide-react"

import type { GanttTaskRow, WbsNodeBrief } from "@/lib/marker-ofek/gantt-actions"
import { cn } from "@/lib/utils"

function childrenByParent(nodes: WbsNodeBrief[]) {
  const m = new Map<string | null, WbsNodeBrief[]>()
  for (const n of nodes) {
    const p = n.parent_node_id
    if (!m.has(p)) m.set(p, [])
    m.get(p)!.push(n)
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, "he"))
  }
  return m
}

function WbsBranch({
  parentId,
  depth,
  map,
}: {
  parentId: string | null
  depth: number
  map: Map<string | null, WbsNodeBrief[]>
}) {
  const kids = map.get(parentId) ?? []
  if (kids.length === 0) return null
  return (
    <ul className={cn("space-y-0.5", depth > 0 && "me-2 border-e border-slate-100 pe-2")}>
      {kids.map((n) => (
        <li key={n.id}>
          <Link
            href={`/marker-ofek/execution/wbs/node/${n.id}`}
            className="block rounded-lg px-2 py-1.5 text-xs font-light text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            style={{ paddingInlineStart: `${8 + depth * 10}px` }}
          >
            {n.label}
          </Link>
          <WbsBranch parentId={n.id} depth={depth + 1} map={map} />
        </li>
      ))}
    </ul>
  )
}

type DiamondWbsNavigationPaneProps = {
  projectId: string
  projectName: string
  wbsNodes: WbsNodeBrief[]
  /** משימות שורש (לקיצור דרך לפרטי משימה) */
  rootTasks?: Pick<GanttTaskRow, "id" | "name">[]
  className?: string
}

export function DiamondWbsNavigationPane({
  projectId,
  projectName,
  wbsNodes,
  rootTasks = [],
  className,
}: DiamondWbsNavigationPaneProps) {
  const map = React.useMemo(() => childrenByParent(wbsNodes), [wbsNodes])

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden border-e border-slate-100/90 bg-slate-50/30",
        className
      )}
      dir="rtl"
    >
      <div className="shrink-0 border-b border-slate-100 px-3 py-4">
        <p className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.2em] text-slate-400">
          <FolderTree className="size-3.5 shrink-0 opacity-70" aria-hidden />
          ניווט WBS
        </p>
        <p className="mt-2 line-clamp-2 text-sm font-extralight leading-snug text-slate-800">
          {projectName}
        </p>
      </div>
      <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 py-3 text-start">
        <div className="space-y-1 px-1">
          <Link
            href={`/marker-ofek/execution/diamond-workspace/${projectId}`}
            className="flex items-center gap-2 rounded-xl px-2 py-2 text-xs font-medium text-indigo-700 bg-indigo-50/60"
          >
            <LayoutGrid className="size-3.5 shrink-0" aria-hidden />
            שולחן יהלום (נוכחי)
          </Link>
          <Link
            href={`/marker-ofek/execution/gantt/${projectId}`}
            className="flex items-center gap-2 rounded-xl px-2 py-2 text-xs font-light text-slate-600 transition-colors hover:bg-white hover:text-slate-900"
          >
            <ChevronLeft className="size-3.5 shrink-0 opacity-60" aria-hidden />
            גאנט מלא
          </Link>
          <Link
            href="/marker-ofek/contracts/select-type"
            className="flex items-center gap-2 rounded-xl px-2 py-2 text-xs font-light text-slate-600 transition-colors hover:bg-white hover:text-slate-900"
          >
            חוזים
          </Link>
        </div>

        <div className="px-2">
          <p className="mb-2 text-[10px] font-semibold tracking-wide text-slate-400">
            מבנה עבודה
          </p>
          {wbsNodes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-white/60 px-3 py-3 text-[11px] font-light leading-relaxed text-slate-500">
              אין מבנה WBS לפרויקט זה. F2 — הקמת פרויקט או ייבוא מתכנון.
            </p>
          ) : (
            <WbsBranch parentId={null} depth={0} map={map} />
          )}
        </div>

        {rootTasks.length > 0 ? (
          <div className="px-2 pb-4">
            <p className="mb-2 text-[10px] font-semibold tracking-wide text-slate-400">
              משימות שורש
            </p>
            <ul className="space-y-0.5">
              {rootTasks.slice(0, 12).map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/marker-ofek/execution/wbs/task/${t.id}`}
                    className="block truncate rounded-lg px-2 py-1.5 text-[11px] font-light text-slate-600 hover:bg-slate-100"
                  >
                    {t.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </nav>
    </div>
  )
}
