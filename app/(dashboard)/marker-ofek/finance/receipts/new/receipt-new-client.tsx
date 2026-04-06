"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { toast } from "sonner"

import type { FinanceCustomerRow } from "@/lib/marker-ofek/finance-customers-actions"
import {
  createMoReceiptAction,
  fetchOpenInvoicesForReceipt,
  type OpenInvoiceOption,
} from "@/lib/marker-ofek/finance-receipts-actions"
import { formatError } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
})

export function ReceiptNewClient({
  customers,
}: {
  customers: FinanceCustomerRow[]
}) {
  const router = useRouter()
  const [entityId, setEntityId] = React.useState("")
  const [openInvoices, setOpenInvoices] = React.useState<OpenInvoiceOption[]>([])
  const [loadingInv, setLoadingInv] = React.useState(false)
  const [receiptDate, setReceiptDate] = React.useState(
    () => new Date().toISOString().slice(0, 10)
  )
  const [paymentMethod, setPaymentMethod] = React.useState<string>("bank_transfer")
  const [reference, setReference] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [allocations, setAllocations] = React.useState<
    { invoiceId: string; amount: string }[]
  >([])
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!entityId) {
      setOpenInvoices([])
      return
    }
    let cancelled = false
    setLoadingInv(true)
    void fetchOpenInvoicesForReceipt(entityId)
      .then((rows) => {
        if (!cancelled) setOpenInvoices(rows.filter((r) => r.open_amount > 0.009))
      })
      .catch(() => {
        if (!cancelled) toast.error("טעינת חשבוניות נכשלה")
      })
      .finally(() => {
        if (!cancelled) setLoadingInv(false)
      })
    return () => {
      cancelled = true
    }
  }, [entityId])

  function addAllocation() {
    setAllocations((a) => [...a, { invoiceId: "", amount: "" }])
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amt = Number(amount)
    if (!entityId || !Number.isFinite(amt) || amt <= 0) {
      toast.error("בחרו לקוח וסכום תקין")
      return
    }
    const allocParsed = allocations
      .filter((x) => x.invoiceId.trim() && x.amount.trim())
      .map((x) => ({
        invoiceId: x.invoiceId.trim(),
        amount: Number(x.amount),
      }))
      .filter((x) => x.amount > 0)

    setSaving(true)
    try {
      const res = await createMoReceiptAction({
        receiptDate,
        paymentMethod: paymentMethod as "bank_transfer",
        reference: reference.trim() || undefined,
        amount: amt,
        entityId,
        projectId: null,
        notes: notes.trim() || undefined,
        allocations: allocParsed,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("הקבלה נרשמה ופקודת יומן נוצרה")
      router.push("/marker-ofek/finance/reports/aging")
      router.refresh()
    } catch (err) {
      toast.error(formatError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      className="mx-auto w-full max-w-lg px-4 py-10"
      dir="rtl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <header className="mb-8 space-y-1">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-400">
          גבייה
        </p>
        <h1 className="text-2xl font-extralight text-slate-900">קבלה חדשה</h1>
        <p className="text-sm font-light text-slate-500">
          רישום תשלום — התאמה לחשבוניות פתוחות (אופציונלי).
        </p>
        <Link
          href="/marker-ofek/finance"
          className="inline-block text-xs font-medium text-indigo-600 underline-offset-2 hover:underline"
        >
          חזרה לכספים
        </Link>
      </header>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-5 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-2">
          <Label>לקוח</Label>
          <Select
            value={entityId || "__none__"}
            onValueChange={(v) => setEntityId(v === "__none__" || !v ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="בחרו לקוח" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="rd">תאריך קבלה</Label>
          <Input
            id="rd"
            type="date"
            value={receiptDate}
            onChange={(e) => setReceiptDate(e.target.value)}
            dir="ltr"
            className="font-mono"
            required
          />
        </div>

        <div className="grid gap-2">
          <Label>אמצעי תשלום</Label>
          <Select
            value={paymentMethod}
            onValueChange={(v) => v && setPaymentMethod(v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bank_transfer">העברה בנקאית</SelectItem>
              <SelectItem value="check">צ׳ק</SelectItem>
              <SelectItem value="cash">מזומן</SelectItem>
              <SelectItem value="credit_card">כרטיס אשראי</SelectItem>
              <SelectItem value="other">אחר</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="ref">אסמכתא</Label>
          <Input
            id="ref"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            dir="ltr"
            className="font-mono"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="amt">סכום (₪)</Label>
          <Input
            id="amt"
            type="number"
            min={0.01}
            step={0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            dir="ltr"
            className="font-mono"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="notes">הערות</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="font-light"
          />
        </div>

        <div className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-700">
              הקצאה לחשבוניות
            </span>
            <Button type="button" variant="outline" size="sm" onClick={addAllocation}>
              שורה
            </Button>
          </div>
          {loadingInv ? (
            <p className="text-xs text-slate-500">טוען חשבוניות…</p>
          ) : null}
          {allocations.map((row, idx) => (
            <div key={idx} className="grid gap-2 sm:grid-cols-2">
              <Select
                value={row.invoiceId || "__pick__"}
                onValueChange={(v) => {
                  const inv = v === "__pick__" || !v ? "" : v
                  setAllocations((a) =>
                    a.map((x, i) =>
                      i === idx ? { ...x, invoiceId: inv } : x
                    )
                  )
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="חשבונית" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__pick__">—</SelectItem>
                  {openInvoices.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      <span dir="ltr" className="font-mono text-xs">
                        #{inv.invoice_number ?? "—"} · {ils.format(inv.open_amount)} פתוח
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={0.01}
                step={0.01}
                placeholder="סכום"
                value={row.amount}
                dir="ltr"
                className="font-mono"
                onChange={(e) => {
                  const v = e.target.value
                  setAllocations((a) =>
                    a.map((x, i) => (i === idx ? { ...x, amount: v } : x))
                  )
                }}
              />
            </div>
          ))}
        </div>

        <Button
          type="submit"
          className="w-full bg-slate-900 text-white hover:bg-slate-800"
          disabled={saving}
        >
          {saving ? "שומר…" : "רישום קבלה ויומן"}
        </Button>
      </form>
    </motion.div>
  )
}
