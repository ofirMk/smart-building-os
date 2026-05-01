"use client"

/**
 * PoAttachmentsTab — Phase 7.13.1.B
 *
 * טאב "קבצים" במסך פרט PO. מציג רשימת קבצים עם meta + preview link חתום,
 * וכולל widget להעלאה עם drag & drop.
 *
 * זרימה:
 *   1. הלקוח בוחר קובץ (או גורר).
 *   2. Upload ישיר ל-Supabase Storage bucket 'po-attachments', נתיב:
 *        ${companyId}/${poId}/${uuid}_${safeName}
 *      (ה-RLS מפעיל `user_has_company_access(company_id)` על ה-object).
 *   3. POST ל-`/api/procurement/orders/[id]/attachments` לרישום metadata.
 *   4. רענון הרשימה.
 */

import * as React from "react"
import {
  AlertTriangle,
  Download,
  Eye,
  EyeOff,
  FileIcon,
  FileStack,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button-variants"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn } from "@/lib/utils"

const BUCKET = "po-attachments"
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB

export type ProcurementOrderAttachmentDto = {
  id: string
  purchaseOrderId: string
  fileName: string
  storagePath: string
  storageBucket: string
  mimeType: string | null
  sizeBytes: number | null
  sha256: string | null
  description: string | null
  visibleToSupplier: boolean
  uploadedBy: string | null
  uploadedAt: string
  poRevisionNumber: number | null
  signedUrl: string | null
}

function safeStorageSegment(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, "_")
    .trim()
    .slice(0, 160)
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value))
  } catch {
    return value
  }
}

async function computeSha256(file: File): Promise<string | null> {
  try {
    const buffer = await file.arrayBuffer()
    const hash = await crypto.subtle.digest("SHA-256", buffer)
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  } catch {
    return null
  }
}

// ============================================================================
// Main component
// ============================================================================

