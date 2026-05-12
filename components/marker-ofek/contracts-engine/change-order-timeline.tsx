"use client"

/**
 * Sprint W2 Phase 2 — Change-Order Timeline + creation form.
 *
 * Renders the immutable amendment history for a contract (§3.2.1.1) and
 * exposes a compact inline form to issue a new change order against the
 * `erp_create_change_order` RPC via the server action.
 *
 * The form supports all three spec-mandated KINDS:
 *   - NEW_LINE (description, qty, unit, unit_price, category)
 *   - QTY_DELTA (references_boq_line_id, qty_delta)
 *   - PRICE_DELTA (references_boq_line_id, price_delta)
 */

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

import { createChangeOrderAction } from "@/lib/marker-ofek/contracts/w2-engine-actions"
import type {
  ChangeOrderKind,
  ChangeOrderRow,
} from "@/lib/marker-ofek/contracts/w2-engine-types"

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

const STATUS_TONE: Record<string, string> = {
  APPROVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  DRAFT: "bg-amber-100 text-amber-800 border-amber-200",
  PENDING: "bg-sky-100 text-sky-800 border-sky-200",
  REJECTED: "bg-rose-100 text-rose-800 border-rose-200",
  CANCELLED: "bg-slate-100 text-slate-600 border-slate-200",
}

const KIND_LABEL: Record<ChangeOrderKind, string> = {
  NEW_LINE: "שורה חדשה",
  QTY_DELTA: "שינוי כמות",
  PRICE_DELTA: "שינוי מחיר",
}

type Props = {
  contractId: string
  amendments: ChangeOrderRow[]
}

