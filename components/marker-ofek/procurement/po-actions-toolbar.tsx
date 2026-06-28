"use client"

/**
 * PO Actions Toolbar
 *
 * Two rows in the PO detail header:
 *
 * Row 1 — State-machine transition buttons (dynamic, driven by getAvailableTransitions).
 *   Each button reflects the current PO status. Destructive transitions (CANCEL, CLOSE, REOPEN)
 *   require confirmation via AlertDialog before executing. Per-button optimistic spinner.
 *
 * Row 2 — Export buttons (PDF download + send email), visible only when PO is APPROVED+.
 */

import * as React from "react"
import {
  CheckCircle2,
  Download,
  FileText,
  Lock,
  Loader2,
  PackageCheck,
  PackageOpen,
  RefreshCw,
  RotateCcw,
  Send,
  Ship,
  Truck,
  Unlock,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { masterDataFetch } from "@/lib/erp/master-data-browser"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { Textarea } from "@/components/ui/textarea"
import { readActiveCompanyIdFromCookie } from "@/lib/company-context"
import {
  getAvailableTransitions,
  getTransitionLabel,
  type POStatus,
  type POTransition,
} from "@/lib/procurement/po-state-machine"
import {
  PoOfficialPdfDocument,
  type PoOfficialPdfLine,
  type PoOfficialPdfProps,
} from "@/components/marker-ofek/procurement/po-official-pdf"

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const dateTimeFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "medium",
  timeStyle: "short",
})
const dateOnlyFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "medium",
})

function formatDateTime(iso: string): string {
  try {
    return dateTimeFormatter.format(new Date(iso))
  } catch {
    return iso
  }
}

// ─────────────────────────────────────────────
// Transition config
// ─────────────────────────────────────────────

type TransitionConfig = {
  icon: React.ElementType
  /** Tailwind classes appended to Button (for colour overrides beyond variant). */
  className?: string
  variant: "default" | "outline" | "destructive" | "secondary"
}

const TRANSITION_CONFIG: Record<POTransition, TransitionConfig> = {
  SUBMIT:           { icon: CheckCircle2,  variant: "default"                                                          },
  APPROVE:          { icon: CheckCircle2,  variant: "default",      className: "bg-green-600 hover:bg-green-700 text-white" },
  REVERT:           { icon: RotateCcw,     variant: "outline"                                                          },
  PROFORMA:         { icon: FileText,      variant: "outline"                                                          },
  SEND:             { icon: Send,          variant: "default"                                                          },
  CONFIRM_SHIPMENT: { icon: PackageCheck,  variant: "default"                                                          },
  SHIP:             { icon: Ship,          variant: "default"                                                          },
  RECEIVE_PARTIAL:  { icon: PackageOpen,   variant: "default"                                                          },
  RECEIVE_FULL:     { icon: PackageCheck,  variant: "default",      className: "bg-green-600 hover:bg-green-700 text-white" },
  CLOSE:            { icon: Lock,          variant: "outline",      className: "border-indigo-400 text-indigo-700 hover:bg-indigo-50" },
  REOPEN:           { icon: Unlock,        variant: "outline",      className: "border-amber-400 text-amber-700 hover:bg-amber-50"   },
  RESTORE:          { icon: RefreshCw,     variant: "outline"                                                          },
  CANCEL:           { icon: XCircle,       variant: "destructive"                                                      },
}

/** Transitions that require an AlertDialog confirmation before executing. */
const DESTRUCTIVE_TRANSITIONS = new Set<POTransition>(["CANCEL", "CLOSE", "REOPEN"])

const DESTRUCTIVE_WARNINGS: Partial<Record<POTransition, string>> = {
  CANCEL: "פעולה זו תבטל את הזמנת הרכש לצמיתות. לא ניתן לבטל פעולה זו.",
  CLOSE:  "סגירת ההזמנה תסמן אותה כסופית. ניתן יהיה לפתוח מחדש בהמשך.",
  REOPEN: "פתיחה מחדש תחזיר את ההזמנה לסטטוס REOPENED ותדרוש אישור מחדש.",
}

