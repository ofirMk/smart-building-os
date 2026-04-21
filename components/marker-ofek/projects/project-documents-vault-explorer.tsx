"use client"

import * as React from "react"
import { ChevronRight, FileText, Folder } from "lucide-react"

import { cn } from "@/lib/utils"
import type { MarkerOfekProjectDocumentRow } from "@/types/marker-ofek"

const KIND_ORDER = ["תוכניות", "היתרים", "תעודות", "חוזה", "אחר", "ללא סיווג"] as const

function kindLabel(kind: string | null | undefined): string {
  const k = kind?.trim()
  if (!k) return "ללא סיווג"
  return k
}

type ProjectDocumentsVaultExplorerProps = {
  documents: MarkerOfekProjectDocumentRow[]
  className?: string
}

export function ProjectDocumentsVaultExplorer({
  documents,
  className,
}: ProjectDocumentsVaultExplorerProps) {
  const grouped = React.useMemo(() => {
    const m = new Map<string, MarkerOfekProjectDocumentRow[]>()
    for (const d of documents) {
      const k = kindLabel(d.document_kind)
      const list = m.get(k) ?? []
      list.push(d)
      m.set(k, list)
    }
    for (const list of m.values()) {
      list.sort((a, b) => {
        const va = a.version_number ?? 1
        const vb = b.version_number ?? 1
        if (va !== vb) return vb - va
        return String(b.created_at).localeCompare(String(a.created_at))
      })
    }
    return m
  }, [documents])

  const [open, setOpen] = React.useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {}
    for (const k of KIND_ORDER) o[k] = k === "תוכניות" || k === "חוזה"
    o["ללא סיווג"] = true
    return o
  })

  const keys = React.useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const k of KIND_ORDER) {
      if (grouped.has(k)) {
        out.push(k)
        seen.add(k)
      }
    }
    for (const k of grouped.keys()) {
      if (!seen.has(k)) out.push(k)
    }
    return out
  }, [grouped])

  if (documents.length === 0) {
    return (
      <p className={cn("text-sm text-slate-500", className)}>
        אין מסמכים בכספת עדיין.
      </p>
    )
  }

  return (
    <div className={cn("space-y-2", className)} dir="rtl">
      {keys.map((kind) => {
        const list = grouped.get(kind) ?? []
        if (list.length === 0) return null
        const isOpen = open[kind] ?? false
        return (
          <div key={kind} className="overflow-hidden rounded-lg border border-slate-100 bg-card">
            <button
              type="button"
              onClick={() => setOpen((s) => ({ ...s, [kind]: !isOpen }))}
              className="flex w-full items-center gap-2 border-b border-slate-100 bg-background/80 px-3 py-2 text-start text-sm font-medium text-[#1e293b]"
            >
              <ChevronRight
                className={cn("size-4 shrink-0 transition-transform", isOpen && "rotate-90")}
                aria-hidden
              />
              <Folder className="size-4 shrink-0 text-slate-500" aria-hidden />
              {kind}
              <span className="ms-auto font-currency-mono text-xs tabular-nums text-slate-500">
                {list.length}
              </span>
            </button>
            {isOpen ? (
              <ul className="divide-y divide-slate-100">
                {list.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm text-slate-700"
                  >
                    {d.is_folder ? (
                      <Folder className="size-4 shrink-0 text-indigo-600" aria-hidden />
                    ) : (
                      <FileText className="size-4 shrink-0 text-slate-400" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {d.title?.trim() || d.file_path || "—"}
                    </span>
                    <span className="font-currency-mono text-xs tabular-nums text-slate-500">
                      v{d.version_number ?? 1}
                      {d.is_current === false ? " · ארכיון" : ""}
                    </span>
                    <span className="font-currency-mono text-[11px] tabular-nums text-slate-400">
                      {d.created_at?.slice(0, 10)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
