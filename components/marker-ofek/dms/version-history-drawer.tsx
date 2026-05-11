"use client"

import * as React from "react"
import { format } from "date-fns"
import { he } from "date-fns/locale"
import {
  AlertCircle,
  Download,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import {
  dmsGetDownloadUrl,
  dmsListVersions,
  dmsRevertToVersion,
  type DmsVersionListItem,
} from "@/lib/marker-ofek/dms/dms-actions"
import type { DmsCapability } from "@/lib/marker-ofek/dms/dms-types"
import { cn, formatError } from "@/lib/utils"

type VersionHistoryDrawerProps = {
  open: boolean
  onClose: () => void
  documentId: string | null
  documentTitle: string
  /** Capabilities effective on the document (or root, as a proxy). */
  capabilities: DmsCapability[]
  /** Called after a successful revert so the parent reloads its document list. */
  onRevertSuccess?: () => void
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function DmsVersionHistoryDrawer({
  open,
  onClose,
  documentId,
  documentTitle,
  capabilities,
  onRevertSuccess,
}: VersionHistoryDrawerProps) {
  const [versions, setVersions] = React.useState<DmsVersionListItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [revertingId, setRevertingId] = React.useState<string | null>(null)
  const [confirmId, setConfirmId] = React.useState<string | null>(null)
  const [confirmNote, setConfirmNote] = React.useState("")

  const canRevert = capabilities.includes("UPLOAD_VERSION")
  const canDownload = capabilities.includes("DOWNLOAD")

  const reload = React.useCallback(async () => {
    if (!documentId) return
    setLoading(true)
    setError(null)
    try {
      const res = await dmsListVersions({ documentId })
      if (!res.ok) {
        setError(res.error)
        setVersions([])
        return
      }
      setVersions(res.versions)
    } catch (e) {
      setError(formatError(e))
      setVersions([])
    } finally {
      setLoading(false)
    }
  }, [documentId])

  React.useEffect(() => {
    if (open && documentId) {
      void reload()
    } else {
      /** Reset when the drawer closes so a different document opens fresh. */
      setVersions([])
      setError(null)
      setConfirmId(null)
      setConfirmNote("")
    }
  }, [open, documentId, reload])

  async function handleDownload(versionId: string) {
    try {
      const res = await dmsGetDownloadUrl({ versionId })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      window.open(res.url, "_blank", "noopener,noreferrer")
    } catch (e) {
      toast.error(formatError(e))
    }
  }

  async function handleRevert(versionId: string) {
    if (!documentId) return
    setRevertingId(versionId)
    try {
      const res = await dmsRevertToVersion({
        documentId,
        versionId,
        changeNote: confirmNote.trim() || null,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`שוחזר בהצלחה — נוצרה גרסה v${res.newVersionNumber}`)
      setConfirmId(null)
      setConfirmNote("")
      await reload()
      onRevertSuccess?.()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setRevertingId(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        dir="rtl"
        lang="he"
        className="flex w-full flex-col gap-0 sm:max-w-lg"
      >
        <SheetHeader className="space-y-1 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <History className="size-4 text-amber-500" />
            היסטוריית גרסאות
          </SheetTitle>
          <SheetDescription className="truncate">{documentTitle}</SheetDescription>
        </SheetHeader>

        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="text-xs text-muted-foreground">
            {loading
              ? "טוען…"
              : `${versions.length} גרסאות`}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void reload()}
            disabled={loading}
          >
            <RefreshCw
              className={cn("size-3.5", loading && "animate-spin")}
            />
            רענון
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-3 p-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>שגיאת טעינה</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {!error && loading && versions.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                טוען היסטוריה…
              </div>
            )}

            {!error && !loading && versions.length === 0 && (
              <div className="py-12 text-center text-sm text-muted-foreground">
                אין גרסאות זמינות
              </div>
            )}

            {versions.map((v) => {
              const isConfirming = confirmId === v.id
              const isReverting = revertingId === v.id
              const uploaderLabel =
                v.uploadedByEmail ?? v.uploadedBy ?? "—"
              return (
                <div
                  key={v.id}
                  className={cn(
                    "rounded-lg border p-3 transition-colors",
                    v.isCurrent &&
                      "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20"
                  )}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">
                          v{v.versionNumber}
                        </span>
                        {v.isCurrent && (
                          <Badge
                            variant="default"
                            className="h-5 bg-emerald-600 px-1.5 text-[10px] hover:bg-emerald-600"
                          >
                            נוכחית
                          </Badge>
                        )}
                        {v.isQuarantined && (
                          <Badge
                            variant="secondary"
                            className="h-5 px-1.5 text-[10px]"
                          >
                            <ShieldAlert className="me-1 size-2.5" />
                            בהסגר
                          </Badge>
                        )}
                        {v.archivedAt && (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px]"
                          >
                            ארכיון
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {v.originalFilename}
                      </div>
                    </div>
                    <div className="text-right text-[11px] text-muted-foreground">
                      <div>
                        {format(new Date(v.uploadedAt), "dd MMM HH:mm", {
                          locale: he,
                        })}
                      </div>
                      <div>{formatBytes(v.sizeBytes)}</div>
                    </div>
                  </div>

                  {v.changeNote && (
                    <div className="mb-2 rounded bg-muted/50 px-2 py-1 text-xs">
                      {v.changeNote}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="truncate">{uploaderLabel}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        disabled={
                          !canDownload || v.isQuarantined || !!revertingId
                        }
                        onClick={() => handleDownload(v.id)}
                      >
                        <Download className="size-3" />
                        הורדה
                      </Button>
                      {!v.isCurrent && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          disabled={
                            !canRevert ||
                            v.isQuarantined ||
                            !!revertingId
                          }
                          onClick={() => {
                            setConfirmId(isConfirming ? null : v.id)
                            setConfirmNote("")
                          }}
                        >
                          {isReverting ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <RotateCcw className="size-3" />
                          )}
                          שחזר
                        </Button>
                      )}
                    </div>
                  </div>

                  {isConfirming && !v.isCurrent && (
                    <>
                      <Separator className="my-2" />
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          השחזור יוצר גרסה חדשה בראש העץ עם תוכן זהה ל-v
                          {v.versionNumber}. הגרסאות הקיימות נשארות בארכיון.
                        </p>
                        <Textarea
                          value={confirmNote}
                          onChange={(e) => setConfirmNote(e.target.value)}
                          placeholder={`למה שוחזר מ-v${v.versionNumber}? (אופציונלי)`}
                          rows={2}
                          className="text-xs"
                          disabled={isReverting}
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            disabled={isReverting}
                            onClick={() => {
                              setConfirmId(null)
                              setConfirmNote("")
                            }}
                          >
                            ביטול
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={isReverting}
                            onClick={() => void handleRevert(v.id)}
                          >
                            {isReverting && (
                              <Loader2 className="size-3 animate-spin" />
                            )}
                            אישור שחזור
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
