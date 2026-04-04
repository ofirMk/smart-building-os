"use client"

import * as React from "react"
import Link from "next/link"
import { format } from "date-fns"
import { he } from "date-fns/locale"
import { Loader2, Shield, Upload } from "lucide-react"

import {
  contextMenuIcons,
  SmartTableContextMenuPortal,
} from "@/components/marker-ofek/smart-table-context-menu"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  CONTRACT_VAULT_BUCKET,
  type VaultDocumentRow,
  type VaultSensitiveLevel,
} from "@/lib/marker-ofek/contract-vault/vault-constants"
import {
  finalizeContractVaultUpload,
  listContractVaultDocuments,
} from "@/lib/marker-ofek/contract-vault/vault-actions"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn, formatError } from "@/lib/utils"

const MAX_BYTES = 25 * 1024 * 1024

function safeStorageSegment(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, "_")
    .trim()
    .slice(0, 180) || "file"
}

type ProjectOpt = {
  id: string
  name: string
  internal_project_code: string
}

const SENSITIVE_LABELS: Record<VaultSensitiveLevel, string> = {
  standard: "רגיל",
  confidential: "סודי",
  restricted: "מוגבל (הנהלה בלבד)",
}

export default function ContractVaultClient({
  projects,
}: {
  projects: ProjectOpt[]
}) {
  const [uploadOpen, setUploadOpen] = React.useState(false)
  const [projectId, setProjectId] = React.useState("")
  const [file, setFile] = React.useState<File | null>(null)
  const [viewerAdmin, setViewerAdmin] = React.useState(true)
  const [viewerManager, setViewerManager] = React.useState(true)
  const [viewerPartner, setViewerPartner] = React.useState(false)
  const [sensitive, setSensitive] = React.useState<VaultSensitiveLevel>("standard")
  const [busy, setBusy] = React.useState(false)
  const [rows, setRows] = React.useState<VaultDocumentRow[]>([])
  const [listBusy, setListBusy] = React.useState(false)
  const [vaultCtx, setVaultCtx] = React.useState<{
    x: number
    y: number
    row: VaultDocumentRow
  } | null>(null)

  const viewersOk = viewerAdmin || viewerManager || viewerPartner
  /** שער: לא בוחרים קובץ לפני פרויקט + לפחות קבוצת צפייה אחת. */
  const gateOpenForFile = Boolean(projectId && viewersOk)

  React.useEffect(() => {
    if (!gateOpenForFile) setFile(null)
  }, [gateOpenForFile])

  const reloadList = React.useCallback(async (pid: string) => {
    if (!pid) {
      setRows([])
      return
    }
    setListBusy(true)
    try {
      const res = await listContractVaultDocuments(pid)
      if (res.ok) setRows(res.rows)
      else toast.error(res.error)
    } finally {
      setListBusy(false)
    }
  }, [])

  React.useEffect(() => {
    void reloadList(projectId)
  }, [projectId, reloadList])

  async function onConfirmUpload() {
    if (!projectId) {
      toast.error("בחרו פרויקט")
      return
    }
    if (!file) {
      toast.error("בחרו קובץ")
      return
    }
    if (!viewersOk) {
      toast.error("נדרשת לפחות קבוצת צפייה אחת (אדמין / מנהל / שותף)")
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error("הקובץ גדול מדי (מקס׳ 25MB)")
      return
    }

    setBusy(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const segment = safeStorageSegment(file.name)
      const path = `${projectId}/${crypto.randomUUID()}_${segment}`

      const { error: upErr } = await supabase.storage
        .from(CONTRACT_VAULT_BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "application/octet-stream",
        })

      if (upErr) throw upErr

      const fin = await finalizeContractVaultUpload({
        projectId,
        storagePath: path,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSizeBytes: file.size,
        sensitiveLevel: sensitive,
        viewerAdmin,
        viewerManager,
        viewerPartner,
      })

      if (!fin.ok) {
        await supabase.storage.from(CONTRACT_VAULT_BUCKET).remove([path])
        throw new Error(fin.error)
      }

      toast.success("הקובץ הועלה; ניתוח AI רץ ברקע")
      setUploadOpen(false)
      setFile(null)
      await reloadList(projectId)
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      dir="rtl"
      lang="he"
      className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-16"
    >
      <SmartTableContextMenuPortal
        open={vaultCtx != null}
        x={vaultCtx?.x ?? 0}
        y={vaultCtx?.y ?? 0}
        onClose={() => setVaultCtx(null)}
        actions={
          vaultCtx
            ? [
                {
                  id: "copy-vault-filename",
                  label: "העתק שם קובץ",
                  icon: contextMenuIcons.duplicate,
                  onSelect: () => {
                    void navigator.clipboard.writeText(vaultCtx.row.file_name)
                    toast.success("שם הקובץ הועתק")
                  },
                },
                {
                  id: "copy-vault-path",
                  label: "העתק נתיב אחסון (פנימי)",
                  icon: contextMenuIcons.catalog,
                  onSelect: () => {
                    void navigator.clipboard.writeText(vaultCtx.row.storage_path)
                    toast.success("נתיב האחסון הועתק")
                  },
                },
              ]
            : []
        }
        navItems={[
          { label: "מרכז חוזה וחשבונות", href: "/marker-ofek/finance/contracts-billing" },
          ...(projectId.trim()
            ? [
                {
                  label: "לו״ז וביצוע (גאנט)",
                  href: `/marker-ofek/execution/gantt/${projectId.trim()}`,
                },
              ]
            : []),
        ]}
      />
      <Link
        href="/marker-ofek/finance/contracts-billing"
        className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 transition-colors hover:text-indigo-950"
      >
        חזרה למרכז חוזה וחשבונות
      </Link>

      <header className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-indigo-950">
              <Shield className="size-6" strokeWidth={1.5} aria-hidden />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                חוזה וחשבונות
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-indigo-950 sm:text-3xl">
                כספת מסמכי חוזה
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                העלאה מאובטחת: חובה להגדיר מי רשאי לצפות לפני השלמת ההעלאה. לאחר מכן
                המערכת מפיקה טקסט ווקטור לחיפוש בעוזר ה-AI.
              </p>
            </div>
          </div>
          <Button
            type="button"
            className="gap-2 bg-indigo-950 text-white hover:bg-indigo-900"
            onClick={() => setUploadOpen(true)}
          >
            <Upload className="size-4" aria-hidden />
            העלאה מאובטחת
          </Button>
        </div>
      </header>

      <section className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
        <Label htmlFor="vault-project" className="text-indigo-950">
          פרויקט
        </Label>
        <Select
          value={projectId}
          onValueChange={(v) => setProjectId(v ?? "")}
        >
          <SelectTrigger
            id="vault-project"
            className="mt-2 h-11 border-slate-100 bg-white"
          >
            <SelectValue placeholder="בחרו פרויקט לצפייה ברשימה" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
                {p.internal_project_code ? ` · ${p.internal_project_code}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="mt-6 overflow-x-auto rounded-lg border border-slate-100">
          {listBusy ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              טוען…
            </div>
          ) : !projectId ? (
            <p className="px-4 py-12 text-center text-sm text-slate-500">
              בחרו פרויקט להצגת מסמכים.
            </p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-slate-500">
              אין מסמכים בכספת לפרויקט זה.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100 hover:bg-slate-50/80">
                  <TableHead>קובץ</TableHead>
                  <TableHead>רגישות</TableHead>
                  <TableHead className="font-currency-mono">גודל</TableHead>
                  <TableHead>סטטוס AI</TableHead>
                  <TableHead>תאריך</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.id}
                    className="border-slate-100"
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setVaultCtx({ x: e.clientX, y: e.clientY, row: r })
                    }}
                  >
                    <TableCell className="max-w-[200px] truncate font-medium text-indigo-950">
                      {r.file_name}
                    </TableCell>
                    <TableCell className="text-sm">
                      {SENSITIVE_LABELS[r.sensitive_level] ?? r.sensitive_level}
                    </TableCell>
                    <TableCell className="font-currency-mono text-sm tabular-nums">
                      {r.file_size_bytes.toLocaleString("he-IL")} B
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.ingest_status === "ready"
                        ? "מוכן לחיפוש"
                        : r.ingest_status === "processing"
                          ? "מעבד…"
                          : r.ingest_status === "failed"
                            ? "נכשל"
                            : r.ingest_status}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-slate-600">
                      {format(new Date(r.created_at), "d MMM yyyy, HH:mm", {
                        locale: he,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
          showCloseButton={!busy}
        >
          <DialogHeader>
            <DialogTitle className="text-indigo-950">הגדרות צפייה והעלאה</DialogTitle>
            <DialogDescription>
              סדר חובה: פרויקט → רמת רגישות → מורשי צפייה → רק אז בחירת קובץ. אחרי
              השמירה מופעלת ריצת Gemini (OCR/חילוץ טקסט) ברקע.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>פרויקט</Label>
              <Select
                value={projectId}
                onValueChange={(v) => setProjectId(v ?? "")}
              >
                <SelectTrigger className="border-slate-100 bg-white">
                  <SelectValue placeholder="בחרו פרויקט" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>רמת רגישות</Label>
              <Select
                value={sensitive}
                onValueChange={(v) =>
                  setSensitive((v ?? "standard") as VaultSensitiveLevel)
                }
              >
                <SelectTrigger className="border-slate-100 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SENSITIVE_LABELS) as VaultSensitiveLevel[]).map(
                    (k) => (
                      <SelectItem key={k} value={k}>
                        {SENSITIVE_LABELS[k]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
              <p className="mb-3 text-sm font-medium text-indigo-950">
                מורשי צפייה במסמך
              </p>
              <div className="flex flex-col gap-3">
                <label className="flex cursor-pointer items-center gap-3 text-sm">
                  <Checkbox
                    checked={viewerAdmin}
                    onCheckedChange={(c) => setViewerAdmin(c === true)}
                  />
                  <span>אדמין / גישה מלאה למערכת</span>
                </label>
                <label className="flex cursor-pointer items-center gap-3 text-sm">
                  <Checkbox
                    checked={viewerManager}
                    onCheckedChange={(c) => setViewerManager(c === true)}
                  />
                  <span>מנהל (הרשאות כספיות בפרויקט)</span>
                </label>
                <label className="flex cursor-pointer items-center gap-3 text-sm">
                  <Checkbox
                    checked={viewerPartner}
                    onCheckedChange={(c) => setViewerPartner(c === true)}
                  />
                  <span>שותפים וצוות עם צפייה בפרויקט</span>
                </label>
              </div>
              {!viewersOk ? (
                <p className="mt-2 text-xs text-amber-700">
                  יש לסמן לפחות קבוצה אחת.
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="vault-file">קובץ</Label>
              {!gateOpenForFile ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {!projectId
                    ? "בחרו פרויקט כדי להמשיך."
                    : "סמנו לפחות קבוצת צפייה אחת לפני בחירת הקובץ — כך נשמרות הרשאות לפני שמירה."}
                </p>
              ) : null}
              <input
                id="vault-file"
                type="file"
                disabled={!gateOpenForFile}
                className={cn(
                  "text-sm file:me-3 file:rounded-md file:border file:border-slate-100 file:bg-white file:px-3 file:py-1.5",
                  !gateOpenForFile && "cursor-not-allowed opacity-45"
                )}
                accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <p className="font-currency-mono text-xs text-slate-600">
                  {file.name} · {file.size.toLocaleString("he-IL")} bytes
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter className="border-t-0 bg-transparent p-0 pt-2">
            <Button
              type="button"
              variant="outline"
              className="border-slate-100"
              disabled={busy}
              onClick={() => setUploadOpen(false)}
            >
              ביטול
            </Button>
            <Button
              type="button"
              className={cn(
                "bg-indigo-950 text-white hover:bg-indigo-900",
                (!viewersOk || !file || !projectId || busy) && "opacity-50"
              )}
              disabled={!viewersOk || !file || !projectId || busy}
              onClick={() => void onConfirmUpload()}
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  מעלה…
                </>
              ) : (
                "אישור והעלאה"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
