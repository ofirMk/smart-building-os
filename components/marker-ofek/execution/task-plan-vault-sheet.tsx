"use client"

import * as React from "react"
import { ExternalLink, FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { buttonVariants } from "@/components/ui/button-variants"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  getProjectDocumentSignedUrl,
  listPlanDocumentsForTask,
} from "@/lib/marker-ofek/wbs-plan-link-actions"
import type { PlanLinkRow } from "@/lib/marker-ofek/wbs-plan-link-types"
import { cn, formatError } from "@/lib/utils"

function isPdf(
  mime: string | null | undefined,
  title: string,
  path: string | null | undefined
): boolean {
  const m = (mime ?? "").toLowerCase()
  if (m.includes("pdf")) return true
  const n = `${title} ${path ?? ""}`.toLowerCase()
  return n.endsWith(".pdf")
}

export function TaskPlanVaultSheet({
  open,
  onOpenChange,
  projectId,
  taskId,
  taskName,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  projectId: string
  taskId: string | null
  taskName: string | null
}) {
  const [busy, setBusy] = React.useState(false)
  const [rows, setRows] = React.useState<PlanLinkRow[]>([])
  const [previewId, setPreviewId] = React.useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [previewMime, setPreviewMime] = React.useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = React.useState(false)

  const loadDocs = React.useCallback(async () => {
    if (!taskId) {
      setRows([])
      return
    }
    setBusy(true)
    try {
      const list = await listPlanDocumentsForTask(taskId)
      setRows(list)
    } catch (e) {
      toast.error(formatError(e))
      setRows([])
    } finally {
      setBusy(false)
    }
  }, [taskId])

  React.useEffect(() => {
    if (open) {
      setPreviewId(null)
      setPreviewUrl(null)
      setPreviewMime(null)
      void loadDocs()
    }
  }, [open, loadDocs])

  async function openPreview(doc: PlanLinkRow["document"]) {
    setPreviewId(doc.id)
    setPreviewLoading(true)
    setPreviewUrl(null)
    setPreviewMime(doc.mime_type ?? null)
    try {
      const { url, mimeType } = await getProjectDocumentSignedUrl(doc.id, 3600)
      setPreviewUrl(url)
      setPreviewMime(mimeType ?? doc.mime_type ?? null)
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setPreviewLoading(false)
    }
  }

  const active = rows.find((r) => r.document.id === previewId)?.document

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden border-slate-100 bg-card p-0 sm:max-w-xl md:max-w-3xl"
        dir="rtl"
      >
        <SheetHeader className="border-b border-slate-100 bg-card px-4 py-4 text-start">
          <SheetTitle className="text-indigo-900">תוכניות ומסמכים למשימה</SheetTitle>
          <SheetDescription className="text-start text-slate-600">
            {taskName ? <span className="font-medium text-indigo-900">{taskName}</span> : null}
            <span className="mt-1 block font-currency-mono text-[11px] text-slate-500 tabular-nums">
              project {projectId.slice(0, 8)}… · task {taskId?.slice(0, 8) ?? "—"}…
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="max-h-[40vh] shrink-0 overflow-y-auto border-b border-slate-100 md:max-h-none md:w-[min(100%,280px)] md:border-b-0 md:border-e">
            {busy ? (
              <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                טוען מסמכים…
              </div>
            ) : rows.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">
                אין מסמכים מקושרים למשימה זו. קשרו תוכניות בעורך WBS (פרויקט) או ייבאו מבנה עם צמתים
                ומסמכים.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const d = r.document
                  const pdf = isPdf(d.mime_type, d.title ?? "", d.file_path)
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => void openPreview(d)}
                        className={`flex w-full items-start gap-2 px-3 py-3 text-start text-sm transition-colors hover:bg-background ${
                          previewId === d.id ? "bg-indigo-50/80" : ""
                        }`}
                      >
                        <FileText className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-[#0f172a]">
                            {d.title?.trim() || d.file_path}
                          </span>
                          <span className="mt-0.5 flex flex-wrap gap-x-2 font-currency-mono text-[11px] tabular-nums text-slate-500">
                            <span>v{d.version_number ?? 1}</span>
                            {d.document_kind ? <span>{d.document_kind}</span> : null}
                            {!pdf ? <span className="text-amber-700">לא PDF — פתיחה בלשונית</span> : null}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="flex min-h-[50vh] flex-1 flex-col bg-background/50">
            {!previewId ? (
              <p className="m-auto px-4 text-center text-sm text-slate-500">
                בחרו מסמך מהרשימה לתצוגה מהירה.
              </p>
            ) : previewLoading ? (
              <div className="m-auto flex items-center gap-2 text-slate-500">
                <Loader2 className="size-5 animate-spin" aria-hidden />
                טוען תצוגה…
              </div>
            ) : previewUrl && active && isPdf(previewMime, active.title ?? "", active.file_path) ? (
              <iframe
                title={active.title ?? "PDF"}
                src={previewUrl}
                className="h-full min-h-[480px] w-full flex-1 border-0 bg-card"
              />
            ) : previewUrl ? (
              <div className="m-auto flex max-w-sm flex-col items-center gap-3 p-6 text-center">
                <p className="text-sm text-slate-600">
                  תצוגת PDF מהירה זמינה לקבצי PDF. לקובץ זה השתמשו בפתיחה בחלון חדש.
                </p>
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "inline-flex items-center gap-2 border-slate-200 bg-card"
                  )}
                >
                  <ExternalLink className="size-4" aria-hidden />
                  פתיחה בלשונית חדשה
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
