"use client"

/**
 * Suppliers Master/Detail → Detail tab: מסמכים (DMS).
 *
 * רשימת מסמכים מצורפים ברמת ספק (`erp_supplier_attachments` — Phase 9.2)
 * עם **העלאה / הורדה / מחיקה** מלאה. מקביל לתאב "מסמכים לספק" ב-Priority
 * (Batch #5, תמונה #23 — חוזה שירות PDF, אישור ניכוי, מפרט).
 *
 * זרימת ההעלאה (mirror של PoAttachmentsTab — Phase 7.13.1.B):
 *   1. הלקוח: upload ל-bucket `supplier-attachments` ב-Supabase Storage,
 *      תחת הנתיב `${companyId}/${supplierId}/${uuid}_${safeName}`.
 *   2. הלקוח: POST ל-API לרישום metadata (כולל `documentType`).
 *   3. אם POST נכשל — הלקוח מסיר את ה-Storage object ב-rollback.
 *   4. רענון הרשימה.
 *
 * RLS אוכף בשתי שכבות: על ה-Storage path-prefix ועל טבלת ה-metadata.
 */

import * as React from "react"
import {
  AlertTriangle,
  Download,
  FileIcon,
  FileStack,
  Loader2,
  Lock,
  Paperclip,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button-variants"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { MasterDetailTabEmpty } from "@/components/infrastructure/master-detail/master-detail-shell"
import { readActiveCompanyIdFromCookie } from "@/lib/company-context"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn } from "@/lib/utils"

const BUCKET = "supplier-attachments"
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB
const SIGNED_URL_NONE_PLACEHOLDER = ""

type SupplierDocumentType =
  | "SERVICE_CONTRACT"
  | "TECH_SPEC"
  | "PRICE_QUOTE"
  | "WITHHOLDING_TAX_CERT"
  | "BOOKKEEPING_CERT"
  | "INSURANCE_CERT"
  | "BUSINESS_LICENSE"
  | "BANK_DETAILS"
  | "OTHER"

const DOCUMENT_TYPE_LABEL: Record<SupplierDocumentType, string> = {
  SERVICE_CONTRACT: "חוזה שירות",
  TECH_SPEC: "מפרט טכני",
  PRICE_QUOTE: "הצעת מחיר",
  WITHHOLDING_TAX_CERT: "אישור ניכוי מס",
  BOOKKEEPING_CERT: "אישור ניהול ספרים",
  INSURANCE_CERT: "אישור ביטוח",
  BUSINESS_LICENSE: "רישיון עסק",
  BANK_DETAILS: "פרטי בנק",
  OTHER: "אחר",
}

const DOCUMENT_TYPE_ORDER: SupplierDocumentType[] = [
  "SERVICE_CONTRACT",
  "TECH_SPEC",
  "PRICE_QUOTE",
  "WITHHOLDING_TAX_CERT",
  "BOOKKEEPING_CERT",
  "INSURANCE_CERT",
  "BUSINESS_LICENSE",
  "BANK_DETAILS",
  "OTHER",
]

type DocumentRow = {
  id: string
  fileName: string
  documentType: SupplierDocumentType | null
  description: string | null
  mimeType: string | null
  sizeBytes: number | null
  storagePath: string
  storageBucket: string
  uploadedAt: string
  isLocked: boolean
  isFlagged: boolean
  signedUrl: string | null
}

const dateTimeFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
})

