"use client"

/**
 * Sprint T14 — Mobile-first Vendor Bidding Portal (UI).
 *
 * One screen, three states:
 *   1. Header / "request for quote" identity card.
 *   2. Card list — one card per BOQ line with a large numeric input for
 *      unit price; live "quantity × unit price = line total" recomputation.
 *   3. Sticky footer — total + big primary CTA "הגש הצעת מחיר".
 *   4. After submission: a celebration screen with a giant emerald check.
 *
 * The component is entirely client-side; the parent server page hydrates it
 * with a `VendorRfqEnvelope` produced by `fetchVendorRfqAction`.
 */

import * as React from "react"
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Hash,
  Info,
  Loader2,
  Phone,
  PhoneCall,
  Send,
  Sparkles,
  User,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  submitVendorBidAction,
  type VendorRfqEnvelope,
} from "@/lib/marker-ofek/procurement/t14-vendor-rfq-actions"
import { cn } from "@/lib/utils"

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

const ILS_PRECISE = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
})

const HE_DATE = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "long",
  year: "numeric",
})

interface PortalState {
  prices: Record<string, string>
  contractorName: string
  contactPhone: string
  notes: string
}

export function VendorBidPortal({
  envelope,
}: {
  envelope: VendorRfqEnvelope
}) {
  const [form, setForm] = React.useState<PortalState>({
    prices: Object.fromEntries(envelope.lines.map((l) => [l.id, ""])),
    contractorName: "",
    contactPhone: "",
    notes: "",
  })
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [submitted, setSubmitted] = React.useState<{
    reference: string
    totalAmount: number
    submittedAt: string
  } | null>(null)

  // ── Live computation ────────────────────────────────────────────────────
  const lineTotals = React.useMemo(() => {
    const map: Record<string, number> = {}
    for (const line of envelope.lines) {
      const raw = form.prices[line.id] ?? ""
      const unit = Number.parseFloat(raw.replace(/[^0-9.]/g, ""))
      map[line.id] = Number.isFinite(unit) && unit > 0 ? unit * line.quantity : 0
    }
    return map
  }, [envelope.lines, form.prices])

  const grandTotal = React.useMemo(
    () => Object.values(lineTotals).reduce((acc, v) => acc + v, 0),
    [lineTotals],
  )

  const filledCount = React.useMemo(
    () => envelope.lines.filter((l) => (lineTotals[l.id] ?? 0) > 0).length,
    [envelope.lines, lineTotals],
  )

  const allLinesFilled = filledCount === envelope.lines.length
  const canSubmit =
    allLinesFilled &&
    grandTotal > 0 &&
    form.contractorName.trim().length > 1 &&
    !submitting

  // ── Handlers ────────────────────────────────────────────────────────────
  const setPrice = (lineId: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      prices: { ...prev.prices, [lineId]: value },
    }))
  }

  const handleSubmit = async () => {
    setError(null)
    setSubmitting(true)
    try {
      const pricesPayload = envelope.lines.map((l) => {
        const raw = form.prices[l.id] ?? ""
        const unit = Number.parseFloat(raw.replace(/[^0-9.]/g, ""))
        return {
          lineId: l.id,
          unitPrice: Number.isFinite(unit) ? unit * l.quantity : 0,
        }
      })
      const res = await submitVendorBidAction({
        token: envelope.token,
        contractorName: form.contractorName.trim(),
        contactPhone: form.contactPhone.trim(),
        notes: form.notes.trim() || undefined,
        prices: pricesPayload,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSubmitted({
        reference: res.bidReference,
        totalAmount: res.totalAmount,
        submittedAt: res.submittedAt,
      })
      // Scroll to top so the celebration screen is fully in view.
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "אירעה שגיאה לא צפויה.")
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render: success state ───────────────────────────────────────────────
  if (submitted) {
    return <SubmittedState envelope={envelope} submitted={submitted} />
  }

  // ── Render: bidding form ────────────────────────────────────────────────
  return (
    <div dir="rtl" className="flex w-full flex-col gap-5 px-4 pb-40 pt-5 sm:px-6 sm:pt-7">
      <Header envelope={envelope} />

      {envelope.isDemo ? (
        <DemoNotice />
      ) : null}

      {/* Contractor identity */}
      <Card className="border-border/70 p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <User className="size-4 text-indigo-600" aria-hidden />
          פרטי הקבלן המגיש
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="contractor-name" className="text-xs">
              שם החברה / הקבלן <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="contractor-name"
              type="text"
              autoComplete="organization"
              placeholder="לדוגמה: אלוויט מערכות אלומיניום בע״מ"
              value={form.contractorName}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, contractorName: e.target.value }))
              }
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="contractor-phone" className="text-xs">
              טלפון ליצירת קשר
            </Label>
            <div className="relative">
              <Phone
                className="pointer-events-none absolute end-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="contractor-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="050-1234567"
                value={form.contactPhone}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, contactPhone: e.target.value }))
                }
                className="h-11 pe-9"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* BOQ line cards */}
      <section aria-label="סעיפי המכרז" className="flex flex-col gap-3">
        <header className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="size-4 text-indigo-600" aria-hidden />
            סעיפים להגשת מחיר ({envelope.lines.length})
          </h2>
          <span className="font-mono text-[11px] text-muted-foreground">
            מולא: {filledCount}/{envelope.lines.length}
          </span>
        </header>

        {envelope.lines.map((line) => {
          const total = lineTotals[line.id] ?? 0
          const raw = form.prices[line.id] ?? ""
          const ceiling = line.budgetCeilingUnit ?? null
          const unit = Number.parseFloat(raw.replace(/[^0-9.]/g, ""))
          const overCeiling =
            ceiling != null &&
            Number.isFinite(unit) &&
            unit > 0 &&
            unit > ceiling

          return (
            <Card
              key={line.id}
              className={cn(
                "flex flex-col gap-3 border-border/70 p-4 shadow-sm transition-colors",
                total > 0 && "border-emerald-300 ring-1 ring-emerald-200",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    סעיף {line.lineNumber}
                  </span>
                  <h3 className="text-base font-semibold leading-tight text-foreground">
                    {line.description}
                  </h3>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className="font-mono text-[10px] uppercase text-muted-foreground">
                    כמות
                  </span>
                  <span className="font-mono text-base font-bold tabular-nums text-foreground">
                    {line.quantity.toLocaleString("he-IL")}{" "}
                    <span className="text-xs font-medium text-muted-foreground">
                      {line.uom}
                    </span>
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <Label
                  htmlFor={`price-${line.id}`}
                  className="text-xs text-foreground/80"
                >
                  מחיר יחידה (₪)
                </Label>
                <Input
                  id={`price-${line.id}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="הזינו מחיר…"
                  value={raw}
                  onChange={(e) => setPrice(line.id, e.target.value)}
                  className={cn(
                    "h-14 text-end font-mono text-xl font-semibold tabular-nums",
                    total > 0 && "border-emerald-400 bg-emerald-50/40",
                    overCeiling && "border-amber-400 bg-amber-50/40",
                  )}
                />
              </div>

              <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  סה״כ לסעיף ({line.quantity.toLocaleString("he-IL")} ×{" "}
                  {raw && Number.isFinite(unit) && unit > 0
                    ? ILS_PRECISE.format(unit)
                    : "—"}
                  )
                </span>
                <span
                  className={cn(
                    "font-mono text-base font-bold tabular-nums",
                    total > 0 ? "text-emerald-700" : "text-foreground/50",
                  )}
                >
                  {total > 0 ? ILS.format(total) : "—"}
                </span>
              </div>

              {overCeiling ? (
                <p className="flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-900">
                  <Info className="size-3.5 shrink-0" aria-hidden />
                  המחיר שהזנת חורג מהתקרה המוצעת ({ILS.format(ceiling ?? 0)} לפי
                  יחידה). ניתן להגיש גם מעל הסכום — הצעתך תיבחן ככלל.
                </p>
              ) : null}
            </Card>
          )
        })}
      </section>

      {/* Free-text notes */}
      <Card className="border-border/70 p-4 shadow-sm">
        <Label
          htmlFor="bid-notes"
          className="mb-2 block text-xs font-semibold text-foreground"
        >
          הערות / סעיפים שלא נכללים (לא חובה)
        </Label>
        <textarea
          id="bid-notes"
          rows={3}
          maxLength={500}
          placeholder="כל מידע נוסף שתרצו לצרף — תנאי תשלום מועדפים, חריגים, וכו׳."
          value={form.notes}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, notes: e.target.value }))
          }
          className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </Card>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900"
        >
          {error}
        </div>
      ) : null}

      {/* Sticky footer */}
      <StickyFooter
        envelope={envelope}
        grandTotal={grandTotal}
        canSubmit={canSubmit}
        submitting={submitting}
        onSubmit={() => void handleSubmit()}
        filledCount={filledCount}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({ envelope }: { envelope: VendorRfqEnvelope }) {
  const deadline = new Date(envelope.submissionDeadline)
  const daysLeft = Math.max(
    0,
    Math.ceil((deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
  )
  const closing = daysLeft <= 3

  return (
    <header className="flex flex-col gap-3 rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 p-5 text-white shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex size-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm"
            aria-hidden
          >
            <Building2 className="size-5 text-white" />
          </div>
          <div className="leading-tight">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-indigo-100">
              Marker Ofek · ERP B2B
            </p>
            <p className="text-sm font-semibold text-white">פורטל קבלני משנה</p>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold backdrop-blur-sm",
            closing
              ? "bg-rose-500/95 text-white"
              : "bg-white/15 text-white",
          )}
        >
          <CalendarDays className="size-3.5" aria-hidden />
          {daysLeft === 0
            ? "נסגר היום"
            : daysLeft === 1
              ? "יום אחד נותר"
              : `${daysLeft} ימים נותרו`}
        </span>
      </div>

      <div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-indigo-100">
          בקשה להצעת מחיר
        </p>
        <h1 className="mt-0.5 text-xl font-bold leading-tight sm:text-2xl">
          {envelope.title}
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-indigo-100">
          <span className="inline-flex items-center gap-1">
            <Hash className="size-3" aria-hidden />
            {envelope.rfqNumber}
          </span>
          <span>·</span>
          <span>{envelope.projectName}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-xl bg-white/10 p-3 text-[12px] sm:grid-cols-2">
        <div>
          <p className="font-mono text-[10px] uppercase text-indigo-100/80">
            יזם מזמין
          </p>
          <p className="font-semibold">{envelope.ownerCompanyName}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase text-indigo-100/80">
            מועד הגשה אחרון
          </p>
          <p className="font-semibold">{HE_DATE.format(deadline)}</p>
        </div>
        <div className="sm:col-span-2 flex items-center gap-2 border-t border-white/15 pt-2">
          <PhoneCall className="size-3.5 text-indigo-200" aria-hidden />
          <span className="text-indigo-100">{envelope.contactName}</span>
          <a
            href={`tel:${envelope.contactPhone.replace(/[^0-9+]/g, "")}`}
            className="ms-auto font-mono text-white underline-offset-2 hover:underline"
          >
            {envelope.contactPhone}
          </a>
        </div>
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Demo banner
// ---------------------------------------------------------------------------

function DemoNotice() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        זהו <strong>טוקן הדגמה</strong> — ניתן למלא ולשלוח את הטופס; ההגשה תקלט
        כסימולציה בלבד ולא תיצור חוזה אמיתי.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sticky footer
// ---------------------------------------------------------------------------

function StickyFooter({
  envelope,
  grandTotal,
  canSubmit,
  submitting,
  onSubmit,
  filledCount,
}: {
  envelope: VendorRfqEnvelope
  grandTotal: number
  canSubmit: boolean
  submitting: boolean
  onSubmit: () => void
  filledCount: number
}) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-3"
      data-vendor-portal-footer
    >
      <div className="pointer-events-auto mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-2xl border border-border/80 bg-white/95 p-3 shadow-2xl backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-start sm:gap-0">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            סה״כ הצעה ({filledCount}/{envelope.lines.length} סעיפים)
          </p>
          <p
            className={cn(
              "font-mono text-2xl font-extrabold tabular-nums",
              grandTotal > 0 ? "text-emerald-700" : "text-foreground/40",
            )}
          >
            {grandTotal > 0 ? ILS.format(grandTotal) : "—"}
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          disabled={!canSubmit}
          onClick={onSubmit}
          className={cn(
            "h-14 w-full gap-2 rounded-xl text-base font-bold shadow-lg sm:w-auto sm:min-w-[220px]",
            "bg-gradient-to-l from-indigo-600 via-indigo-700 to-violet-700 text-white",
            "hover:from-indigo-700 hover:via-indigo-800 hover:to-violet-800",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:grayscale",
          )}
        >
          {submitting ? (
            <>
              <Loader2 className="size-5 animate-spin" aria-hidden />
              שולח את ההצעה…
            </>
          ) : (
            <>
              <Send className="size-5" aria-hidden />
              הגש הצעת מחיר
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Success state
// ---------------------------------------------------------------------------

function SubmittedState({
  envelope,
  submitted,
}: {
  envelope: VendorRfqEnvelope
  submitted: { reference: string; totalAmount: number; submittedAt: string }
}) {
  return (
    <div
      dir="rtl"
      className="flex min-h-[calc(100dvh-1rem)] flex-col items-center justify-center gap-6 px-5 py-10 text-center"
    >
      <div className="relative flex size-32 items-center justify-center rounded-full bg-emerald-100 shadow-inner">
        <span
          className="absolute inset-0 animate-ping rounded-full bg-emerald-300/40"
          aria-hidden
        />
        <CheckCircle2
          className="relative size-20 text-emerald-600"
          aria-hidden
        />
      </div>

      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          תודה! הצעתך נקלטה במערכת בהצלחה
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          ההצעה הועברה למנהל הרכש של {envelope.ownerCompanyName}. תקבלו עדכון
          בטלפון או במייל מיד עם בחירת הזוכה במכרז.
        </p>
      </div>

      <Card className="w-full max-w-md border-emerald-200 bg-emerald-50/40 p-5 text-start">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-900/70">
              סה״כ ההצעה
            </p>
            <p className="font-mono text-2xl font-extrabold tabular-nums text-emerald-800">
              {ILS.format(submitted.totalAmount)}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-900/70">
              מספר אסמכתא
            </p>
            <p className="font-mono text-sm font-bold tabular-nums text-emerald-900">
              {submitted.reference}
            </p>
          </div>
          <div className="col-span-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-900/70">
              נשלח בתאריך
            </p>
            <p className="text-sm text-emerald-900">
              {HE_DATE.format(new Date(submitted.submittedAt))}{" "}
              <span className="font-mono text-[11px] text-emerald-900/70">
                ({new Date(submitted.submittedAt).toLocaleTimeString("he-IL", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                )
              </span>
            </p>
          </div>
        </div>
      </Card>

      <a
        href={`tel:${envelope.contactPhone.replace(/[^0-9+]/g, "")}`}
        className="inline-flex items-center gap-1.5 text-xs text-indigo-700 underline-offset-2 hover:underline"
      >
        <ChevronLeft className="size-3" aria-hidden />
        יש שאלות? התקשרו אל {envelope.contactName.split(" · ")[0]}
      </a>
    </div>
  )
}