/** Statuses for which the PDF export / email-send row is shown. */
const EXPORT_STATES = new Set([
  "APPROVED",
  "SENT_TO_SUPPLIER",
  "SENT",
  "ISSUED",
  "CLOSED",
  "SHIPMENT_CONFIRMED",
  "ON_SHIP",
  "PARTIALLY_RECEIVED",
  "FULLY_RECEIVED",
])

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

export type PoActionsToolbarProps = {
  poId: string
  poNumber: string
  officialPoNumber: string | null
  status: string
  pdfProps: PoOfficialPdfProps
  /** ברירת מחדל לשדה "אל" בדיאלוג (מגיע מ-supplier.email אם קיים). */
  defaultRecipientEmail: string | null
  /** לצביעה של "נשלח לאחרונה ב-X" מתחת לכפתור. */
  lastSentAt: string | null
  /** קרא לאחר שליחת מייל (כדי לרענן את כרטיס ההזמנה). */
  onSent: () => void
  /** קרא לאחר כל מעבר סטטוס מוצלח (כדי לרענן את הנתונים). */
  onTransition: () => void
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function PoActionsToolbar(props: PoActionsToolbarProps) {
  // SUBMIT is intentionally excluded: PoSubmitButton (in PageHeader) handles
  // that transition via /approvals/submit which creates the approval chain.
  // Exposing SUBMIT here would bypass the chain and only do a raw status update.
  const availableTransitions = getAvailableTransitions(props.status as POStatus).filter(
    (t) => t !== "SUBMIT",
  )
  const canExport = EXPORT_STATES.has(props.status)

  const [isGeneratingPdf, setIsGeneratingPdf] = React.useState(false)
  const [sendDialogOpen, setSendDialogOpen] = React.useState(false)
  const [pendingTransition, setPendingTransition] = React.useState<POTransition | null>(null)
  const [confirmTransition, setConfirmTransition] = React.useState<POTransition | null>(null)

  // ── PDF blob builder (shared between download and send) ──────────────────
  const buildPdfBlob = React.useCallback(async () => {
    const { pdf } = await import("@react-pdf/renderer")
    return pdf(<PoOfficialPdfDocument {...props.pdfProps} />).toBlob()
  }, [props.pdfProps])

  // ── PDF download ─────────────────────────────────────────────────────────
  const handleDownload = React.useCallback(async () => {
    setIsGeneratingPdf(true)
    try {
      const blob = await buildPdfBlob()
      const filename = `PO_${props.officialPoNumber ?? props.poNumber}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success("ה-PDF הופק ונשמר")
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "ייצור ה-PDF נכשל"
      toast.error(msg)
    } finally {
      setIsGeneratingPdf(false)
    }
  }, [buildPdfBlob, props.officialPoNumber, props.poNumber])

  // ── State-machine transition executor ────────────────────────────────────
  const executeTransition = React.useCallback(
    async (transition: POTransition) => {
      setPendingTransition(transition)
      setConfirmTransition(null)
      try {
        const companyId = readActiveCompanyIdFromCookie()
        const res = await fetch("/api/procurement/po-transition", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(companyId ? { "x-active-company-id": companyId } : {}),
          },
          credentials: "same-origin",
          body: JSON.stringify({ poId: props.poId, transition }),
        })
        const body = (await res.json().catch(() => null)) as {
          ok?: boolean
          data?: { newStatus: string }
          error?: string
        } | null

        if (!res.ok) {
          throw new Error(body?.error ?? `הפעולה נכשלה (${res.status})`)
        }
        toast.success(`${getTransitionLabel(transition)} בוצע בהצלחה`)
        props.onTransition()
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "הפעולה נכשלה"
        toast.error(msg)
      } finally {
        setPendingTransition(null)
      }
    },
    [props],
  )

  const handleTransitionClick = React.useCallback(
    (transition: POTransition) => {
      if (DESTRUCTIVE_TRANSITIONS.has(transition)) {
        setConfirmTransition(transition)
      } else {
        void executeTransition(transition)
      }
    },
    [executeTransition],
  )

  const isBusy = pendingTransition !== null || isGeneratingPdf

  if (availableTransitions.length === 0 && !canExport) return null

  return (
    <div className="flex flex-col items-end gap-2" dir="rtl">

      {/* ── Row 1: State-machine transition buttons ──────────────────────── */}
      {availableTransitions.length > 0 ? (
        <div className="flex flex-wrap justify-end gap-2">
          {availableTransitions.map((transition) => {
            const cfg = TRANSITION_CONFIG[transition]
            const Icon = cfg.icon
            const isPending = pendingTransition === transition
            return (
              <Button
                key={transition}
                type="button"
                variant={cfg.variant}
                className={cfg.className}
                disabled={isBusy}
                onClick={() => handleTransitionClick(transition)}
              >
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Icon className="size-4" aria-hidden />
                )}
                {getTransitionLabel(transition)}
              </Button>
            )
          })}
        </div>
      ) : null}

      {/* ── Row 2: Export / email buttons (APPROVED+) ────────────────────── */}
      {canExport ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleDownload}
            disabled={isBusy}
            className="gap-2"
          >
            {isGeneratingPdf ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Download className="size-4" aria-hidden />
            )}
            הורד PDF
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={() => setSendDialogOpen(true)}
            disabled={isBusy}
            className="gap-2"
          >
            <Send className="size-4" aria-hidden />
            שלח לספק במייל
          </Button>
        </div>
      ) : null}

      {/* ── Last-sent hint ────────────────────────────────────────────────── */}
      {props.lastSentAt ? (
        <p className="text-xs text-muted-foreground">
          נשלח לאחרונה ב-{formatDateTime(props.lastSentAt)}
        </p>
      ) : null}

      {/* ── Send-to-supplier email dialog ─────────────────────────────────── */}
      <SendToSupplierDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        poId={props.poId}
        officialPoNumber={props.officialPoNumber ?? props.poNumber}
        defaultRecipientEmail={props.defaultRecipientEmail}
        buildPdfBlob={buildPdfBlob}
        onSuccess={() => {
          setSendDialogOpen(false)
          props.onSent()
        }}
      />

      {/* ── Destructive transition confirmation dialog ────────────────────── */}
      <AlertDialog
        open={confirmTransition !== null}
        onOpenChange={(open) => { if (!open) setConfirmTransition(null) }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTransition ? getTransitionLabel(confirmTransition) : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTransition
                ? (DESTRUCTIVE_WARNINGS[confirmTransition] ?? "האם אתה בטוח שברצונך לבצע פעולה זו?")
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirmTransition === "CANCEL"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
              onClick={() => {
                if (confirmTransition) void executeTransition(confirmTransition)
              }}
            >
              {pendingTransition !== null ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              אישור
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// Dialog — Email recipient + optional note
// ═══════════════════════════════════════════════════════════════════════════

function SendToSupplierDialog({
  open,
  onOpenChange,
  poId,
  officialPoNumber,
  defaultRecipientEmail,
  buildPdfBlob,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  poId: string
  officialPoNumber: string
  defaultRecipientEmail: string | null
  buildPdfBlob: () => Promise<Blob>
  onSuccess: () => void
}) {
  const [email, setEmail] = React.useState(defaultRecipientEmail ?? "")
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setEmail(defaultRecipientEmail ?? "")
      setNote("")
    }
  }, [open, defaultRecipientEmail])

  const isEmailValid = /.+@.+\..+/.test(email.trim())

  const handleSend = React.useCallback(async () => {
    if (!isEmailValid) {
      toast.error("כתובת מייל לא תקינה")
      return
    }
    setBusy(true)
    try {
      const blob = await buildPdfBlob()
      const pdfBase64 = await blobToBase64(blob)

      const companyId = readActiveCompanyIdFromCookie()
      const res = await fetch(
        `/api/procurement/orders/${encodeURIComponent(poId)}/send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(companyId ? { "x-active-company-id": companyId } : {}),
          },
          credentials: "same-origin",
          body: JSON.stringify({
            recipientEmail: email.trim(),
            note: note.trim() || null,
            pdfBase64,
          }),
        },
      )
      const body = (await res.json().catch(() => null)) as {
        data?: { delivery: "SUCCESS" | "MOCK" | "FAILED" }
        error?: string
      } | null

      if (!res.ok) {
        throw new Error(body?.error ?? `שליחה נכשלה (${res.status})`)
      }

      const delivery = body?.data?.delivery ?? "SUCCESS"
      if (delivery === "MOCK") {
        toast.success(
          `PO ${officialPoNumber} נרשם ל-${email.trim()} (mock — הוגדר ל-console; יצא בפועל כשייקבע RESEND_API_KEY)`,
        )
      } else {
        toast.success(`PO ${officialPoNumber} נשלח בהצלחה ל-${email.trim()}`)
      }
      onSuccess()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "שליחה נכשלה"
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }, [
    buildPdfBlob,
    email,
    isEmailValid,
    note,
    officialPoNumber,
    onSuccess,
    poId,
  ])

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>שליחת הזמנת רכש לספק</DialogTitle>
          <DialogDescription>
            ה-PDF הרשמי של PO <b>{officialPoNumber}</b> יצורף למייל.
            סטטוס ההזמנה יעבור ל-&quot;נשלח לספק&quot; עם רישום אודיט מלא.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="po-send-email">כתובת מייל של הספק</Label>
            <Input
              id="po-send-email"
              type="email"
              dir="ltr"
              className="text-start"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="supplier@example.com"
              disabled={busy}
              autoComplete="email"
            />
            {!defaultRecipientEmail && email.length === 0 ? (
              <p className="text-xs text-amber-700">
                לספק אין כתובת מייל שמורה בכרטיס — הזן ידנית.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="po-send-note">הערה לספק (רשות)</Label>
            <Textarea
              id="po-send-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="למשל: אנא אשרו קבלה וסימנו ETA."
              disabled={busy}
              maxLength={2000}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            ביטול
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={busy || !isEmailValid}
            className="gap-2"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            שלח
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// helpers
// ═══════════════════════════════════════════════════════════════════════════

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  // אנחנו ברסט ענן-client בלבד; `btoa` זמין אבל דורש binary string.
  let binary = ""
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunk, bytes.length)),
    )
  }
  return btoa(binary)
}