function formatBytes(bytes: number | null): string {
  if (bytes == null || bytes === 0) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function safeStorageSegment(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, "_")
    .trim()
    .slice(0, 160)
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

export function SupplierDocumentsTab({
  supplierId,
}: {
  supplierId: string | null
}) {
  const [rows, setRows] = React.useState<DocumentRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const refetch = React.useCallback(async () => {
    if (!supplierId) return
    setLoading(true)
    setError(null)
    try {
      const data = await masterDataFetch<DocumentRow[]>(
        `/api/master-data/suppliers/${encodeURIComponent(supplierId)}/documents`,
      )
      setRows(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "טעינת מסמכים נכשלה")
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [supplierId])

  React.useEffect(() => {
    let cancelled = false
    if (!supplierId) {
      setRows([])
      return
    }
    void (async () => {
      if (cancelled) return
      await refetch()
    })()
    return () => {
      cancelled = true
    }
  }, [supplierId, refetch])

  if (!supplierId) {
    return (
      <MasterDetailTabEmpty>
        בחר ספק במסך האב כדי לראות את המסמכים שלו (חוזים, אישורים, מפרטים).
      </MasterDetailTabEmpty>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-1">
      <UploadCard supplierId={supplierId} onUploaded={refetch} />

      <section className="rounded-lg border border-border bg-card">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <FileStack className="size-4 text-primary" aria-hidden />
            <h2 className="text-sm font-semibold">
              מסמכים מצורפים ({rows.length})
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

        {rows.length === 0 && !loading && !error ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            לא הועלו מסמכים לספק זה. גרור קובץ למעלה או לחץ &quot;בחר קובץ&quot;.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <DocumentRowItem
                key={row.id}
                row={row}
                supplierId={supplierId}
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
  supplierId,
  onUploaded,
}: {
  supplierId: string
  onUploaded: () => Promise<void>
}) {
  const [file, setFile] = React.useState<File | null>(null)
  const [documentType, setDocumentType] =
    React.useState<SupplierDocumentType | "">("")
  const [description, setDescription] = React.useState("")
  const [dragActive, setDragActive] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const reset = React.useCallback(() => {
    setFile(null)
    setDocumentType("")
    setDescription("")
    if (inputRef.current) inputRef.current.value = ""
  }, [])

  const handleSelect = React.useCallback((incoming: File | null) => {
    if (!incoming) return
    if (incoming.size > MAX_BYTES) {
      toast.error(
        `הקובץ גדול מדי (מקסימום ${(MAX_BYTES / (1024 * 1024)).toFixed(0)} MB)`,
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
    const companyId = readActiveCompanyIdFromCookie()
    if (!companyId) {
      toast.error("חברה פעילה לא נמצאה. בחר חברה במעלה הדף.")
      return
    }

    setUploading(true)
    const supabase = createSupabaseBrowserClient()
    const safeName = safeStorageSegment(file.name)
    const uuid =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const storagePath = `${companyId}/${supplierId}/${uuid}_${safeName}`

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
          `/api/master-data/suppliers/${encodeURIComponent(supplierId)}/documents`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              storagePath,
              fileName: file.name,
              mimeType: file.type || null,
              sizeBytes: file.size,
              sha256,
              description: description.trim() || null,
              documentType: documentType || null,
            }),
          },
        )
      } catch (regErr) {
        // rollback storage on metadata failure
        try {
          await supabase.storage.from(BUCKET).remove([storagePath])
        } catch {
          // ignore
        }
        throw regErr
      }

      toast.success("המסמך הועלה בהצלחה")
      reset()
      await onUploaded()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "ההעלאה נכשלה"
      toast.error(message)
    } finally {
      setUploading(false)
    }
  }, [description, documentType, file, onUploaded, reset, supplierId])

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <Upload className="size-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold">העלאת מסמך חדש</h2>
      </div>

      {/* Dropzone */}
      <label
        htmlFor="supplier-doc-file-input"
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors",
          dragActive
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30",
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
        <Paperclip className="size-5 text-muted-foreground" aria-hidden />
        {file ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-sm font-medium">{file.name}</span>
            <span className="text-xs text-muted-foreground">
              {formatBytes(file.size)}
            </span>
          </div>
        ) : (
          <div className="space-y-0.5">
            <p className="text-xs font-medium">גרור קובץ לכאן</p>
            <p className="text-[10px] text-muted-foreground">
              או לחץ לבחירה. מקסימום{" "}
              {(MAX_BYTES / (1024 * 1024)).toFixed(0)} MB
            </p>
          </div>
        )}
        <Input
          id="supplier-doc-file-input"
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => handleSelect(e.target.files?.[0] ?? null)}
        />
      </label>

      {file ? (
        <div className="mt-3 grid gap-2.5">
          <div className="grid gap-1.5">
            <Label htmlFor="supplier-doc-type" className="text-xs">
              סוג המסמך
            </Label>
            <Select
              value={documentType || SIGNED_URL_NONE_PLACEHOLDER}
              onValueChange={(v) =>
                setDocumentType(v ? (v as SupplierDocumentType) : "")
              }
              disabled={uploading}
            >
              <SelectTrigger id="supplier-doc-type" className="h-8 text-xs">
                <SelectValue placeholder="בחר סוג…" />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPE_ORDER.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">
                    {DOCUMENT_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="supplier-doc-description" className="text-xs">
              תיאור (אופציונלי)
            </Label>
            <Textarea
              id="supplier-doc-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="למשל: חוזה שירות 2026, פג תוקף 31/12/26"
              disabled={uploading}
              className="text-xs"
            />
          </div>

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
// DocumentRowItem
// ============================================================================

function DocumentRowItem({
  row,
  supplierId,
  onDeleted,
}: {
  row: DocumentRow
  supplierId: string
  onDeleted: () => Promise<void>
}) {
  const [deleting, setDeleting] = React.useState(false)

  const handleDelete = React.useCallback(async () => {
    if (row.isLocked) {
      toast.error("המסמך נעול ולא ניתן למחיקה")
      return
    }
    const ok = window.confirm(`למחוק את "${row.fileName}"?`)
    if (!ok) return
    setDeleting(true)
    try {
      await masterDataFetch(
        `/api/master-data/suppliers/${encodeURIComponent(supplierId)}/documents/${encodeURIComponent(row.id)}`,
        { method: "DELETE" },
      )
      toast.success("המסמך נמחק")
      await onDeleted()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "מחיקה נכשלה"
      toast.error(message)
    } finally {
      setDeleting(false)
    }
  }, [onDeleted, row.fileName, row.id, row.isLocked, supplierId])

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <FileIcon className="size-5 flex-none text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{row.fileName}</span>
          {row.documentType ? (
            <Badge
              variant="outline"
              className="border-sky-400/30 bg-sky-500/10 text-[10px] text-sky-800 dark:text-sky-300"
            >
              {DOCUMENT_TYPE_LABEL[row.documentType] ?? row.documentType}
            </Badge>
          ) : null}
          {row.isLocked ? (
            <Badge
              variant="outline"
              className="gap-1 border-amber-400/30 bg-amber-500/10 text-[10px] text-amber-800 dark:text-amber-300"
            >
              <Lock className="size-2.5" aria-hidden />
              נעול
            </Badge>
          ) : null}
          {row.isFlagged ? (
            <Badge
              variant="outline"
              className="gap-1 border-rose-400/30 bg-rose-500/10 text-[10px] text-rose-700 dark:text-rose-300"
            >
              <AlertTriangle className="size-2.5" aria-hidden />
              מסומן
            </Badge>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          <span>{formatBytes(row.sizeBytes)}</span>
          {row.mimeType ? (
            <span className="font-mono">{row.mimeType}</span>
          ) : null}
          <span>{dateTimeFormatter.format(new Date(row.uploadedAt))}</span>
        </div>
        {row.description ? (
          <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
            {row.description}
          </p>
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
              "gap-1.5",
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
          disabled={deleting || row.isLocked}
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
