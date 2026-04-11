"use client"

import * as React from "react"
import { useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  FileUp,
  Loader2,
  Save,
  Sparkles,
  Upload,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  createContractFromDraft,
  generateContractDraftFromPdf,
} from "@/lib/marker-ofek/contracts/ai-contract-actions"
import type { ErpContractCreateInput } from "@/lib/marker-ofek/erp-validation-schemas"
import { cn } from "@/lib/utils"

const MOCK_PROJECT_ID = "00000000-0000-0000-0000-000000000000"

const ACCEPT_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])

function fileToBase64DataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      if (typeof dataUrl !== "string") {
        reject(new Error("קריאת קובץ נכשלה"))
        return
      }
      const comma = dataUrl.indexOf(",")
      if (comma === -1) {
        reject(new Error("פורמט קובץ לא צפוי"))
        return
      }
      resolve(dataUrl.slice(comma + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error("קריאת קובץ נכשלה"))
    reader.readAsDataURL(file)
  })
}

function isAcceptedFile(file: File): boolean {
  if (ACCEPT_MIME.has(file.type)) return true
  return file.type.startsWith("image/")
}

export type AiContractImportModalProps = {
  isOpen: boolean
  onClose: () => void
  entityId: string
  projectId?: string
}

export function AiContractImportModal({
  isOpen,
  onClose,
  entityId,
  projectId,
}: AiContractImportModalProps) {
  const router = useRouter()
  const resolvedProjectId = projectId ?? MOCK_PROJECT_ID
  const [isDragging, setIsDragging] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<ErpContractCreateInput | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isSavingDraft, setIsSavingDraft] = React.useState(false)

  useEffect(() => {
    if (!isOpen) {
      setLoadError(null)
      setDraft(null)
      setIsDragging(false)
    }
  }, [isOpen])

  const runIngest = React.useCallback(
    (file: File) => {
      if (!isAcceptedFile(file)) {
        setLoadError("נא להעלות PDF או תמונה בלבד")
        return
      }
      setLoadError(null)
      setDraft(null)
      startTransition(async () => {
        try {
          const base64Data = await fileToBase64DataUrl(file)
          const mimeType = file.type || "application/octet-stream"
          const result = await generateContractDraftFromPdf(
            base64Data,
            mimeType,
            resolvedProjectId,
            entityId
          )
          if (result.success) {
            setDraft(result.data)
          } else {
            setLoadError(result.error)
          }
        } catch (e) {
          setLoadError(
            e instanceof Error ? e.message : "שגיאה בהעלאת הקובץ"
          )
        }
      })
    },
    [entityId, resolvedProjectId]
  )

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) runIngest(file)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) runIngest(file)
    e.target.value = ""
  }

  async function handleSaveApproved() {
    if (!draft) return
    const toastId = toast.loading("שומר חוזה במסד הנתונים...")
    setIsSavingDraft(true)
    try {
      const result = await createContractFromDraft(draft)
      if (result.success) {
        toast.success("החוזה נשמר בהצלחה", { id: toastId })
        router.refresh()
        onClose()
      } else {
        toast.error(result.error, { id: toastId })
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "שגיאה בשמירת החוזה",
        { id: toastId }
      )
    } finally {
      setIsSavingDraft(false)
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        className="max-h-[min(92vh,900px)] gap-0 overflow-hidden p-0 sm:max-w-3xl"
        showCloseButton
      >
        <div className="max-h-[min(92vh,900px)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="text-start">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-amber-500" />
              ייבוא חוזה באמצעות AI
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              גררו PDF או תמונה של החוזה. המערכת תחלץ שדות לביקור לפני שמירה.
            </p>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div
              onDragEnter={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                if (e.currentTarget === e.target) setIsDragging(false)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = "copy"
              }}
              onDrop={onDrop}
              className={cn(
                "flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
                isDragging
                  ? "border-blue-500 bg-blue-50/80"
                  : "border-slate-300 bg-slate-50/50 hover:border-slate-400",
                (isPending || isSavingDraft) && "pointer-events-none opacity-60"
              )}
            >
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                id="ai-contract-file"
                onChange={onFileChange}
                disabled={isPending || isSavingDraft}
              />
              <label
                htmlFor="ai-contract-file"
                className="flex cursor-pointer flex-col items-center gap-2"
              >
                {isPending ? (
                  <Loader2 className="size-10 animate-spin text-blue-600" />
                ) : (
                  <Upload className="size-10 text-slate-400" />
                )}
                <span className="text-sm font-medium text-slate-700">
                  {isPending
                    ? "ה-AI מנתח את החוזה..."
                    : "גררו קובץ לכאן או לחצו לבחירה"}
                </span>
                <span className="text-xs text-slate-500">
                  PDF, JPEG, PNG, WebP, GIF
                </span>
              </label>
            </div>

            {loadError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {loadError}
              </p>
            ) : null}

            {draft ? (
              <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-start">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <FileUp className="size-4" />
                  טיוטה לביקור (Human in the Loop)
                </h3>
                <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                  <ReviewRow label="מזהה פרויקט" value={draft.projectId} />
                  <ReviewRow label="מזהה לקוח (ישות)" value={draft.clientEntityId} />
                  <ReviewRow label="תאריך התחלה" value={draft.startDate} />
                  <ReviewRow label="סוג חוזה" value={draft.contractType} />
                  <ReviewRow label="מודל תמחור" value={draft.pricingModel} />
                  <ReviewRow
                    label="מספר חוזה"
                    value={draft.contractNumber ?? "—"}
                  />
                  <ReviewRow
                    label="שם תצוגה"
                    value={draft.contractDisplayName ?? "—"}
                    className="sm:col-span-2"
                  />
                  <ReviewRow
                    label="אחוז עכבון"
                    value={String(draft.retentionPct)}
                  />
                  <ReviewRow
                    label="ביטוח %"
                    value={String(draft.insurancePct)}
                  />
                  <ReviewRow label="בדיקות %" value={String(draft.testingPct)} />
                  <ReviewRow
                    label="סכום פאושלי"
                    value={
                      draft.paushalTotalValue != null
                        ? String(draft.paushalTotalValue)
                        : "—"
                    }
                  />
                </dl>

                {draft.boqRows && draft.boqRows.length > 0 ? (
                  <div className="overflow-x-auto">
                    <p className="mb-1 text-[11px] font-semibold text-slate-600">
                      שורות BoQ
                    </p>
                    <table className="w-full min-w-[480px] border-collapse text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-start">
                          <th className="p-1.5">סעיף</th>
                          <th className="p-1.5">תיאור</th>
                          <th className="p-1.5">יח׳</th>
                          <th className="p-1.5">כמות</th>
                          <th className="p-1.5">מחיר יחידה</th>
                        </tr>
                      </thead>
                      <tbody>
                        {draft.boqRows.map((row, i) => (
                          <tr
                            key={`${row.sectionCode}-${i}`}
                            className="border-b border-slate-100"
                          >
                            <td className="p-1.5 font-mono">{row.sectionCode}</td>
                            <td className="p-1.5">{row.description}</td>
                            <td className="p-1.5">{row.unit}</td>
                            <td className="p-1.5 tabular-nums">{row.quantity}</td>
                            <td className="p-1.5 tabular-nums">{row.unitPrice}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {draft.paushalRows && draft.paushalRows.length > 0 ? (
                  <div className="overflow-x-auto">
                    <p className="mb-1 text-[11px] font-semibold text-slate-600">
                      אבני דרך פאושליות
                    </p>
                    <table className="w-full min-w-[400px] border-collapse text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-start">
                          <th className="p-1.5">סעיף</th>
                          <th className="p-1.5">תיאור</th>
                          <th className="p-1.5">משקל %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {draft.paushalRows.map((row, i) => (
                          <tr
                            key={`${row.sectionCode}-${i}`}
                            className="border-b border-slate-100"
                          >
                            <td className="p-1.5 font-mono">{row.sectionCode}</td>
                            <td className="p-1.5">{row.description}</td>
                            <td className="p-1.5 tabular-nums">{row.weightPct}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                <details className="rounded border border-slate-100">
                  <summary className="cursor-pointer px-2 py-1.5 text-[11px] text-slate-500">
                    JSON מלא (למפתחים)
                  </summary>
                  <pre className="max-h-40 overflow-auto p-2 text-[10px] leading-relaxed">
                    {JSON.stringify(draft, null, 2)}
                  </pre>
                </details>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2 border-t bg-muted/30 px-4 py-3 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSavingDraft}
          >
            סגור
          </Button>
          <Button
            type="button"
            disabled={!draft || isPending || isSavingDraft}
            onClick={() => void handleSaveApproved()}
            className="gap-2"
          >
            {isSavingDraft ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            שמור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReviewRow({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-mono text-[11px] text-slate-900 break-all" dir="ltr">
        {value}
      </dd>
    </div>
  )
}