export function ChangeOrderTimeline({ contractId, amendments }: Props) {
  const [kind, setKind] = React.useState<ChangeOrderKind>("NEW_LINE")
  const [pending, startTransition] = React.useTransition()
  const [feedback, setFeedback] = React.useState<{ tone: "ok" | "err"; text: string } | null>(null)
  const formRef = React.useRef<HTMLFormElement>(null)

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fd = new FormData(form)
    const description = String(fd.get("description") ?? "").trim()
    if (!description) {
      setFeedback({ tone: "err", text: "תיאור חובה." })
      return
    }
    const payload: Record<string, unknown> = { description }
    if (kind === "NEW_LINE") {
      payload.quantity = Number(fd.get("quantity") ?? 0)
      payload.unit = String(fd.get("unit") ?? "יח׳")
      payload.unit_price = Number(fd.get("unit_price") ?? 0)
      payload.category = String(fd.get("category") ?? "ADDITIONAL_WORKS")
    } else if (kind === "QTY_DELTA") {
      payload.references_boq_line_id = String(fd.get("references_boq_line_id") ?? "")
      payload.qty_delta = Number(fd.get("qty_delta") ?? 0)
    } else {
      payload.references_boq_line_id = String(fd.get("references_boq_line_id") ?? "")
      payload.price_delta = Number(fd.get("price_delta") ?? 0)
    }
    startTransition(async () => {
      setFeedback(null)
      const res = await createChangeOrderAction({ contractId, kind, payload })
      if (res.ok) {
        setFeedback({
          tone: "ok",
          text: `הוראת שינוי #${res.amendmentNumber} נוצרה (${res.status}). Δ = ${ils.format(res.valueDelta)}.`,
        })
        formRef.current?.reset()
      } else {
        setFeedback({ tone: "err", text: res.error })
      }
    })
  }

  return (
    <Card className="space-y-5 border-slate-200 bg-card p-5 shadow-sm" dir="rtl">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold tracking-tight">הוראות שינוי</h3>
          <p className="text-xs text-muted-foreground">
            §3.2.1.1 — שינוי בחוזה מקורי לעולם דרך הוראת שינוי. החוזה המקורי נשאר אימוטבילי.
          </p>
        </div>
        <Badge variant="outline" className="border-slate-300">{amendments.length} רשומות</Badge>
      </header>

      {/* Form */}
      <form ref={formRef} onSubmit={onSubmit} className="space-y-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">סוג השינוי:</span>
          {(["NEW_LINE", "QTY_DELTA", "PRICE_DELTA"] as ChangeOrderKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "rounded-md border px-3 py-1 text-xs font-medium transition-colors",
                kind === k
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
              )}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-slate-700">תיאור</span>
            <input
              name="description"
              required
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-500"
              placeholder="לדוגמה: תוספת קופסאות חשמל לחדר דוודים"
            />
          </label>

          {kind === "NEW_LINE" ? (
            <>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-slate-700">קטגוריה</span>
                <select
                  name="category"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  defaultValue="ADDITIONAL_WORKS"
                >
                  <option value="ADDITIONAL_WORKS">עבודות נוספות</option>
                  <option value="EXCEPTION">חריג</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-slate-700">כמות</span>
                <input
                  name="quantity"
                  type="number"
                  step="0.001"
                  min="0.001"
                  required
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-slate-700">יחידה</span>
                <input
                  name="unit"
                  defaultValue="יח׳"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-slate-700">מחיר ליחידה (₪)</span>
                <input
                  name="unit_price"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
              </label>
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-slate-700">מזהה שורת BOQ (uuid)</span>
                <input
                  name="references_boq_line_id"
                  required
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-mono"
                  placeholder="00000000-0000-0000-0000-000000000000"
                />
              </label>
              {kind === "QTY_DELTA" ? (
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-slate-700">דלתא כמות (חיובי/שלילי)</span>
                  <input
                    name="qty_delta"
                    type="number"
                    step="0.001"
                    required
                    className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  />
                </label>
              ) : (
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-slate-700">דלתא מחיר ליחידה (₪)</span>
                  <input
                    name="price_delta"
                    type="number"
                    step="0.01"
                    required
                    className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  />
                </label>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          {feedback ? (
            <p
              className={cn(
                "text-xs font-medium",
                feedback.tone === "ok" ? "text-emerald-700" : "text-rose-700",
              )}
            >
              {feedback.text}
            </p>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {kind === "NEW_LINE"
                ? "NEW_LINE דורש מחיר וכמות > 0 (§3.2.1.1)."
                : "השינוי מחושב כדלתא, לא ערך מוחלט."}
            </span>
          )}
          <Button type="submit" disabled={pending} size="sm">
            {pending ? "שולח…" : "יצירת הוראת שינוי"}
          </Button>
        </div>
      </form>

      {/* Timeline */}
      {amendments.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-muted-foreground">
          אין הוראות שינוי לחוזה זה.
        </p>
      ) : (
        <ol className="space-y-2">
          {amendments.map((amendment) => (
            <li
              key={amendment.id}
              className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-slate-300 font-mono text-[10px]">
                    #{amendment.amendmentNumber}
                  </Badge>
                  {amendment.kind ? (
                    <Badge variant="outline" className="border-indigo-300 bg-indigo-50 text-indigo-700">
                      {KIND_LABEL[amendment.kind]}
                    </Badge>
                  ) : null}
                  <Badge
                    variant="outline"
                    className={cn(
                      "font-semibold",
                      STATUS_TONE[amendment.status] ?? STATUS_TONE.DRAFT,
                    )}
                  >
                    {amendment.status}
                  </Badge>
                  {amendment.category ? (
                    <span className="text-[11px] text-muted-foreground">
                      {amendment.category === "EXCEPTION" ? "חריג" : "עבודות נוספות"}
                    </span>
                  ) : null}
                </div>
                <p className="truncate text-sm text-slate-900">{amendment.description}</p>
                {amendment.kind === "QTY_DELTA" && amendment.qtyDelta != null ? (
                  <p className="text-[11px] text-muted-foreground">Δ כמות: {amendment.qtyDelta}</p>
                ) : null}
                {amendment.kind === "PRICE_DELTA" && amendment.priceDelta != null ? (
                  <p className="text-[11px] text-muted-foreground">
                    Δ מחיר: {ils.format(amendment.priceDelta)}
                  </p>
                ) : null}
              </div>
              <div className="text-end font-currency-mono text-sm font-semibold tabular-nums text-slate-900">
                {ils.format(amendment.valueDelta)}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