export function PoAttachmentsTab({
  poId,
  companyId,
}: {
  poId: string
  /** companyId הפעילה (מועבר מה-page level) — משמש לבניית הנתיב ב-Storage. */
  companyId: string
}) {
  const [rows, setRows] = React.useState<ProcurementOrderAttachmentDto[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refetch = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await masterDataFetch<ProcurementOrderAttachmentDto[]>(
        `/api/procurement/orders/${encodeURIComponent(poId)}/attachments`
      )
      setRows(data)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "טעינת קבצים נכשלה"
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [poId])

  React.useEffect(() => {
    void refetch()
  }, [refetch])

  return (
    <div className="flex flex-col gap-4">
      <UploadCard poId={poId} companyId={companyId} onUploaded={refetch} />

      <section className="rounded-lg border border-border bg-card">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <FileStack className="size-4 text-primary" aria-hidden />
            <h2 className="text-sm font-semibold">
              קבצים מצורפים ({rows.length})
            </h2>
          </div>
          {loading ? (
            <Loader2
              className="size-4 animate-spin text-muted-foreground"
              aria-hidden
            />
          ) : null}
        </header>

        {error ? (
          <div className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive">
            <AlertTriangle className="size-3.5" aria-hidden />
            {error}
          </div>
        ) : null}

        {rows.length === 0 && !loading ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            אין קבצים מצורפים עדיין. גרור קובץ למעלה או לחץ על &quot;בחר
            קובץ&quot;.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <AttachmentRow
                key={row.id}
                row={row}
                poId={poId}
                onDeleted={refetch}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// ============================================================================
// UploadCard — dropzone + metadata form
// ============================================================================

function UploadCard({
  poId,
  companyId,
  onUploaded,
}: {
  poId: string
  companyId: string
  onUploaded: () => Promise<void>
}) {
  const [file, setFile] = React.useState<File | null>(null)
  const [description, setDescription] = React.useState("")
  const [visibleToSupplier, setVisibleToSupplier] = React.useState(false)
  const [dragActive, setDragActive] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const reset = React.useCallback(() => {
    setFile(null)
    setDescription("")
    setVisibleToSupplier(false)
    if (inputRef.current) inputRef.current.value = ""
  }, [])

  const handleSelect = React.useCallback((incoming: File | null) => {
    if (!incoming) return
    if (incoming.size > MAX_BYTES) {
      toast.error(
        `הקובץ גדול מדי (מקסימום ${(MAX_BYTES / (1024 * 1024)).toFixed(0)} MB)`
      )
      return
    }
    setFile(incoming)
  }, [])

  const handleUpload = React.useCallback(async () => {
    if (!file) {
      toast.error("בחר קובץ")
      return
    }
    setUploading(true)
    const supabase = createSupabaseBrowserClient()
    const safeName = safeStorageSegment(file.name)
    const uuid =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const storagePath = `${companyId}/${poId}/${uuid}_${safeName}`

    try {
      // 1) Upload to Storage
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "application/octet-stream",
        })
      if (upErr) throw upErr

      // 2) Compute hash for dedup (best-effort)
      const sha256 = await computeSha256(file)

      // 3) Register metadata
      try {
        await masterDataFetch(
          `/api/procurement/orders/${encodeURIComponent(poId)}/attachments`,
          {
            method: "POST",
            body: JSON.stringify({
              storagePath,
              fileName: file.name,
              mimeType: file.type || null,
              sizeBytes: file.size,
              sha256,
              description: description.trim() || null,
              visibleToSupplier,
            }),
          }
        )
      } catch (regErr) {
        // rollback storage on metadata failure
        await supabase.storage.from(BUCKET).remove([storagePath])
        throw regErr
      }

      toast.success("הקובץ הועלה בהצלחה")
      reset()
      await onUploaded()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "העלאה נכשלה"
      toast.error(message)
    } finally {
      setUploading(false)
    }
  }, [companyId, description, file, onUploaded, poId, reset, visibleToSupplier])

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Upload className="size-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold">העלאת קובץ חדש</h2>
      </div>

      {/* Dropzone */}
      <label
        htmlFor="po-attachment-file-input"
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
          dragActive
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30"
        )}
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragActive(false)
          const dropped = e.dataTransfer.files?.[0] ?? null
          handleSelect(dropped)
        }}
      >
        <Paperclip className="size-6 text-muted-foreground" aria-hidden />
        {file ? (
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-medium">{file.name}</span>
            <span className="text-xs text-muted-foreground">
              {formatBytes(file.size)}
            </span>
          </div>
        ) : (
          <div className="space-y-0.5">
            <p className="text-sm font-medium">גרור קובץ לכאן</p>
            <p className="text-xs text-muted-foreground">
              או לחץ לבחירה. מקסימום{" "}
              {(MAX_BYTES / (1024 * 1024)).toFixed(0)} MB
            </p>
          </div>
        )}
        <Input
          id="po-attachment-file-input"
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => handleSelect(e.target.files?.[0] ?? null)}
        />
      </label>

      {file ? (
        <div className="mt-3 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="po-attachment-description" className="text-xs">
              תיאור (אופציונלי)
            </Label>
            <Textarea
              id="po-attachment-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="למשל: הצעת מחיר, חוזה, datasheet…"
              disabled={uploading}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <Checkbox
              checked={visibleToSupplier}
              onCheckedChange={(v) => setVisibleToSupplier(Boolean(v))}
              disabled={uploading}
            />
            <span>גלוי לספק (פורטל ספקים — Phase 7.11)</span>
          </label>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={reset}
              disabled={uploading}
              className="gap-1.5"
            >
              <X className="size-3.5" aria-hidden />
              נקה
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleUpload()}
              disabled={uploading}
              className="gap-1.5"
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Upload className="size-3.5" aria-hidden />
              )}
              {uploading ? "מעלה…" : "העלה"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ============================================================================
// AttachmentRow
// ============================================================================

function AttachmentRow({
  row,
  poId,
  onDeleted,
}: {
  row: ProcurementOrderAttachmentDto
  poId: string
  onDeleted: () => Promise<void>
}) {
  const [deleting, setDeleting] = React.useState(false)

  const handleDelete = React.useCallback(async () => {
    const ok = window.confirm(`למחוק את "${row.fileName}"?`)
    if (!ok) return
    setDeleting(true)
    try {
      await masterDataFetch(
        `/api/procurement/orders/${encodeURIComponent(poId)}/attachments/${encodeURIComponent(row.id)}`,
        { method: "DELETE" }
      )
      toast.success("הקובץ נמחק")
      await onDeleted()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "מחיקה נכשלה"
      toast.error(message)
    } finally {
      setDeleting(false)
    }
  }, [onDeleted, poId, row.fileName, row.id])

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <FileIcon className="size-5 flex-none text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{row.fileName}</span>
          {row.visibleToSupplier ? (
            <Badge
              variant="outline"
              className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-800"
            >
              <Eye className="size-3" aria-hidden />
              גלוי לספק
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="gap-1 border-slate-300/50 bg-slate-100/40 text-xs text-slate-600"
            >
              <EyeOff className="size-3" aria-hidden />
              פנימי
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{formatBytes(row.sizeBytes)}</span>
          {row.mimeType ? (
            <span className="font-mono">{row.mimeType}</span>
          ) : null}
          <span>{formatDateTime(row.uploadedAt)}</span>
        </div>
        {row.description ? (
          <p className="mt-1 text-xs text-muted-foreground">{row.description}</p>
        ) : null}
      </div>
      <div className="flex flex-none items-center gap-1">
        {row.signedUrl ? (
          <a
            href={row.signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={row.fileName}
            className={cn(
              buttonVariants({ size: "sm", variant: "ghost" }),
              "gap-1.5"
            )}
            aria-disabled={deleting}
          >
            <Download className="size-3.5" aria-hidden />
            הורד
          </a>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void handleDelete()}
          disabled={deleting}
          className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label={`מחק ${row.fileName}`}
        >
          {deleting ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="size-3.5" aria-hidden />
          )}
        </Button>
      </div>
    </li>
  )
}
