"use client"

import * as React from "react"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { createPartialAccountFromBaseline } from "@/lib/marker-ofek/create-partial-account-from-baseline"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { usePartialAccountDraft, type DraftLineSeed } from "@/hooks/use-partial-account-draft"
import { cn, formatError } from "@/lib/utils"

import type { ContractBillingInitial } from "@/lib/marker-ofek/contract-billing-types"

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
})

function lineKeyFromRow(li: {
  contract_line_item_id: string | null
  contract_milestone_id: string | null
}): string {
  if (li.contract_line_item_id) return `cli:${li.contract_line_item_id}`
  if (li.contract_milestone_id) return `ms:${li.contract_milestone_id}`
  return `row:${Math.random()}`
}

function buildSeeds(
  baseline: NonNullable<ContractBillingInitial["newAccountBaseline"]>
): DraftLineSeed[] {
  return baseline.lines.map((li) => ({
    lineKey: lineKeyFromRow(li),
    lineBase: li.lineBase,
    quantityPrevious: li.quantityPreviousEnd,
    quantityCurrent:
      li.ganttSuggestedPercent != null
        ? li.ganttSuggestedPercent
        : li.quantityPreviousEnd,
    label: li.label,
    contract_line_item_id: li.contract_line_item_id,
    contract_milestone_id: li.contract_milestone_id,
  }))
}

