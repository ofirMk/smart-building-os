"use client"

import * as React from "react"
import { FileText, Folder, Loader2, Paperclip, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  addPlanLink,
  listPlanLinksForWbsNode,
  listVaultDocumentsForProject,
  removePlanLink,
  type PlanLinkRow,
} from "@/lib/marker-ofek/wbs-plan-link-actions"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import type { MarkerOfekProjectDocumentRow } from "@/types/marker-ofek"
import { formatError } from "@/lib/utils"

const BUCKET =
  process.env.NEXT_PUBLIC_PROJECT_DOCUMENTS_BUCKET?.trim() || "project_documents"

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\u0590-\u05FF\-]+/g, "_").slice(0, 180) || "file"
}

function isPersistedWbsNodeId(id: string): boolean {
  return !id.startsWith("n-")
}

export function WbsNodeVaultDialog({
  open,
  onOpenChange,
  projectId,
  wbsNodeId,
  wbsCode,
  nodeLabel,
  onChanged,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  projectId: string | null
  wbsNodeId: string
  wbsCode?: string
  nodeLabel?: string
  onChanged?: () => void
}) {
  const [busy, setBusy] = React.useState(false)
  const [vault, setVault] = React.useState<MarkerOfekProjectDocumentRow[]>([])
  const [linked, setLinked] = React.useState<PlanLinkRow[]>([])
  const [uploading, setUploading] = React.useState(false)
  const [docKind, setDocKind] = React.useState("תוכניות")
  const [uploadFolderId, setUploadFolderId] = React.useState("")

  const folderRows = React.useMemo(
    () => vault.filter((d) => d.is_folder),
    [vault]
  )
  const fileRows = React.useMemo(
    () => vault.filter((d) => !d.is_folder),
    [vault]
  )

  React.useEffect(() => {
    if (folderRows.length === 0) return
    setUploadFolderId((prev) => {
      if (prev && folderRows.some((f) => f.id === prev)) return prev
      const plans = folderRows.find((f) => f.vault_folder_key === "plans")
      return plans?.id ?? folderRows[0]!.id
    })
  }, [folderRows])

  const canUseVault = Boolean(projectId) && isPersistedWbsNodeId(wbsNodeId)

  const refresh = React.useCallback(async () => {
    if (!canUseVault || !projectId) return
    setBusy(true)
    try {
      const [docs, links] = await Promise.all([
        listVaultDocumentsForProject(projectId),
        listPlanLinksForWbsNode(wbsNodeId),
      ])
      setVault(docs)
      setLinked(links)
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setBusy(false)
    }
  }, [canUseVault, projectId, wbsNodeId])

  React.useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  const linkedFileRows = React.useMemo(
    () => linked.filter((l) => !l.document.is_folder && l.document.file_path),
    [linked]
  )
  const linkedIds = React.useMemo(
    () => new Set(linkedFileRows.map((l) => l.document.id)),
    [linkedFileRows]
  )

  async function attach(docId: string) {
    setBusy(true)
    try {
      await addPlanLink(wbsNodeId, docId)
      toast.success("המסמך צורף לצומת")
      await refresh()
      onChanged?.()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setBusy(false)
    }
  }

  async function detach(docId: string) {
    setBusy(true)
    try {
      await removePlanLink(wbsNodeId, docId)
      toast.success("הקישור הוסר")
      await refresh()
      onChanged?.()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setBusy(false)
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !projectId || !canUseVault) return
    setUploading(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const path = `${projectId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      })
      if (upErr) throw upErr
      const versionGroupId = crypto.randomUUID()
      const parentId =
        uploadFolderId && folderRows.some((f) => f.id === uploadFolderId) ? uploadFolderId : null
      const { data: row, error: insErr } = await supabase
        .from("project_documents")
        .insert({
          project_id: projectId,
          file_path: path,
          title: file.name,
          mime_type: file.type || null,
          document_kind: docKind.trim() || null,
          version_group_id: versionGroupId,
          version_number: 1,
          is_current: true,
          is_folder: false,
          parent_document_id: parentId,
        })
        .select(
          "id, project_id, title, file_path, document_kind, mime_type, created_at, version_group_id, version_number, is_current, parent_document_id, is_folder, vault_folder_key"
        )
        .single()
      if (insErr) throw insErr
      if (row?.id) {
        await addPlanLink(wbsNodeId, String(row.id))
        toast.success("הקובץ הועלה וצורף לצומת")
        await refresh()
        onChanged?.()
      }
    } catch (err) {
      toast.error(formatError(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(90vh,720px)] overflow-y-auto border-slate-100 sm:max-w-lg"
        showCloseButton
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-indigo-900">
            <Paperclip className="size-5 text-indigo-600" aria-hidden />
            צרף מסמך — כספת פרויקט (WBS)
          </DialogTitle>
          <p className="text-xs text-slate-500">
            {wbsCode ? (
              <span className="font-currency-mono text-indigo-700 tabular-nums">{wbsCode}</span>
            ) : null}{" "}
            {nodeLabel?.trim() ? `· ${nodeLabel.trim()}` : null}
          </p>
        </DialogHeader>

        {!canUseVault ? (
          <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {projectId
              ? "שמרו את המבנה כדי לקבל מזהה צומת קבוע, ואז ניתן לצרף מסמכים."
              : "שייכו את המבנה לפרויקט (לא תבנית בלבד) כדי לקשר מסמכים מכספת הפרויקט."}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
              <Label className="text-xs text-slate-600">תיקיית יעד בכספת</Label>
              <Select
                value={uploadFolderId || undefined}
                onValueChange={(v) => {
                  if (v) setUploadFolderId(v)
                  const f = folderRows.find((x) => x.id === v)
                  const t = f?.title?.trim()
                  if (t) setDocKind(t)
                }}
                disabled={folderRows.length === 0}
              >
                <SelectTrigger className="mt-1 border-slate-100 bg-white text-sm text-indigo-900">
                  <SelectValue placeholder="בחרו תיקייה" />
                </SelectTrigger>
                <SelectContent>
                  {folderRows.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      <span className="flex items-center gap-2">
                        <Folder className="size-3.5 text-indigo-600" aria-hidden />
                        {f.title?.trim() ?? f.vault_folder_key}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Label className="mt-2 block text-xs text-slate-600">סוג / תיאור (העלאה)</Label>
              <Input
                value={docKind}
                onChange={(e) => setDocKind(e.target.value)}
                className="mt-1 border-slate-100 bg-white text-sm text-indigo-900"
                placeholder="תוכניות"
              />
              <div className="mt-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm font-medium text-indigo-700 shadow-sm hover:bg-slate-50">
                  <Upload className="size-4" aria-hidden />
                  {uploading ? "מעלה…" : "העלאה לכספת וצירוף"}
                  <input
                    type="file"
                    className="sr-only"
                    accept=".pdf,.dwg,.png,.jpg,.jpeg,.webp,application/pdf"
                    disabled={uploading || busy}
                    onChange={(ev) => void onUpload(ev)}
                  />
                </label>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-slate-500">מצורפים לצומת</p>
              {busy && linkedFileRows.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  טוען…
                </p>
              ) : linkedFileRows.length === 0 ? (
                <p className="text-sm text-slate-500">אין מסמכים מקושרים.</p>
              ) : (
                <ul className="space-y-1 rounded-lg border border-slate-100 bg-white">
                  {linkedFileRows.map((l) => (
                    <li
                      key={l.link_id}
                      className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0"
                    >
                      <FileText className="size-4 shrink-0 text-slate-400" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-indigo-900">
                        {l.document.title?.trim() || l.document.file_path}
                      </span>
                      <span className="font-currency-mono text-[11px] tabular-nums text-slate-500">
                        v{l.document.version_number ?? 1}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => void detach(l.document.id)}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-slate-500">מסמכים בכספת הפרויקט</p>
              <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border border-slate-100 bg-white p-2">
                {vault.length === 0 && !busy ? (
                  <p className="px-2 py-4 text-center text-sm text-slate-500">הכספת ריקה.</p>
                ) : null}
                {folderRows.map((folder) => {
                  const inFolder = fileRows.filter((f) => f.parent_document_id === folder.id)
                  return (
                    <div key={folder.id} className="rounded-md border border-slate-100 bg-slate-50/50 p-2">
                      <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-indigo-900">
                        <Folder className="size-3.5 shrink-0 text-indigo-600" aria-hidden />
                        {folder.title?.trim() ?? folder.vault_folder_key}
                      </div>
                      {inFolder.length === 0 ? (
                        <p className="px-1 py-1 text-[11px] text-slate-500">אין קבצים בתיקייה.</p>
                      ) : (
                        <ul className="space-y-0.5">
                          {inFolder.map((d) => {
                            const isOn = linkedIds.has(d.id)
                            return (
                              <li
                                key={d.id}
                                className="flex flex-wrap items-center gap-2 rounded border border-transparent bg-white px-2 py-1.5 text-sm hover:border-slate-100"
                              >
                                <FileText className="size-4 shrink-0 text-slate-400" aria-hidden />
                                <span className="min-w-0 flex-1 truncate text-indigo-900">
                                  {d.title?.trim() || d.file_path}
                                </span>
                                <span className="font-currency-mono text-[11px] tabular-nums text-slate-500">
                                  v{d.version_number ?? 1}
                                </span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={isOn ? "secondary" : "outline"}
                                  className="h-7 border-slate-100 text-xs"
                                  disabled={busy || isOn}
                                  onClick={() => void attach(d.id)}
                                >
                                  {isOn ? "מצורף" : "צרף"}
                                </Button>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  )
                })}
                {(() => {
                  const rootFiles = fileRows.filter((f) => !f.parent_document_id)
                  if (rootFiles.length === 0) return null
                  return (
                    <div className="rounded-md border border-dashed border-slate-200 bg-white p-2">
                      <p className="mb-1.5 text-xs font-semibold text-slate-500">בשורש הכספת</p>
                      <ul className="space-y-0.5">
                        {rootFiles.map((d) => {
                          const isOn = linkedIds.has(d.id)
                          return (
                            <li
                              key={d.id}
                              className="flex flex-wrap items-center gap-2 rounded px-2 py-1.5 text-sm"
                            >
                              <FileText className="size-4 shrink-0 text-slate-400" aria-hidden />
                              <span className="min-w-0 flex-1 truncate text-indigo-900">
                                {d.title?.trim() || d.file_path}
                              </span>
                              <span className="font-currency-mono text-[11px] tabular-nums text-slate-500">
                                v{d.version_number ?? 1}
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant={isOn ? "secondary" : "outline"}
                                className="h-7 border-slate-100 text-xs"
                                disabled={busy || isOn}
                                onClick={() => void attach(d.id)}
                              >
                                {isOn ? "מצורף" : "צרף"}
                              </Button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-start">
          <Button type="button" variant="outline" className="border-slate-100" onClick={() => onOpenChange(false)}>
            סגירה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { isPersistedWbsNodeId }
