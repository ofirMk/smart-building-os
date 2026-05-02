"use client"

/**
 * Phase 8.1.3 + 8.1.4 — PO Actions Toolbar
 *
 * מארח 2 כפתורים בראש מסך הפרט של ה-PO:
 *
 *   • "הורד PDF" — מיוצר בקליינט ע"י `@react-pdf/renderer` ומורד
 *     כקובץ `PO_{officialPoNumber}.pdf`. מופיע רק אם ה-PO במצב APPROVED+.
 *
 *   • "שלח לספק במייל" — פותח Dialog עם שדה מייל וטקסט חופשי.
 *     בעת אישור: מיוצר אותו ה-PDF, מומר ל-base64, ונשלח כ-multipart JSON
 *     ל-`/api/procurement/orders/[id]/send`. האנדפוינט רושם ל-audit log
 *     ומעדכן סטטוס ל-SENT_TO_SUPPLIER.
 *
 * ## הצגת היסטוריית שליחות
 *   אם הועבר `lastSentAt` מהקוראים (טעון מ-/sent-log), הכפתור "שלח לספק"
 *   מציג תחתיו "נשלח לאחרונה ב-X" כ-hint קצר.
 */

import * as React from "react"
import { Download, Loader2, Send } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { readActiveCompanyIdFromCookie } from "@/lib/company-context"
import {
  PoOfficialPdfDocument,
  type PoOfficialPdfLine,
  type PoOfficialPdfProps,
} from "@/components/marker-ofek/procurement/po-official-pdf"

const dateTimeFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "medium",
  timeStyle: "short",
})
const dateOnlyFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "medium",
})

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
  /** קרא לאחר שינוי סטטוס (כדי לרענן את כרטיס ההזמנה). */
  onSent: () => void
}

const APPROVED_STATES = new Set([
  "APPROVED",
  "SENT_TO_SUPPLIER",
  "SENT",
  "ISSUED",
  "CLOSED",
])

export function PoActionsToolbar(props: PoActionsToolbarProps) {
  const canExport = APPROVED_STATES.has(props.status)
  const [isGeneratingPdf, setIsGeneratingPdf] = React.useState(false)
  const [sendDialogOpen, setSendDialogOpen] = React.useState(false)

  // מחולל את ה-PDF blob בצד הלקוח. משותף ל-download ול-send.
  const buildPdfBlob = React.useCallback(async () => {
    const { pdf } = await import("@react-pdf/renderer")
    return pdf(<PoOfficialPdfDocument {...props.pdfProps} />).toBlob()
  }, [props.pdfProps])

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

  if (!canExport) return null

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleDownload}
          disabled={isGeneratingPdf}
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
          className="gap-2"
        >
          <Send className="size-4" aria-hidden />
          שלח לספק במייל
        </Button>
      </div>

      {props.lastSentAt ? (
        <p className="text-xs text-muted-foreground">
          נשלח לאחרונה ב-
          {formatDateTime(props.lastSentAt)}
        </p>
      ) : null}

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

function formatDateTime(iso: string): string {
  try {
    return dateTimeFormatter.format(new Date(iso))
  } catch {
    return iso
  }
}

/** Helper — משתפים את ה-formatter הזה חוץ ל-UI אחר אם נצטרך יום בלבד. */
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
