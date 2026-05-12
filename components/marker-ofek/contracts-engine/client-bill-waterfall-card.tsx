"use client"

/**
 * Sprint T2 — Client Bill Waterfall Card (MedaTech §3.2.2).
 *
 * Displays the full owner-side waterfall breakdown for a client progress
 * bill. Includes a "Recompute" button wired to the new full-waterfall RPC
 * via the server action. Server-side computed values are shown verbatim;
 * negative deltas are surfaced in red.
 *
 * Designed to live below the dual-pane bill editor in the contracts-engine
 * page, mirroring the position of the subcontractor waterfall summary.
 */

import { Calculator, Loader2 } from "lucide-react"
import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import {
  recomputeClientBillWaterfallAction,
  type ClientBillWaterfallSummary,
} from "@/lib/marker-ofek/contracts/t2-client-waterfall-actions"
import { cn } from "@/lib/utils"

interface ClientBillWaterfallCardProps {
  billId: string
  initialSummary?: ClientBillWaterfallSummary | null
  className?: string
}

function formatMoney(n: number): string {
  return n.toLocaleString("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  })
}

function formatPct(n: number): string {
  return `${n.toFixed(2)}%`
}

export function ClientBillWaterfallCard({
  billId,
  initialSummary = null,
  className,
}: ClientBillWaterfallCardProps) {
  const [summary, setSummary] = useState<ClientBillWaterfallSummary | null>(
    initialSummary,
  )
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleRecompute = () => {
    setError(null)
    startTransition(async () => {
      const result = await recomputeClientBillWaterfallAction({ billId })
      if (result.ok) {
        setSummary(result.summary)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-6 shadow-sm",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calculator className="size-5 text-emerald-600" aria-hidden />
          <div>
            <h3 className="text-base font-semibold">
              מפל הניכויים — חשבון מזמין
            </h3>
            <p className="text-xs text-muted-foreground">
              §3.2.2 — הצמדה, עיכבון (תקרה), ביטוח, ניכוי מקדמה, קיזוז חומר
              גלם, חיובי נגד, מע&quot;מ
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleRecompute}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="ms-1 size-4 animate-spin" aria-hidden />
          ) : null}
          חישוב מחדש
        </Button>
      </header>

      {error ? (
        <p
          className="mt-4 rounded-md bg-rose-50 p-2 text-sm font-medium text-rose-700 dark:bg-rose-900/20 dark:text-rose-300"
          role="alert"
        >
          שגיאה: {error}
        </p>
      ) : null}

      {!summary ? (
        <p className="mt-4 text-sm text-muted-foreground">
          לחץ &quot;חישוב מחדש&quot; כדי להריץ את המפל המלא לחשבון זה.
        </p>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Row
            label="מצב הזנה"
            value={summary.entryMode === "AGGREGATE" ? "מרוכז" : "מפורט"}
          />
          <Row label="מצטבר בוצע" value={formatMoney(summary.cumulativeExecuted)} />
          <Row label="הצמדה" value={formatMoney(summary.escalation)} tone="add" />
          <Row
            label="עיכבון לחשבון זה"
            value={formatMoney(summary.retentionThisBill)}
            tone="sub"
          />
          <Row
            label="ביטוח לחשבון זה"
            value={formatMoney(summary.insuranceThisBill)}
            tone="sub"
          />
          <Row
            label="ניכוי מקדמה"
            value={formatMoney(summary.advanceRecovery)}
            tone="sub"
          />
          <Row
            label="קיזוז חומר גלם"
            value={formatMoney(summary.rawMaterialOffset)}
            tone="sub"
          />
          <Row
            label="עמלת ניהול קיזוז"
            value={formatMoney(summary.rawMaterialCommission)}
            tone="sub"
          />
          <Row
            label="חיובי נגד"
            value={formatMoney(summary.backChargesTotal)}
            tone="sub"
          />
          <Row
            label="חשבונות קודמים"
            value={formatMoney(summary.previousBilled)}
            tone="sub"
          />
          <Row
            label="נטו לתשלום (לפני מע״מ)"
            value={formatMoney(summary.amountToPay)}
            tone="strong"
          />
          <Row
            label={`מע״מ (${formatPct(summary.vatPct)})`}
            value={formatMoney(summary.vat)}
            tone="add"
          />
          <Row
            label="סה״כ ברוטו לתשלום"
            value={formatMoney(summary.grandTotal)}
            tone="grand"
          />
          <Row
            label="חושב לאחרונה"
            value={new Date(summary.computedAt).toLocaleString("he-IL")}
            tone="muted"
            wide
          />
        </dl>
      )}
    </section>
  )
}

interface RowProps {
  label: string
  value: string
  tone?: "add" | "sub" | "strong" | "grand" | "muted"
  wide?: boolean
}

function Row({ label, value, tone, wide }: RowProps) {
  const valueClass = (() => {
    switch (tone) {
      case "add":
        return "text-emerald-700 dark:text-emerald-300"
      case "sub":
        return "text-rose-700 dark:text-rose-300"
      case "strong":
        return "font-semibold"
      case "grand":
        return "text-base font-bold text-emerald-700 dark:text-emerald-300"
      case "muted":
        return "text-xs text-muted-foreground"
      default:
        return ""
    }
  })()

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border/40 py-1",
        wide ? "col-span-full" : "",
      )}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("font-medium tabular-nums", valueClass)}>{value}</dd>
    </div>
  )
}
