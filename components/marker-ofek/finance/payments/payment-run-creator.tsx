"use client"

/**
 * PaymentRunCreator — Sprint A.2.
 *
 * Wizard for grouping APPROVED/READY_FOR_PAYMENT vendor invoices into a single
 * payment run + executing it (MASAV). Renders as a Sheet triggered by the
 * "הרצת תשלומים חדשה" button on the runs page.
 *
 * Flow:
 *   1) Operator picks bank account + run date + payment method.
 *   2) Selects N invoices from the list (live total updates).
 *   3) "צור הרצה (DRAFT)" → server action createPaymentRun.
 *   4) "אשר ובצע — הורד מס\"ב" → approve + execute + GL post + download.
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus } from "lucide-react"

import {
  approvePaymentRun,
  createPaymentRun,
  executePaymentRunMasav,
} from "@/app/actions/ap-payments"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

type Invoice = {
  id: string
  invoiceNumber: string
  invoiceDate: string | null
  totalAmount: number
  supplierId: string
  supplierName: string
  supplierNumber: string
}

type BankAccount = {
  id: string
  alias: string
}

type Props = {
  bankAccounts: BankAccount[]
  invoices: Invoice[]
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function downloadTextFile(content: string, fileName: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function PaymentRunCreator({ bankAccounts, invoices }: Props) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [runNumber, setRunNumber] = React.useState(
    `PR-${todayIso().replace(/-/g, "")}-001`,
  )
  const [runDate, setRunDate] = React.useState(todayIso())
  const [bankAccountId, setBankAccountId] = React.useState(
    bankAccounts[0]?.id ?? "",
  )
  const [paymentMethod, setPaymentMethod] = React.useState<
    "MASAV" | "CHECK" | "WIRE"
  >("MASAV")
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [draftRunId, setDraftRunId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [ok, setOk] = React.useState<string | null>(null)

  const total = React.useMemo(
    () =>
      invoices
        .filter((i) => selected.has(i.id))
        .reduce((s, i) => s + i.totalAmount, 0),
    [invoices, selected],
  )

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreate(): Promise<void> {
    setBusy(true)
    setError(null)
    setOk(null)
    const res = await createPaymentRun({
      runNumber,
      runDate,
      paymentMethod,
      bankAccountId,
      invoiceIds: [...selected],
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setDraftRunId(res.data.id)
    setOk(`הרצה נוצרה (DRAFT). סה"כ: ${ILS.format(res.data.total_amount)}`)
    router.refresh()
  }

  async function handleApproveAndExecute(): Promise<void> {
    if (!draftRunId) return
    setBusy(true)
    setError(null)
    setOk(null)
    const aprv = await approvePaymentRun(draftRunId)
    if (!aprv.ok) {
      setBusy(false)
      setError(aprv.error)
      return
    }
    const exec = await executePaymentRunMasav(draftRunId)
    setBusy(false)
    if (!exec.ok) {
      setError(exec.error)
      return
    }
    downloadTextFile(exec.data.content, exec.data.fileName)
    setOk(
      `הרצה בוצעה. הקובץ ${exec.data.fileName} הורד (${exec.data.summary.recordCount} רשומות, סה"כ ${ILS.format(exec.data.summary.totalIls)}).` +
        (exec.data.journalEntryId
          ? ` JE: ${exec.data.journalEntryId.slice(0, 8)}.`
          : ""),
    )
    setDraftRunId(null)
    setSelected(new Set())
    router.refresh()
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button type="button" size="sm" className="gap-2">
            <Plus className="size-4" aria-hidden />
            הרצת תשלומים חדשה
          </Button>
        }
      />
      <SheetContent side="left" className="w-full max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>הרצת תשלומים חדשה</SheetTitle>
          <SheetDescription>
            בחרו חשבון בנק, חשבוניות מאושרות לתשלום, וצרו את ההרצה. לאחר
            אישור ה-CFO תופק מס&quot;ב והתנועות יירשמו אוטומטית ל-GL.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="runNumber">מספר הרצה</Label>
            <Input
              id="runNumber"
              value={runNumber}
              onChange={(e) => setRunNumber(e.target.value)}
              disabled={!!draftRunId}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="runDate">תאריך</Label>
            <Input
              id="runDate"
              type="date"
              value={runDate}
              onChange={(e) => setRunDate(e.target.value)}
              disabled={!!draftRunId}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bankAccount">חשבון בנק</Label>
            <select
              id="bankAccount"
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              disabled={!!draftRunId}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.alias}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="paymentMethod">שיטת תשלום</Label>
            <select
              id="paymentMethod"
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(e.target.value as "MASAV" | "CHECK" | "WIRE")
              }
              disabled={!!draftRunId}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="MASAV">מס&quot;ב</option>
              <option value="CHECK">צ&apos;ק</option>
              <option value="WIRE">העברה בנקאית</option>
            </select>
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-bold">חשבוניות זמינות לתשלום</h3>
          <p className="text-xs text-muted-foreground">
            רק חשבוניות בסטטוס APPROVED / READY_FOR_PAYMENT / MATCHED.
          </p>
          <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-slate-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-slate-700">
                  <th className="px-2 py-1.5 text-start">בחר</th>
                  <th className="px-2 py-1.5 text-start">חשבונית</th>
                  <th className="px-2 py-1.5 text-start">ספק</th>
                  <th className="px-2 py-1.5 text-end">סכום</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-4 text-center text-slate-500">
                      אין חשבוניות זמינות.
                    </td>
                  </tr>
                ) : (
                  invoices.map((i) => (
                    <tr key={i.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={selected.has(i.id)}
                          onChange={() => toggle(i.id)}
                          disabled={!!draftRunId}
                        />
                      </td>
                      <td className="px-2 py-1.5 font-mono">{i.invoiceNumber}</td>
                      <td className="px-2 py-1.5">{i.supplierName}</td>
                      <td className="px-2 py-1.5 text-end font-mono tabular-nums">
                        {ILS.format(i.totalAmount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
          סה&quot;כ נבחרו <strong>{selected.size}</strong> חשבוניות —{" "}
          <strong className="font-mono">{ILS.format(total)}</strong>
        </div>

        {error ? (
          <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        ) : null}
        {ok ? (
          <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {ok}
          </p>
        ) : null}

        <SheetFooter className="mt-4 flex-row justify-end gap-2">
          {!draftRunId ? (
            <Button
              type="button"
              onClick={handleCreate}
              disabled={busy || selected.size === 0 || !bankAccountId}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              צור הרצה (DRAFT)
            </Button>
          ) : (
            <Button
              type="button"
              variant="default"
              onClick={handleApproveAndExecute}
              disabled={busy}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              אשר ובצע — הורד מס&quot;ב
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
