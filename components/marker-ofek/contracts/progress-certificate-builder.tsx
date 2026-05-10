"use client"

/**
 * ProgressCertificateBuilder — Sprint A.3 (the critical UX).
 *
 * Live cumulative-quantity editor for a subcontractor partial bill ("חשבון
 * חלקי"). Every keystroke debounces an UPSERT of the row + a recomputation
 * of the header waterfall. The footer shows the live waterfall:
 *
 *   ברוטו מצטבר
 *     − עכבון (5%)
 *     − ביטוח (0.65%)
 *   = מצטבר נטו
 *     − מצטבר קודם
 *     − קיזוזים מיוחדים (DEDUCTED)
 *   = לתשלום (לפני מע"מ)
 *     + מע"מ 17%
 *   = סה"כ כולל מע"מ
 *
 * Approve flips status → APPROVED, posts the GL JE, and auto-creates a
 * vendor invoice for the next AP Payment Run (Sprint A.2 closure).
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2, Send } from "lucide-react"

import {
  approveSubcontractorBill,
  recomputeBillTotals,
  submitBillForApproval,
  updateCumulativeLine,
} from "@/app/actions/subcontractor-bills"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
})
const ILS0 = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

type BoqLine = {
  id: string
  lineNo: number
  description: string
  uom: string
  contractedQty: number
  unitPrice: number
  contractedTotal: number
}

type LineState = {
  cumulativeQty: number
  cumulativePct: number
  cumulativeAmount: number
}

type Totals = {
  cumulative_executed_amount: number
  retention_deduction_amount: number
  insurance_deduction_amount: number
  cumulative_net_amount: number
  previous_billed_amount: number
  amount_to_pay: number
  vat_amount: number
  grand_total_amount: number
  back_charges_total: number
}

type Props = {
  billId: string
  billNumber: number
  status: string
  retentionPct: number
  insurancePct: number
  vatPct: number
  previousBilled: number
  boqLines: BoqLine[]
  initialLines: Record<string, LineState>
  initialTotals: Totals
}

const READ_ONLY_STATUSES = new Set(["APPROVED", "PAID"])

export function ProgressCertificateBuilder({
  billId,
  billNumber,
  status: initialStatus,
  retentionPct,
  insurancePct,
  vatPct,
  previousBilled,
  boqLines,
  initialLines,
  initialTotals,
}: Props) {
  const router = useRouter()
  const [status, setStatus] = React.useState(initialStatus)
  const [lines, setLines] = React.useState<Record<string, LineState>>(initialLines)
  const [totals, setTotals] = React.useState<Totals>(initialTotals)
  const [busy, setBusy] = React.useState<"" | "approving" | "submitting">("")
  const [msg, setMsg] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const readOnly = READ_ONLY_STATUSES.has(status)

  const optimisticTotals = React.useMemo(() => {
    const cumulativeExec = boqLines.reduce(
      (s, b) => s + (lines[b.id]?.cumulativeAmount ?? 0),
      0,
    )
    const retention = round2(cumulativeExec * (retentionPct / 100))
    const insurance = round2(cumulativeExec * (insurancePct / 100))
    const net = round2(cumulativeExec - retention - insurance)
    const backCharges = totals.back_charges_total
    const amountToPay = round2(net - previousBilled - backCharges)
    const vat = round2((amountToPay * vatPct) / 100)
    const grand = round2(amountToPay + vat)
    return {
      cumulativeExec,
      retention,
      insurance,
      net,
      backCharges,
      amountToPay,
      vat,
      grand,
    }
  }, [boqLines, lines, retentionPct, insurancePct, vatPct, previousBilled, totals.back_charges_total])

  function persistLine(boqLineId: string, next: LineState): void {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const upsert = await updateCumulativeLine({
        billId,
        boqLineId,
        cumulativeQty: next.cumulativeQty,
        cumulativePct: next.cumulativePct,
        cumulativeAmount: next.cumulativeAmount,
      })
      if (!upsert.ok) {
        setErr(upsert.error)
        return
      }
      const recomputed = await recomputeBillTotals(billId)
      if (recomputed.ok) {
        setTotals(recomputed.data)
        setErr(null)
      }
    }, 350)
  }

  function handlePctChange(boqLine: BoqLine, raw: string): void {
    if (readOnly) return
    const pct = clamp(parseFloat(raw || "0"), 0, 100)
    const qty = round3((pct / 100) * boqLine.contractedQty)
    const amount = round2(qty * boqLine.unitPrice)
    const next: LineState = {
      cumulativeQty: qty,
      cumulativePct: pct,
      cumulativeAmount: amount,
    }
    setLines((prev) => ({ ...prev, [boqLine.id]: next }))
    persistLine(boqLine.id, next)
  }

  async function handleSubmit(): Promise<void> {
    setBusy("submitting")
    setMsg(null)
    setErr(null)
    const res = await submitBillForApproval(billId)
    setBusy("")
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setStatus("SUBMITTED")
    setMsg(`חשבון #${billNumber} הוגש לאישור.`)
    router.refresh()
  }

  async function handleApprove(): Promise<void> {
    setBusy("approving")
    setMsg(null)
    setErr(null)
    const res = await approveSubcontractorBill(billId)
    setBusy("")
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setStatus("APPROVED")
    const parts: string[] = [`חשבון #${billNumber} אושר.`]
    if (res.data.journalEntryId) {
      parts.push(`JE: ${res.data.journalEntryId.slice(0, 8)}.`)
    }
    if (res.data.vendorInvoiceId) {
      parts.push(`חשבונית ספק נוצרה (${res.data.vendorInvoiceId.slice(0, 8)}).`)
    }
    if (res.data.backChargesDeducted > 0) {
      parts.push(`${res.data.backChargesDeducted} קיזוזים יושמו.`)
    }
    setMsg(parts.join(" "))
    router.refresh()
  }

  return (
    <section dir="rtl" className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="text-base font-bold tracking-tight">
            בוני חשבון מצטבר — חשבון #{billNumber}
          </h3>
          <p className="text-xs text-slate-600">
            שינויים בכמות מצטברת נשמרים אוטומטית. הוואטרפול בתחתית מתעדכן בזמן
            אמת.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              status === "APPROVED" || status === "PAID"
                ? "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900"
                : status === "SUBMITTED"
                  ? "rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900"
                  : "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800"
            }
          >
            {STATUS_LABELS[status] ?? status}
          </span>
          {!readOnly && status !== "SUBMITTED" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={handleSubmit}
              disabled={busy !== ""}
            >
              {busy === "submitting" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
              הגש לאישור
            </Button>
          ) : null}
          {!readOnly ? (
            <Button
              type="button"
              size="sm"
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              onClick={handleApprove}
              disabled={busy !== ""}
            >
              {busy === "approving" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <CheckCircle2 className="size-4" aria-hidden />
              )}
              אשר חשבון
            </Button>
          ) : null}
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px] tabular-nums">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-2 py-2 text-start font-semibold">#</th>
              <th className="px-2 py-2 text-start font-semibold">תיאור</th>
              <th className="px-2 py-2 text-end font-semibold">כמות בחוזה</th>
              <th className="px-2 py-2 text-end font-semibold">מחיר ליחידה</th>
              <th className="px-2 py-2 text-end font-semibold">% מצטבר</th>
              <th className="px-2 py-2 text-end font-semibold">כמות מצטברת</th>
              <th className="px-2 py-2 text-end font-semibold">ערך מצטבר</th>
            </tr>
          </thead>
          <tbody>
            {boqLines.map((b) => {
              const ln = lines[b.id] ?? {
                cumulativeQty: 0,
                cumulativePct: 0,
                cumulativeAmount: 0,
              }
              return (
                <tr key={b.id} className="border-t border-slate-100">
                  <td className="px-2 py-2 font-mono text-slate-500">{b.lineNo}</td>
                  <td className="px-2 py-2">
                    <div className="font-semibold">{b.description}</div>
                    <div className="text-[10px] text-slate-500">{b.uom}</div>
                  </td>
                  <td className="px-2 py-2 text-end font-mono">
                    {b.contractedQty}
                  </td>
                  <td className="px-2 py-2 text-end font-mono">
                    {ILS0.format(b.unitPrice)}
                  </td>
                  <td className="px-2 py-2 text-end">
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      max={100}
                      value={ln.cumulativePct}
                      disabled={readOnly}
                      onChange={(e) => handlePctChange(b, e.target.value)}
                      className="ml-auto h-8 w-20 text-end font-mono"
                    />
                  </td>
                  <td className="px-2 py-2 text-end font-mono">
                    {ln.cumulativeQty.toFixed(3)}
                  </td>
                  <td className="px-2 py-2 text-end font-mono font-semibold">
                    {ILS0.format(ln.cumulativeAmount)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Waterfall footer */}
      <footer className="space-y-1 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <Row
          label="סה&quot;כ ברוטו מצטבר (לפי שורות)"
          value={optimisticTotals.cumulativeExec}
          tone="default"
        />
        <Row
          label={`פחות עכבון (${retentionPct}%)`}
          value={-optimisticTotals.retention}
          tone="muted"
        />
        <Row
          label={`פחות ביטוח (${insurancePct}%)`}
          value={-optimisticTotals.insurance}
          tone="muted"
        />
        <Row
          label="מצטבר נטו"
          value={optimisticTotals.net}
          tone="emphasis"
        />
        <Row
          label="פחות מצטבר ששולם בחשבונות קודמים"
          value={-previousBilled}
          tone="muted"
        />
        {optimisticTotals.backCharges > 0 ? (
          <Row
            label="פחות קיזוזים מיוחדים (DEDUCTED)"
            value={-optimisticTotals.backCharges}
            tone="warning"
          />
        ) : null}
        <Row
          label="לתשלום (לפני מע&quot;מ)"
          value={optimisticTotals.amountToPay}
          tone="emphasis"
        />
        <Row label={`מע"מ ${vatPct}%`} value={optimisticTotals.vat} tone="muted" />
        <Row
          label="סה&quot;כ כולל מע&quot;מ"
          value={optimisticTotals.grand}
          tone="grand"
        />
      </footer>

      {msg ? (
        <p className="border-t border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-800">
          {msg}
        </p>
      ) : null}
      {err ? (
        <p className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-800">
          {err}
        </p>
      ) : null}
    </section>
  )
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "טיוטה",
  SUBMITTED: "הוגש",
  APPROVED: "אושר",
  PAID: "שולם",
  REJECTED: "נדחה",
}

type RowTone = "default" | "muted" | "emphasis" | "grand" | "warning"

function Row({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: RowTone
}) {
  const cls =
    tone === "grand"
      ? "border-t border-emerald-700 pt-1.5 mt-1.5 font-extrabold text-emerald-900 text-base"
      : tone === "emphasis"
        ? "font-bold text-slate-900"
        : tone === "warning"
          ? "text-amber-800"
          : tone === "muted"
            ? "text-slate-600"
            : "text-slate-800"
  return (
    <div className={`flex items-baseline justify-between ${cls}`}>
      <span>{label}</span>
      <span className="font-mono">{ILS.format(value)}</span>
    </div>
  )
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(lo, Math.min(hi, n))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