export function CreateAccountDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: ContractBillingInitial
}) {
  const baseline = initial.newAccountBaseline
  if (!baseline) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(90vh,48rem)] max-w-4xl overflow-y-auto border border-slate-100 bg-[#FFFFFF] p-0"
        dir="rtl"
      >
        {open ? (
          <CreateAccountDialogBody
            key={baseline.sourcePartialAccountId}
            initial={initial}
            baseline={baseline}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function CreateAccountDialogBody({
  initial,
  baseline,
  onOpenChange,
}: {
  initial: ContractBillingInitial
  baseline: NonNullable<ContractBillingInitial["newAccountBaseline"]>
  onOpenChange: (open: boolean) => void
}) {
  const seeds = React.useMemo(() => buildSeeds(baseline), [baseline])

  const draft = usePartialAccountDraft({
    previousCumulativeApproved: baseline.previousCumulativeApproved,
    contractTotal: initial.totalContract,
    indexCoefficient: initial.billingDraftParams.indexCoefficient,
    deductionPercents: initial.billingDraftParams.deductionPercents,
    seeds,
  })

  const [submitting, setSubmitting] = React.useState(false)

  function ganttSuggestionForKey(lineKey: string): number | null {
    const row = baseline.lines.find(
      (li) => lineKeyFromRow(li) === lineKey
    )
    return row?.ganttSuggestedPercent ?? null
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const lineStates = draft.rows.map((r) => ({
        contract_line_item_id: r.contract_line_item_id,
        contract_milestone_id: r.contract_milestone_id,
        quantity_previous: r.quantityPrevious,
        quantity_current: r.quantityCurrent,
      }))
      const res = await createPartialAccountFromBaseline({
        contractId: initial.contractId,
        sourcePartialAccountId: baseline.sourcePartialAccountId,
        lineStates,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`נוצר חשבון חלקי מס׳ ${res.accountNumber}`)
      onOpenChange(false)
      window.location.reload()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSubmitting(false)
    }
  }

  const totalContract = initial.totalContract
  const recognized = initial.totalRecognized
  const ribbonRecognizedPct =
    totalContract != null &&
    totalContract > 0 &&
    Number.isFinite(draft.preview.newCumulativeTotal)
      ? Math.min(100, (draft.preview.newCumulativeTotal / totalContract) * 100)
      : null

  return (
    <>
      <DialogHeader className="border-b border-slate-100 px-4 py-3">
        <DialogTitle className="text-lg text-[#1e293b]">
          חשבון חלקי חדש (אחרי מס׳ {baseline.sourceAccountNumber})
        </DialogTitle>
        <DialogDescription className="text-xs text-slate-500">
          בסיס מאושר מצטבר:{" "}
          <span className="font-currency-mono font-semibold text-[#1e293b]">
            {currencyFormatter.format(baseline.previousCumulativeApproved)}
          </span>
          — הפרש אחוזים בין קודם לנוכחי יוצר עבודת תקופה; ניכויים על התקופה בלבד.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 border-b border-slate-100 bg-background/40 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          סיכום מחושב (בזמן אמת)
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <RibbonCell
            label="עבודת תקופה (ברוטו)"
            value={currencyFormatter.format(draft.preview.periodWorkGross)}
          />
          <RibbonCell
            label="אחרי צמידה"
            value={currencyFormatter.format(draft.preview.periodWorkIndexed)}
          />
          <RibbonCell
            label="לתשלום (אחרי ניכויים)"
            value={currencyFormatter.format(draft.preview.paymentDue)}
            emphasize
          />
          <RibbonCell
            label="מצטבר מוצהר (אחרי חשבון זה)"
            value={currencyFormatter.format(draft.preview.newCumulativeTotal)}
          />
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
          <span className="font-currency-mono">
            עכבון {draft.preview.retention.toFixed(2)} ₪ · ביטוח{" "}
            {draft.preview.insurance.toFixed(2)} ₪ · אגרות{" "}
            {draft.preview.labFees.toFixed(2)} ₪
          </span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-slate-500">
            <span>התקדמות גבייה (מצטבר מוצהר / חוזה)</span>
            {ribbonRecognizedPct != null ? (
              <span className="font-currency-mono text-[#1e293b]">
                {ribbonRecognizedPct.toFixed(1)}%
              </span>
            ) : (
              <span>—</span>
            )}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full border border-slate-100 bg-card">
            <div
              className="h-full rounded-full bg-indigo-600 transition-[width] duration-200"
              style={{
                width: `${ribbonRecognizedPct != null ? Math.min(100, Math.max(0, ribbonRecognizedPct)) : 0}%`,
              }}
            />
          </div>
          <p className="text-[10px] text-slate-400">
            מוכר כיום (חשבוניות+חלקיים):{" "}
            <span className="font-currency-mono">{currencyFormatter.format(recognized)}</span>
          </p>
        </div>
      </div>

      <div className="px-4 py-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 border-slate-200"
          onClick={() =>
            draft.applyGanttToCurrent((k) => ganttSuggestionForKey(k))
          }
        >
          <Sparkles className="size-4" aria-hidden />
          החלת % מהגנט לנוכחי
        </Button>
      </div>

      <div className="max-h-[min(50vh,22rem)] overflow-auto px-2 pb-2">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-100 hover:bg-transparent">
              <TableHead className="text-slate-600">שורה</TableHead>
              <TableHead className="text-end font-currency-mono text-slate-600">
                קודם %
              </TableHead>
              <TableHead className="text-end font-currency-mono text-slate-600">
                נוכחי %
              </TableHead>
              <TableHead className="text-end font-currency-mono text-slate-600">
                סה״כ מחוזה %
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {draft.rows.map((r) => {
              const pv = draft.previewByKey.get(r.lineKey)
              return (
                <TableRow key={r.lineKey} className="border-slate-100">
                  <TableCell className="max-w-[12rem] text-sm text-slate-800">
                    {r.label}
                  </TableCell>
                  <TableCell className="w-[6.5rem]">
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      className="h-8 font-currency-mono text-end text-sm tabular-nums"
                      value={
                        Number.isFinite(r.quantityPrevious)
                          ? r.quantityPrevious
                          : ""
                      }
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        draft.setPreviousPercent(
                          r.lineKey,
                          Number.isFinite(v) ? v : 0
                        )
                      }}
                    />
                  </TableCell>
                  <TableCell className="w-[6.5rem]">
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      className="h-8 font-currency-mono text-end text-sm tabular-nums"
                      value={
                        Number.isFinite(r.quantityCurrent)
                          ? r.quantityCurrent
                          : ""
                      }
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        draft.setCurrentPercent(
                          r.lineKey,
                          Number.isFinite(v) ? v : 0
                        )
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-end font-currency-mono text-sm tabular-nums text-slate-700">
                    {pv?.totalPercentOfContract != null
                      ? `${pv.totalPercentOfContract.toFixed(2)}%`
                      : "—"}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <DialogFooter className="gap-2 border-t border-slate-100 px-4 py-3 sm:justify-between">
        <Button
          type="button"
          variant="outline"
          className="border-slate-200"
          onClick={() => onOpenChange(false)}
        >
          ביטול
        </Button>
        <Button
          type="button"
          disabled={submitting}
          className="border border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
          onClick={() => void handleSubmit()}
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          צור חשבון וחשב
        </Button>
      </DialogFooter>
    </>
  )
}

function RibbonCell({
  label,
  value,
  emphasize,
}: {
  label: string
  value: string
  emphasize?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-100 bg-card px-2 py-1.5",
        emphasize && "border-indigo-100 bg-indigo-50/50"
      )}
    >
      <p className="text-[10px] font-medium text-slate-500">{label}</p>
      <p
        className={cn(
          "font-currency-mono text-sm font-semibold tabular-nums text-[#1e293b]",
          emphasize && "text-indigo-900"
        )}
      >
        {value}
      </p>
    </div>
  )
}
