"use client"

/**
 * TaxInvoiceComposerClient — interactive form for drafting a new tax invoice.
 * Calls `createTaxInvoiceDraftAction` on submit and redirects to the show page.
 *
 * Supports:
 *   • customer selector (from the server-loaded master)
 *   • kind selector (TAX_INVOICE / CONSOLIDATED_INVOICE / TAX_RECEIPT / CREDIT_MEMO)
 *   • issue date / VAT rate / global discount %
 *   • editable lines with per-line discount + source-doc reference
 *     (used as the consolidation spine for CONSOLIDATED_INVOICE)
 *   • live totals preview via pure `computeTaxInvoiceTotals` import.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { createTaxInvoiceDraftAction } from "@/lib/marker-ofek/finance/t7-tax-invoice-actions"
import type {
  TaxInvoiceKind,
  TaxInvoiceLineInput,
} from "@/lib/marker-ofek/finance/t7-tax-invoice-actions"
// Pure sync helper lives in the sibling helpers module (Server-Actions files
// cannot export non-async functions in Next.js).
import { computeTaxInvoiceTotals } from "@/lib/marker-ofek/finance/t7-tax-invoice-helpers"

export type TaxInvoiceComposerCustomer = {
  id: string
  customerNumber: string
  name: string
  legalId: string | null
  vatId: string | null
  address: string | null
  defaultVatRatePct: number
}

type LineDraft = {
  key: string
  description: string
  quantity: string
  unitPriceExcl: string
  unitLabel: string
  itemCode: string
  sourceDocNumber: string
  discountPct: string
}

const KIND_LABEL_HE: Record<TaxInvoiceKind, string> = {
  TAX_INVOICE: "חשבונית מס",
  TAX_RECEIPT: "חשבונית מס / קבלה",
  CREDIT_MEMO: "חשבונית זיכוי",
  CONSOLIDATED_INVOICE: "חשבונית מס מרכזת",
}

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
})

function newLine(): LineDraft {
  return {
    key: Math.random().toString(36).slice(2, 10),
    description: "",
    quantity: "1",
    unitPriceExcl: "0",
    unitLabel: "יח'",
    itemCode: "",
    sourceDocNumber: "",
    discountPct: "0",
  }
}

export function TaxInvoiceComposerClient({
  companyId,
  customers,
}: {
  companyId: string
  customers: TaxInvoiceComposerCustomer[]
}) {
  const router = useRouter()
  const [kind, setKind] = React.useState<TaxInvoiceKind>("TAX_INVOICE")
  const [customerId, setCustomerId] = React.useState<string>(customers[0]?.id ?? "")
  const [issueDate, setIssueDate] = React.useState<string>(
    new Date().toISOString().slice(0, 10),
  )
  const [vatRatePct, setVatRatePct] = React.useState<string>(
    String(customers[0]?.defaultVatRatePct ?? 17),
  )
  const [globalDiscountPct, setGlobalDiscountPct] = React.useState<string>("0")
  const [attentionTo, setAttentionTo] = React.useState<string>("")
  const [shipToAddress, setShipToAddress] = React.useState<string>("")
  const [notes, setNotes] = React.useState<string>("")
  const [lines, setLines] = React.useState<LineDraft[]>([newLine()])
  const [submitting, setSubmitting] = React.useState(false)

  const selectedCustomer = React.useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  )

  const totals = React.useMemo(() => {
    return computeTaxInvoiceTotals({
      lines: lines.map((l) => ({
        quantity: Number(l.quantity) || 0,
        unitPriceExcl: Number(l.unitPriceExcl) || 0,
        discountPct: Number(l.discountPct) || 0,
      })),
      vatRatePct: Number(vatRatePct) || 0,
      globalDiscountPct: Number(globalDiscountPct) || 0,
    })
  }, [lines, vatRatePct, globalDiscountPct])

  const isConsolidated = kind === "CONSOLIDATED_INVOICE"

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    )
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()])
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customerId) {
      toast.error("בחר לקוח לפני שמירה")
      return
    }
    const lineInputs: TaxInvoiceLineInput[] = lines.map((l, idx) => ({
      lineNo: idx + 1,
      description: l.description.trim(),
      quantity: Number(l.quantity) || 0,
      unitPriceExcl: Number(l.unitPriceExcl) || 0,
      unitLabel: l.unitLabel || undefined,
      itemCode: l.itemCode || undefined,
      sourceDocNumber: l.sourceDocNumber || undefined,
      sourceDocKind: l.sourceDocNumber ? "DELIVERY_NOTE" : undefined,
      discountPct: Number(l.discountPct) || 0,
    }))

    const missingDesc = lineInputs.findIndex((l) => l.description.length === 0)
    if (missingDesc >= 0) {
      toast.error(`שורה ${missingDesc + 1}: חסר תאור`)
      return
    }

    setSubmitting(true)
    try {
      const res = await createTaxInvoiceDraftAction({
        companyId,
        customerId,
        kind,
        issueDate,
        vatRatePct: Number(vatRatePct) || 17,
        globalDiscountPct: Number(globalDiscountPct) || 0,
        attentionTo: attentionTo.trim() || undefined,
        shipToAddress: shipToAddress.trim() || undefined,
        notes: notes.trim() || undefined,
        lines: lineInputs,
      })
      if (!res.ok) {
        toast.error("יצירת החשבונית נכשלה", { description: res.error })
        return
      }
      toast.success("הטיוטה נשמרה")
      router.push(`/marker-ofek/finance/tax-invoices/${res.invoiceId}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      dir="rtl"
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            חשבונית מס חדשה
          </h1>
          <p className="text-xs text-muted-foreground">
            פתיחת טיוטה · Close + Print יבוצעו לאחר השמירה.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.push("/marker-ofek/finance/tax-invoices")}
          >
            ביטול
          </Button>
          <Button type="submit" size="sm" disabled={submitting} className="gap-2">
            {submitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            שמור טיוטה
          </Button>
        </div>
      </header>

      {/* Document header */}
      <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-muted-foreground">סוג מסמך</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as TaxInvoiceKind)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {(Object.keys(KIND_LABEL_HE) as TaxInvoiceKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL_HE[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="font-semibold text-muted-foreground">לקוח</span>
          <select
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value)
              const c = customers.find((cc) => cc.id === e.target.value)
              if (c) setVatRatePct(String(c.defaultVatRatePct))
            }}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.customerNumber ? ` · ${c.customerNumber}` : ""}
                {c.legalId ? ` · ח.פ ${c.legalId}` : ""}
              </option>
            ))}
          </select>
          {selectedCustomer?.address ? (
            <span className="text-[10px] text-muted-foreground">
              כתובת: {selectedCustomer.address}
            </span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-muted-foreground">תאריך חשבונית</span>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-muted-foreground">מע״מ %</span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={vatRatePct}
            onChange={(e) => setVatRatePct(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-muted-foreground">הנחה כללית %</span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={globalDiscountPct}
            onChange={(e) => setGlobalDiscountPct(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-muted-foreground">לידי</span>
          <input
            value={attentionTo}
            onChange={(e) => setAttentionTo(e.target.value)}
            placeholder="איש קשר אצל הלקוח"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-muted-foreground">כתובת למשלוח</span>
          <input
            value={shipToAddress}
            onChange={(e) => setShipToAddress(e.target.value)}
            placeholder="אם שונה מהכתובת הרשומה"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
      </Card>

      {/* Lines editor */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">שורות חשבונית</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addLine}
            className="gap-2"
          >
            <Plus className="size-4" aria-hidden />
            שורה חדשה
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-600">
              <tr>
                <th className="px-2 py-2 text-center">#</th>
                <th className="px-2 py-2 text-start">מק״ט</th>
                {isConsolidated ? (
                  <th className="px-2 py-2 text-start">תעודה</th>
                ) : null}
                <th className="px-2 py-2 text-start">תאור *</th>
                <th className="px-2 py-2 text-center">כמות</th>
                <th className="px-2 py-2 text-center">יח׳</th>
                <th className="px-2 py-2 text-end">מחיר יחידה</th>
                <th className="px-2 py-2 text-end">הנחה %</th>
                <th className="px-2 py-2 text-end">סה״כ</th>
                <th className="px-2 py-2 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                const lineTotalExcl = totals.perLine[idx]?.lineTotalExcl ?? 0
                return (
                  <tr key={l.key} className="border-t border-border">
                    <td className="px-2 py-1 text-center font-mono">{idx + 1}</td>
                    <td className="px-2 py-1">
                      <input
                        value={l.itemCode}
                        onChange={(e) => updateLine(l.key, { itemCode: e.target.value })}
                        className="w-full rounded border border-border bg-background px-1 py-1 text-xs font-mono"
                      />
                    </td>
                    {isConsolidated ? (
                      <td className="px-2 py-1">
                        <input
                          value={l.sourceDocNumber}
                          onChange={(e) =>
                            updateLine(l.key, { sourceDocNumber: e.target.value })
                          }
                          placeholder="K5117600303"
                          className="w-full rounded border border-border bg-background px-1 py-1 text-xs font-mono"
                        />
                      </td>
                    ) : null}
                    <td className="px-2 py-1">
                      <input
                        value={l.description}
                        onChange={(e) =>
                          updateLine(l.key, { description: e.target.value })
                        }
                        required
                        className="w-full rounded border border-border bg-background px-1 py-1 text-xs"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        step={0.001}
                        value={l.quantity}
                        onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                        className="w-20 rounded border border-border bg-background px-1 py-1 text-center text-xs font-mono"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={l.unitLabel}
                        onChange={(e) => updateLine(l.key, { unitLabel: e.target.value })}
                        className="w-16 rounded border border-border bg-background px-1 py-1 text-center text-xs"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        step={0.01}
                        value={l.unitPriceExcl}
                        onChange={(e) =>
                          updateLine(l.key, { unitPriceExcl: e.target.value })
                        }
                        className="w-24 rounded border border-border bg-background px-1 py-1 text-end text-xs font-mono"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={l.discountPct}
                        onChange={(e) =>
                          updateLine(l.key, { discountPct: e.target.value })
                        }
                        className="w-16 rounded border border-border bg-background px-1 py-1 text-end text-xs font-mono"
                      />
                    </td>
                    <td className="px-2 py-1 text-end font-mono tabular-nums font-semibold">
                      {ILS.format(lineTotalExcl)}
                    </td>
                    <td className="px-2 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => removeLine(l.key)}
                        disabled={lines.length === 1}
                        className="text-rose-600 disabled:opacity-30"
                        aria-label="מחק שורה"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Totals preview + notes */}
      <Card className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-muted-foreground">הערות פנימיות</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <div className="rounded-md border border-border bg-slate-50/50 p-3 text-sm">
          <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">
            תצוגה מקדימה (מעודכן בזמן אמת)
          </p>
          <dl className="grid grid-cols-2 gap-y-1 font-mono tabular-nums text-[12px]">
            <dt className="text-slate-600">מחיר כולל</dt>
            <dd className="text-end">{ILS.format(totals.subtotalAmount)}</dd>
            {totals.globalDiscountAmount > 0 ? (
              <>
                <dt className="text-slate-600">הנחה כללית</dt>
                <dd className="text-end text-red-700">
                  -{ILS.format(totals.globalDiscountAmount)}
                </dd>
                <dt className="text-slate-600">אחרי הנחה</dt>
                <dd className="text-end">
                  {ILS.format(totals.subtotalAfterDiscount)}
                </dd>
              </>
            ) : null}
            <dt className="text-slate-600">מע״מ</dt>
            <dd className="text-end">{ILS.format(totals.vatAmount)}</dd>
            <dt className="font-bold text-foreground">סה״כ לתשלום</dt>
            <dd className="text-end font-bold">{ILS.format(totals.grandTotal)}</dd>
          </dl>
        </div>
      </Card>
    </form>
  )
}
