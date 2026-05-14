"use client"

/**
 * TaxInvoiceShowClient — interactive show page for a single tax invoice.
 *
 * Tabs:
 *   1. שורות (default) — read-only list of the invoice lines.
 *   2. הדפסות (Prints) — per-event audit trail (מקור / העתק).
 *   3. תנועת יומן (GL JE) — double-entry posting snapshot.
 *
 * Action buttons (status-aware):
 *   • Close — only when status=DRAFT, calls closeTaxInvoiceAction.
 *   • Cancel (issue credit memo) — only when status in closed family.
 *   • Print — always visible when status != DRAFT; opens /print/tax-invoices/[id]
 *     in a new tab (same as ContextualPrintButton with kind="tax-invoices").
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  BookOpenCheck,
  CheckCircle2,
  HandCoins,
  Loader2,
  ReceiptText,
  Send,
  Ban,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ContextualPrintButton } from "@/components/marker-ofek/print/contextual-print-button"
import {
  cancelTaxInvoiceAction,
  closeTaxInvoiceAction,
} from "@/lib/marker-ofek/finance/t7-tax-invoice-actions"
import type {
  FetchedTaxInvoiceHeader,
  FetchedTaxInvoiceLine,
  TaxInvoiceKind,
  TaxInvoiceStatus,
} from "@/lib/marker-ofek/finance/t7-tax-invoice-actions"
// T7c — allocation + receipt-collection actions live in a sibling Server-
// Actions module so the original T7a/b code stays untouched.
import {
  recordTaxInvoiceReceiptAction,
  requestItaAllocationSimulationAction,
  submitItaAllocationAction,
  type InvoiceReceiptRow,
} from "@/lib/marker-ofek/finance/t7c-allocation-actions"

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
})

const dateFmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" })
const dateTimeFmt = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
})

const KIND_LABEL: Record<TaxInvoiceKind, string> = {
  TAX_INVOICE: "חשבונית מס",
  TAX_RECEIPT: "חשבונית מס/קבלה",
  CREDIT_MEMO: "חשבונית זיכוי",
  CONSOLIDATED_INVOICE: "חשבונית מס מרכזת",
}

function statusTone(status: TaxInvoiceStatus): {
  label: string
  cls: string
} {
  switch (status) {
    case "DRAFT":
      return { label: "טיוטה", cls: "border-slate-300 bg-slate-50 text-slate-700" }
    case "PENDING_ALLOCATION":
      return { label: "ממתין להקצאה", cls: "border-amber-300 bg-amber-50 text-amber-800" }
    case "CLOSED":
      return { label: "סגור", cls: "border-sky-300 bg-sky-50 text-sky-800" }
    case "PRINTED_ORIGINAL":
      return { label: "הודפס (מקור)", cls: "border-emerald-300 bg-emerald-50 text-emerald-800" }
    case "REPRINTED":
      return { label: "הודפס (העתק)", cls: "border-emerald-300 bg-emerald-50/70 text-emerald-800" }
    case "CANCELLED":
      return { label: "בוטל", cls: "border-red-300 bg-red-50 text-red-800" }
  }
}

type PrintEvent = {
  id: string
  printedAt: string
  copyLabel: string
  userAgent: string | null
  sha256Snapshot: string | null
}

type JournalEntry = {
  id: string
  entryNumber: string
  entryDate: string
  description: string
  status: string
  lines: Array<{
    lineNo: number
    accountId: string
    debit: number
    credit: number
    description: string
  }>
}

export function TaxInvoiceShowClient({
  header,
  lines,
  printEvents,
  journalEntry,
  itaThresholdNis,
  receipts,
  receiptsTotal,
}: {
  header: FetchedTaxInvoiceHeader
  lines: FetchedTaxInvoiceLine[]
  printEvents: PrintEvent[]
  journalEntry: JournalEntry | null
  /** T7c — threshold in NIS above which the ITA allocation gate engages. */
  itaThresholdNis: number
  /** T7c — receipts already allocated against this invoice. */
  receipts: InvoiceReceiptRow[]
  /** T7c — sum of all allocations (UI guard so we don't over-allocate). */
  receiptsTotal: number
}) {
  const router = useRouter()
  const [tab, setTab] = React.useState<
    "lines" | "prints" | "gl" | "collection"
  >("lines")
  const [busy, setBusy] = React.useState<"close" | "cancel" | null>(null)
  const [cancelReason, setCancelReason] = React.useState("")
  const [cancelOpen, setCancelOpen] = React.useState(false)

  const tone = statusTone(header.status)
  const isClosed =
    header.status === "CLOSED" ||
    header.status === "PRINTED_ORIGINAL" ||
    header.status === "REPRINTED"
  const canClose = header.status === "DRAFT"
  const canCancel = isClosed

  async function handleClose() {
    setBusy("close")
    try {
      const res = await closeTaxInvoiceAction(header.id)
      if (!res.ok) {
        toast.error("סגירת החשבונית נכשלה", { description: res.error })
        return
      }
      toast.success(`החשבונית נסגרה · ${res.invoiceNumberLabel}`)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function handleCancel() {
    if (!cancelReason.trim()) {
      toast.error("נא לציין סיבת ביטול")
      return
    }
    setBusy("cancel")
    try {
      const res = await cancelTaxInvoiceAction({
        invoiceId: header.id,
        reason: cancelReason.trim(),
      })
      if (!res.ok) {
        toast.error("ביטול החשבונית נכשל", { description: res.error })
        return
      }
      toast.success(`הופקה חשבונית זיכוי · ${res.creditMemoLabel}`)
      router.refresh()
    } finally {
      setBusy(null)
      setCancelOpen(false)
    }
  }

  return (
    <div dir="rtl" className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700">
            <ReceiptText className="size-5" aria-hidden />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                {header.invoiceNumberLabel ?? "טיוטה"}
              </h1>
              <Badge variant="outline" className={`border ${tone.cls} text-[10px]`}>
                {tone.label}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {KIND_LABEL[header.kind]}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {header.customerName}
              {header.customerVatId ? ` · מס׳ עוסק ${header.customerVatId}` : ""}
              {" · "}
              {dateFmt.format(new Date(header.issueDate))}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            render={<Link href="/marker-ofek/finance/tax-invoices" />}
          >
            <ArrowLeft className="ms-1 size-4" aria-hidden />
            לרשימה
          </Button>
          {!isClosed && canClose ? (
            <Button
              type="button"
              size="sm"
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              onClick={handleClose}
              disabled={busy !== null}
            >
              {busy === "close" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <CheckCircle2 className="size-4" aria-hidden />
              )}
              סגור ושלח ל-JE
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2 border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => setCancelOpen(true)}
              disabled={busy !== null}
            >
              <Ban className="size-4" aria-hidden />
              הוצא זיכוי
            </Button>
          ) : null}
          {header.status !== "DRAFT" && header.status !== "PENDING_ALLOCATION" ? (
            <ContextualPrintButton kind="tax-invoices" id={header.id} />
          ) : null}
        </div>
      </header>

      {/* T7c — ITA Allocation panel (only when PENDING_ALLOCATION). */}
      {header.status === "PENDING_ALLOCATION" ? (
        <ItaAllocationPanel
          invoiceId={header.id}
          grandTotal={header.grandTotal}
          thresholdNis={itaThresholdNis}
        />
      ) : null}

      {/* Cancel confirmation panel */}
      {cancelOpen ? (
        <Card className="border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="flex-1 space-y-2">
              <p className="font-bold">
                אישור ביטול — פעולה בלתי הפיכה
              </p>
              <p className="text-xs">
                ביטול חשבונית סגורה נעשה דרך הוצאת{" "}
                <span className="font-mono">חשבונית זיכוי</span> (negated-qty
                credit memo), שתסגר מיד ותקושר לחשבונית המקורית.
              </p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={2}
                placeholder="סיבת ביטול (חובה)"
                className="w-full rounded-md border border-red-300 bg-white px-2 py-1.5 text-sm text-red-900"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setCancelOpen(false)}
                  disabled={busy === "cancel"}
                >
                  ביטול
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="gap-2 bg-red-600 hover:bg-red-700"
                  onClick={handleCancel}
                  disabled={busy === "cancel" || !cancelReason.trim()}
                >
                  {busy === "cancel" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  אשר והפק זיכוי
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <p className="text-[11px] uppercase text-muted-foreground">סה״כ לפני מע״מ</p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums">
            {ILS.format(header.subtotalAfterDiscount || header.subtotalAmount)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] uppercase text-muted-foreground">מע״מ</p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums">
            {ILS.format(header.vatAmount)}{" "}
            <span className="text-xs text-muted-foreground">
              ({header.vatRatePct}%)
            </span>
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] uppercase text-muted-foreground">סה״כ לתשלום</p>
          <p className="mt-1 font-mono text-xl font-black tabular-nums">
            {ILS.format(header.grandTotal)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] uppercase text-muted-foreground">
            הקצאה (רשות המסים)
          </p>
          <p className="mt-1 font-mono text-sm">
            {header.allocationNumber ?? <span className="text-muted-foreground">—</span>}
          </p>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border text-sm">
        <TabButton active={tab === "lines"} onClick={() => setTab("lines")}>
          שורות ({lines.length})
        </TabButton>
        <TabButton active={tab === "prints"} onClick={() => setTab("prints")}>
          הדפסות ({printEvents.length})
        </TabButton>
        <TabButton active={tab === "gl"} onClick={() => setTab("gl")}>
          תנועת יומן
        </TabButton>
        {/* T7c — Collection tab. Shown for any non-draft invoice, so the AR
            team can record + audit customer payments inline. */}
        <TabButton
          active={tab === "collection"}
          onClick={() => setTab("collection")}
        >
          גבייה ({receipts.length})
        </TabButton>
      </div>

      {tab === "lines" ? (
        <LinesTab lines={lines} />
      ) : tab === "prints" ? (
        <PrintsTab events={printEvents} printCount={header.printCount} />
      ) : tab === "gl" ? (
        <GlTab entry={journalEntry} />
      ) : (
        <CollectionTab
          invoiceId={header.id}
          invoiceStatus={header.status}
          grandTotal={header.grandTotal}
          paidAmount={Math.max(header.paidAmount, receiptsTotal)}
          receipts={receipts}
        />
      )}

      {header.digitalSignatureSha256 ? (
        <Card className="p-3 text-[10px] text-muted-foreground">
          <BookOpenCheck className="me-1 inline size-3" aria-hidden />
          <span className="font-semibold">חתימה דיגיטלית:</span>{" "}
          <span className="break-all font-mono">{header.digitalSignatureSha256}</span>
        </Card>
      ) : null}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-3 py-1.5 font-medium transition-colors ${
        active
          ? "border-indigo-600 text-indigo-700"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  )
}

function LinesTab({ lines }: { lines: FetchedTaxInvoiceLine[] }) {
  const showSrcCol = lines.some((l) => (l.sourceDocNumber ?? "").length > 0)
  const showDiscCol = lines.some((l) => l.discountPct > 0)

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[760px] border-collapse text-xs">
        <thead className="bg-slate-50 text-[10px] uppercase text-slate-600">
          <tr>
            <th className="px-2 py-2 text-center">#</th>
            <th className="px-2 py-2 text-start">מק״ט</th>
            {showSrcCol ? <th className="px-2 py-2 text-start">תעודה</th> : null}
            <th className="px-2 py-2 text-start">תאור</th>
            <th className="px-2 py-2 text-center">כמות</th>
            <th className="px-2 py-2 text-center">יח׳</th>
            <th className="px-2 py-2 text-end">מחיר יחידה</th>
            {showDiscCol ? <th className="px-2 py-2 text-end">הנחה %</th> : null}
            <th className="px-2 py-2 text-end">סה״כ</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.lineNo} className="border-t border-border">
              <td className="px-2 py-1.5 text-center font-mono">{l.lineNo}</td>
              <td className="px-2 py-1.5 font-mono text-[10px]">{l.itemCode ?? "—"}</td>
              {showSrcCol ? (
                <td className="px-2 py-1.5 font-mono text-[10px]">{l.sourceDocNumber ?? ""}</td>
              ) : null}
              <td className="px-2 py-1.5">{l.description}</td>
              <td className="px-2 py-1.5 text-center font-mono tabular-nums">
                {l.quantity}
              </td>
              <td className="px-2 py-1.5 text-center text-[10px]">{l.unitLabel ?? ""}</td>
              <td className="px-2 py-1.5 text-end font-mono tabular-nums">
                {ILS.format(l.unitPriceExcl)}
              </td>
              {showDiscCol ? (
                <td className="px-2 py-1.5 text-end font-mono tabular-nums">
                  {l.discountPct > 0 ? `${l.discountPct}%` : ""}
                </td>
              ) : null}
              <td className="px-2 py-1.5 text-end font-mono tabular-nums font-semibold">
                {ILS.format(l.lineTotalExcl)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PrintsTab({
  events,
  printCount,
}: {
  events: PrintEvent[]
  printCount: number
}) {
  return (
    <div className="space-y-3">
      <Card className="p-3 text-sm">
        <p className="text-muted-foreground">
          סך הדפסות:{" "}
          <span className="font-mono font-bold text-foreground">{printCount}</span>
          . ההדפסה הראשונה מסומנת כ-<span className="font-bold">מקור</span>, כל
          הבאות כ-<span className="font-bold">העתק</span>.
        </p>
      </Card>
      {events.length === 0 ? (
        <Card className="p-5 text-center text-sm text-muted-foreground">
          החשבונית עדיין לא הודפסה.
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-600">
              <tr>
                <th className="px-2 py-2 text-start">תאריך הדפסה</th>
                <th className="px-2 py-2 text-center">סוג</th>
                <th className="px-2 py-2 text-start">User-Agent</th>
                <th className="px-2 py-2 text-start">SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-2 py-1.5 font-mono text-[11px]">
                    {dateTimeFmt.format(new Date(e.printedAt))}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <Badge
                      variant="outline"
                      className={`border text-[10px] ${
                        e.copyLabel === "מקור"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-slate-300 bg-slate-50 text-slate-700"
                      }`}
                    >
                      {e.copyLabel}
                    </Badge>
                  </td>
                  <td className="px-2 py-1.5 text-[10px] text-muted-foreground">
                    {e.userAgent ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[9px] text-muted-foreground">
                    {e.sha256Snapshot
                      ? `${e.sha256Snapshot.slice(0, 16)}…${e.sha256Snapshot.slice(-8)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function GlTab({ entry }: { entry: JournalEntry | null }) {
  if (!entry) {
    return (
      <Card className="p-5 text-center text-sm text-muted-foreground">
        עדיין לא נרשמה תנועת יומן. היא נוצרת אוטומטית ברגע סגירת החשבונית (אם
        הוגדרו חשבונות GL_ACCOUNT_AR + GL_ACCOUNT_REVENUE_DEFAULT).
      </Card>
    )
  }
  const totalD = entry.lines.reduce((s, l) => s + l.debit, 0)
  const totalC = entry.lines.reduce((s, l) => s + l.credit, 0)
  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
        <div>
          <p className="font-mono text-sm font-bold">{entry.entryNumber}</p>
          <p className="text-xs text-muted-foreground">{entry.description}</p>
        </div>
        <div className="text-xs text-muted-foreground">
          {dateFmt.format(new Date(entry.entryDate))} ·{" "}
          <Badge variant="outline" className="text-[10px]">
            {entry.status}
          </Badge>
        </div>
      </Card>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-2 text-center">#</th>
              <th className="px-2 py-2 text-start">תאור</th>
              <th className="px-2 py-2 text-start">חשבון</th>
              <th className="px-2 py-2 text-end">חובה</th>
              <th className="px-2 py-2 text-end">זכות</th>
            </tr>
          </thead>
          <tbody>
            {entry.lines.map((l) => (
              <tr key={l.lineNo} className="border-t border-border">
                <td className="px-2 py-1.5 text-center font-mono">{l.lineNo}</td>
                <td className="px-2 py-1.5">{l.description}</td>
                <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                  {l.accountId.slice(0, 8)}…
                </td>
                <td className="px-2 py-1.5 text-end font-mono tabular-nums">
                  {l.debit > 0 ? ILS.format(l.debit) : ""}
                </td>
                <td className="px-2 py-1.5 text-end font-mono tabular-nums">
                  {l.credit > 0 ? ILS.format(l.credit) : ""}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
              <td colSpan={3} className="px-2 py-2 text-end">
                סה״כ
              </td>
              <td className="px-2 py-2 text-end font-mono tabular-nums">
                {ILS.format(totalD)}
              </td>
              <td className="px-2 py-2 text-end font-mono tabular-nums">
                {ILS.format(totalC)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ===========================================================================
// T7c — ITA Allocation panel
// ===========================================================================

function ItaAllocationPanel({
  invoiceId,
  grandTotal,
  thresholdNis,
}: {
  invoiceId: string
  grandTotal: number
  thresholdNis: number
}) {
  const router = useRouter()
  const [manualNumber, setManualNumber] = React.useState("")
  const [busy, setBusy] = React.useState<"simulate" | "submit" | null>(null)

  async function handleSimulate() {
    setBusy("simulate")
    try {
      const res = await requestItaAllocationSimulationAction(invoiceId)
      if (!res.ok) {
        toast.error("יצירת מספר ההקצאה נכשלה", { description: res.error })
        return
      }
      toast.success(`התקבל מספר הקצאה ${res.allocationNumber}`, {
        description: `החשבונית נסגרה: ${res.invoiceNumberLabel ?? "—"}`,
      })
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function handleSubmit() {
    const trimmed = manualNumber.trim()
    if (!/^\d{12}$/.test(trimmed)) {
      toast.error("יש להזין בדיוק 12 ספרות")
      return
    }
    setBusy("submit")
    try {
      const res = await submitItaAllocationAction({
        invoiceId,
        allocationNumber: trimmed,
      })
      if (!res.ok) {
        toast.error("שמירת מספר ההקצאה נכשלה", { description: res.error })
        return
      }
      toast.success(`החשבונית נסגרה · ${res.invoiceNumberLabel}`)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="flex-1 space-y-3">
          <div>
            <p className="font-bold">דרושה הקצאה ממערכת רשות המסים</p>
            <p className="text-xs">
              סך החשבונית{" "}
              <span className="font-mono font-bold">{ILS.format(grandTotal)}</span>{" "}
              חורג מסף ה-ITA (
              <span className="font-mono">{ILS.format(thresholdNis)}</span>),
              ולכן חובה להזין מספר הקצאה מ-״מקוון״ לפני שניתן לסגור את החשבונית
              ולהדפיס אותה כמסמך מקור. ניתן לדמות בקשת מספר אקראי לבדיקת הזרימה,
              או להזין מספר אמיתי שהתקבל מרשות המסים.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <Button
              type="button"
              size="sm"
              className="gap-2 bg-amber-600 text-white hover:bg-amber-700"
              onClick={handleSimulate}
              disabled={busy !== null}
            >
              {busy === "simulate" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
              בקש מספר הקצאה (סימולציה)
            </Button>

            <div className="flex items-end gap-2">
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="font-semibold">מספר הקצאה ידני</span>
                <input
                  inputMode="numeric"
                  pattern="\d{12}"
                  maxLength={12}
                  placeholder="123456789012"
                  value={manualNumber}
                  onChange={(e) =>
                    setManualNumber(e.target.value.replace(/\D/g, "").slice(0, 12))
                  }
                  className="w-44 rounded-md border border-amber-300 bg-white px-2 py-1.5 text-sm font-mono tracking-wider text-amber-900"
                />
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2 border-amber-400 text-amber-900 hover:bg-amber-100"
                onClick={handleSubmit}
                disabled={busy !== null || manualNumber.length !== 12}
              >
                {busy === "submit" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 className="size-4" aria-hidden />
                )}
                שמור והשלם סגירה
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ===========================================================================
// T7c — Collection tab
// ===========================================================================

const RECEIPT_METHOD_LABEL: Record<string, string> = {
  BANK_TRANSFER: "העברה בנקאית",
  CHECK: "צ׳ק",
  CASH: "מזומן",
  CREDIT_CARD: "אשראי",
  OTHER: "אחר",
}

function CollectionTab({
  invoiceId,
  invoiceStatus,
  grandTotal,
  paidAmount,
  receipts,
}: {
  invoiceId: string
  invoiceStatus: TaxInvoiceStatus
  grandTotal: number
  paidAmount: number
  receipts: InvoiceReceiptRow[]
}) {
  const router = useRouter()
  const canCollect =
    invoiceStatus === "CLOSED" ||
    invoiceStatus === "PRINTED_ORIGINAL" ||
    invoiceStatus === "REPRINTED"
  const openAmount = Math.max(0, Math.round((grandTotal - paidAmount) * 100) / 100)

  const [composerOpen, setComposerOpen] = React.useState(false)
  const [receiptDate, setReceiptDate] = React.useState(
    () => new Date().toISOString().slice(0, 10),
  )
  const [amount, setAmount] = React.useState<string>(
    openAmount > 0 ? String(openAmount) : "",
  )
  const [method, setMethod] = React.useState<
    "BANK_TRANSFER" | "CHECK" | "CASH" | "CREDIT_CARD" | "OTHER"
  >("BANK_TRANSFER")
  const [reference, setReference] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function handleSave() {
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("סכום הקבלה חייב להיות חיובי")
      return
    }
    if (amt > openAmount + 0.01) {
      toast.error("הסכום עולה על היתרה הפתוחה")
      return
    }
    setBusy(true)
    try {
      const res = await recordTaxInvoiceReceiptAction({
        invoiceId,
        receiptDate,
        amount: amt,
        method,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      if (!res.ok) {
        toast.error("רישום הקבלה נכשל", { description: res.error })
        return
      }
      toast.success("הקבלה נרשמה והוקצתה לחשבונית")
      setComposerOpen(false)
      setAmount("")
      setReference("")
      setNotes("")
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Status strip */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
        <div className="flex items-center gap-2">
          <Banknote className="size-5 text-emerald-700" aria-hidden />
          <div>
            <p className="text-[11px] uppercase text-muted-foreground">יתרה לתשלום</p>
            <p className="font-mono text-lg font-bold tabular-nums">
              {ILS.format(openAmount)}
            </p>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          שולם:{" "}
          <span className="font-mono font-semibold">
            {ILS.format(paidAmount)}
          </span>{" "}
          מתוך{" "}
          <span className="font-mono font-semibold">
            {ILS.format(grandTotal)}
          </span>
        </div>
        {canCollect && openAmount > 0.009 ? (
          <Button
            type="button"
            size="sm"
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => setComposerOpen((v) => !v)}
          >
            <HandCoins className="size-4" aria-hidden />
            {composerOpen ? "סגור טופס" : "+ הוסף קבלה לחשבונית זו"}
          </Button>
        ) : null}
      </Card>

      {/* Inline receipt composer */}
      {composerOpen ? (
        <Card className="space-y-3 border-emerald-200 bg-emerald-50/40 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-semibold text-muted-foreground">תאריך קבלה</span>
              <input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-semibold text-muted-foreground">סכום</span>
              <input
                type="number"
                step={0.01}
                min={0.01}
                max={openAmount}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-semibold text-muted-foreground">אמצעי תשלום</span>
              <select
                value={method}
                onChange={(e) =>
                  setMethod(e.target.value as typeof method)
                }
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              >
                <option value="BANK_TRANSFER">העברה בנקאית</option>
                <option value="CHECK">צ׳ק</option>
                <option value="CASH">מזומן</option>
                <option value="CREDIT_CARD">אשראי</option>
                <option value="OTHER">אחר</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs sm:col-span-2">
              <span className="font-semibold text-muted-foreground">
                אסמכתא / מס׳ צ׳ק
              </span>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-semibold text-muted-foreground">הערות</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setComposerOpen(false)}
              disabled={busy}
            >
              ביטול
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              onClick={handleSave}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <CheckCircle2 className="size-4" aria-hidden />
              )}
              שמור קבלה
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Existing receipts table */}
      {receipts.length === 0 ? (
        <Card className="p-5 text-center text-sm text-muted-foreground">
          לא נרשמו קבלות לחשבונית זו עדיין.
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-600">
              <tr>
                <th className="px-2 py-2 text-start">מס׳ קבלה</th>
                <th className="px-2 py-2 text-center">תאריך</th>
                <th className="px-2 py-2 text-start">אמצעי</th>
                <th className="px-2 py-2 text-start">אסמכתא</th>
                <th className="px-2 py-2 text-end">סכום שהוקצה</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.receiptId} className="border-t border-border">
                  <td className="px-2 py-1.5 font-mono text-[11px] font-semibold">
                    {r.receiptNumber}
                  </td>
                  <td className="px-2 py-1.5 text-center font-mono text-[10px]">
                    {dateFmt.format(new Date(r.receiptDate))}
                  </td>
                  <td className="px-2 py-1.5 text-[11px]">
                    {RECEIPT_METHOD_LABEL[r.method] ?? r.method}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                    {r.reference ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-end font-mono tabular-nums font-semibold text-emerald-800">
                    {ILS.format(r.allocatedAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