// formatDateTime is declared above at line 81.
export function formatDateOnly(iso: string): string {
  try {
    return dateOnlyFormatter.format(new Date(iso))
  } catch {
    return iso
  }
}

/** Helper — בונה שורות PDF מתוך ה-DTO של ה-order. */
export function buildPdfLines(
  lines: Array<{
    itemNumber: string | null
    description: string
    quantity: number
    unitPrice: number
    totalPrice: number
  }>,
): PoOfficialPdfLine[] {
  return lines.map((line, idx) => ({
    index: idx + 1,
    itemNumber: line.itemNumber,
    description: line.description,
    quantity: line.quantity,
    unitLabel: "יח׳",
    unitPrice: line.unitPrice,
    totalPrice: line.totalPrice,
  }))
}

/** Helper לקומפוננטה הקוראת — טעינת היסטוריית שליחות. */
export async function fetchLastSentAt(poId: string): Promise<string | null> {
  try {
    const log = await masterDataFetch<
      Array<{ sentAt: string; deliveryStatus: string }>
    >(`/api/procurement/orders/${encodeURIComponent(poId)}/sent-log`)
    const lastSuccess = log.find(
      (entry) =>
        entry.deliveryStatus === "SUCCESS" || entry.deliveryStatus === "MOCK",
    )
    return lastSuccess?.sentAt ?? null
  } catch {
    return null
  }
}
