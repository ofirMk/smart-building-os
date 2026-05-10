"use client"

import * as React from "react"
import { Loader2, Upload } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  dmsFinalizeUpload,
  dmsInitiateUpload,
} from "@/lib/marker-ofek/dms/dms-actions"
import {
  DMS_MAX_UPLOAD_BYTES,
  DMS_DEFAULT_FOLDERS,
} from "@/lib/marker-ofek/dms/dms-constants"
import type {
  DmsConfidentialityLevel,
  DmsDocumentKind,
  DmsFolder,
} from "@/lib/marker-ofek/dms/dms-types"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"

const KIND_OPTIONS: ReadonlyArray<{ value: DmsDocumentKind; label: string }> = [
  { value: "PLAN", label: "תוכנית" },
  { value: "PERMIT", label: "היתר" },
  { value: "CERTIFICATE", label: "תעודה" },
  { value: "CONTRACT", label: "חוזה" },
  { value: "INVOICE", label: "חשבונית" },
  { value: "DELIVERY_NOTE", label: "תעודת משלוח" },
  { value: "CORRESPONDENCE", label: "מכתב" },
  { value: "PHOTO", label: "תמונה" },
  { value: "OTHER", label: "אחר" },
]

const CONFIDENTIALITY_OPTIONS: ReadonlyArray<{
  value: DmsConfidentialityLevel
  label: string
}> = [
  { value: "PUBLIC", label: "ציבורי" },
  { value: "INTERNAL", label: "פנימי" },
  { value: "RESTRICTED", label: "מוגבל" },
  { value: "SECRET", label: "סודי" },
]

/** Pick a sensible default document_kind from the folder's vault key. */
function inferKindForFolder(folder: DmsFolder): DmsDocumentKind {
  const match = DMS_DEFAULT_FOLDERS.find(
    (d) => d.vaultFolderKey === folder.vaultFolderKey
  )
  return match?.hintKind ?? "OTHER"
}

/** Browser-side SHA-256 of a File. Returns hex string suitable for the DDL regex. */
async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest("SHA-256", buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export function DmsUploadDialog({
  open,
  onClose,
  folder,
  onUploaded,
}: {
  open: boolean
  onClose: () => void
  folder: DmsFolder
  onUploaded: () => void
}) {
  const [file, setFile] = React.useState<File | null>(null)
  const [title, setTitle] = React.useState("")
  const [documentKind, setDocumentKind] = React.useState<DmsDocumentKind>(() =>
    inferKindForFolder(folder)
  )
  const [confidentiality, setConfidentiality] =
    React.useState<DmsConfidentialityLevel>("INTERNAL")
  const [changeNote, setChangeNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [phase, setPhase] = React.useState<
    "idle" | "hashing" | "initiating" | "uploading" | "finalizing"
  >("idle")
  const [progress, setProgress] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    /** Reset every time the dialog opens so a previous failed upload doesn't leak. */
    setFile(null)
    setTitle("")
    setDocumentKind(inferKindForFolder(folder))
    setConfidentiality("INTERNAL")
    setChangeNote("")
    setBusy(false)
    setPhase("idle")
    setProgress(0)
  }, [open, folder])

  function onPickFile(f: File | null) {
    setFile(f)
    if (f && !title.trim()) {
      /** Pre-fill title from filename without extension. */
      const stem = f.name.replace(/\.[^.]+$/, "")
      setTitle(stem)
    }
  }

  async function onConfirm() {
    if (!file) {
      toast.error("בחרו קובץ")
      return
    }
    if (file.size === 0) {
      toast.error("הקובץ ריק")
      return
    }
    if (file.size > DMS_MAX_UPLOAD_BYTES) {
      toast.error("הקובץ חורג מ-250MB")
      return
    }

    setBusy(true)
    let createdVersionId: string | null = null
    let createdStoragePath: string | null = null
    let createdBucket: string | null = null

    try {
      /** 1) Hash the file client-side so the DB row carries a real checksum. */
      setPhase("hashing")
      setProgress(5)
      const checksum = await sha256Hex(file)

      /** 2) Initiate — DB row inserted with is_quarantined=true. */
      setPhase("initiating")
      setProgress(20)
      const init = await dmsInitiateUpload({
        folderId: folder.id,
        documentId: null,
        title: title.trim() || file.name,
        documentKind,
        confidentialityLevel: confidentiality,
        originalFilename: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        checksumSha256: checksum,
        changeNote: changeNote.trim() || null,
      })
      if (!init.ok) {
        toast.error(init.error)
        return
      }
      createdVersionId = init.versionId
      createdStoragePath = init.storagePath
      createdBucket = init.storageBucket

      /** 3) Upload binary directly via authenticated session. Storage RLS validates
       *     the staged version row. */
      setPhase("uploading")
      setProgress(40)
      const supabase = createSupabaseBrowserClient()
      const { error: upErr } = await supabase.storage
        .from(init.storageBucket)
        .upload(init.storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "application/octet-stream",
        })
      if (upErr) {
        toast.error(`העלאה נכשלה: ${upErr.message}`)
        return
      }

      /** 4) Finalize — clears quarantine, sets current_version_id, audits. */
      setPhase("finalizing")
      setProgress(85)
      const fin = await dmsFinalizeUpload({ versionId: init.versionId })
      if (!fin.ok) {
        toast.error(fin.error)
        return
      }

      setProgress(100)
      toast.success("הקובץ הועלה בהצלחה")
      onUploaded()
      onClose()
    } catch (e) {
      toast.error(formatError(e))

      /** Best-effort cleanup of orphaned storage object on any failure after upload. */
      if (createdStoragePath && createdBucket) {
        try {
          const supabase = createSupabaseBrowserClient()
          await supabase.storage.from(createdBucket).remove([createdStoragePath])
        } catch {
          /* swallow cleanup errors */
        }
      }
      void createdVersionId
    } finally {
      setBusy(false)
      setPhase("idle")
    }
  }

  const phaseLabel: Record<typeof phase, string> = {
    idle: "",
    hashing: "מחשב טביעת אצבע…",
    initiating: "יוצר רשומת מסמך…",
    uploading: "מעלה קובץ…",
    finalizing: "מסיים ומאמת…",
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent dir="rtl" lang="he" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>העלאת קובץ ל-&quot;{folder.name}&quot;</DialogTitle>
          <DialogDescription>
            הקובץ ייסרק אוטומטית ויוסף לרשימה לאחר אישור. גודל מקסימלי: 250MB.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="dms-file">קובץ</Label>
            <Input
              id="dms-file"
              type="file"
              disabled={busy}
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <div className="text-xs text-muted-foreground">
                {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dms-title">כותרת המסמך</Label>
            <Input
              id="dms-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="כותרת לתצוגה"
              disabled={busy}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>סוג מסמך</Label>
              <Select
                value={documentKind}
                onValueChange={(v) => setDocumentKind(v as DmsDocumentKind)}
                disabled={busy}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>רמת סודיות</Label>
              <Select
                value={confidentiality}
                onValueChange={(v) =>
                  setConfidentiality(v as DmsConfidentialityLevel)
                }
                disabled={busy}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONFIDENTIALITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dms-note">הערה לגרסה (אופציונלי)</Label>
            <Textarea
              id="dms-note"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="למה הועלתה הגרסה הזו?"
              disabled={busy}
              rows={2}
            />
          </div>

          {busy && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {phaseLabel[phase]}
              </div>
              <Progress value={progress} />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            ביטול
          </Button>
          <Button onClick={onConfirm} disabled={busy || !file}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            העלאה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
