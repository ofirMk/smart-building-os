"use client"

import { useMemo, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  createClientReceiptAction,
  type ArReceiptMethod,
  type OpenClientBill,
} from "@/lib/marker-ofek/finance/t6-ar-ap-actions"

const FMT = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

function fmt(n: number): string {
  return FMT.format(n)
}

const METHODS: Array<{ value: ArReceiptMethod; label: string }> = [
  { value: "BANK_TRANSFER", label: "העברה בנקאית" },
  { value: "CHECK", label: "המחאה" },
  { value: "CASH", label: "מזומן" },
  { value: "CREDIT_CARD", label: "כרטיס אשראי" },
  { value: "OTHER", label: "אחר" },
]

export function CustomerReceiptComposer({
  companyId,
  openBills,
  error,
}: {
  companyId: string
  openBills: OpenClientBill[]
  error: string | null
}) {
  const [allocations, setAllocations] = useState<Record<string, number>>({})
  const [method, setMethod] = useState<ArReceiptMethod>("BANK_TRANSFER")
  const [receiptDate, setReceiptDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  // Group bills by contract → user picks a contract first, then allocates.
  const billsByContract = useMemo(() => {
    const m = new Map<string, { clientName: string; bills: OpenClientBill[] }>()
    for (const b of openBills) {
      const e = m.get(b.contractId)
      if (e) e.bills.push(b)
      else m.set(b.contractId, { clientName: b.clientName, bills: [b] })
    }
    return m
  }, [openBills])

  const activeBills = selectedContractId
    ? (billsByContract.get(selectedContractId)?.bills ?? [])
    : []

  const total = useMemo(
    () => Object.values(allocations).reduce((s, v) => s + (Number(v) || 0), 0),
    [allocations],
  )

  function setAlloc(billId: string, value: string) {
    const n = Number(value)
    setAllocations((prev) => ({ ...prev, [billId]: Number.isFinite(n) ? n : 0 }))
  }

  function fillFullOpen(bill: OpenClientBill) {
    setAllocations((prev) => ({ ...prev, [bill.id]: bill.openAmount }))
  }

  function submit() {
    setMessage(null)
    if (!selectedContractId) {
      setMessage({ tone: "error", text: "יש לבחור חוזה לקוח" })
      return
    }
    const contractEntry = billsByContract.get(selectedContractId)
    if (!contractEntry) {
      setMessage({ tone: "error", text: "חוזה לא נמצא" })
      return
    }
    const allocList = Object.entries(allocations)
      .map(([progressBillId, amount]) => ({ progressBillId, amount: Number(amount) || 0 }))
      .filter((a) => a.amount > 0)
    if (allocList.length === 0) {
      setMessage({ tone: "error", text: "יש להזין סכום על לפחות חשבון אחד" })
      return
    }

    startTransition(async () => {
      const result = await createClientReceiptAction({
        companyId,
        clientContractId: selectedContractId,
        clientName: contractEntry.clientName,
        receiptDate,
        method,
        reference: reference || undefined,
        notes: notes || undefined,
        allocations: allocList,
      })
      if (result.ok) {
        setMessage({
          tone: "success",
          text: `נוצר תקבול ${result.receiptNumber} על סך ${fmt(result.totalAmount)} ✓`,
        })
        setAllocations({})
        setReference("")
        setNotes("")
      } else {
        setMessage({ tone: "error", text: `שגיאה: ${result.error}` })
      }
    })
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">רישום תקבול לקוח</h1>
        <p className="text-sm text-muted-foreground">
          הקצאת תקבול לחשבונות חלקיות פתוחות — לאחר השמירה הטריגרים יעדכנו אוטומטית את יתרת הלקוח, הסטטוס, ויפיקו תנועת יומן (DR בנק / CR לקוח).
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          שגיאה בטעינת חשבונות פתוחים: {error}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-3">
        {/* Contract picker */}
        <Card className="flex min-h-0 flex-col lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">חוזי לקוח עם חוב פתוח</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
            <div className="flex-1 overflow-auto">
              {billsByContract.size === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  אין חוזים עם חוב פתוח כרגע 🎉
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {Array.from(billsByContract.entries()).map(([contractId, group]) => {
                    const open = group.bills.reduce((s, b) => s + b.openAmount, 0)
                    const active = contractId === selectedContractId
                    return (
                      <li key={contractId}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedContractId(contractId)
                            setAllocations({})
                          }}
                          className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-right transition-colors hover:bg-muted/50 ${
                            active ? "bg-primary/10" : ""
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-foreground">{group.clientName}</div>
                            <div className="text-xs text-muted-foreground">
                              {group.bills.length} חשבונות פתוחים
                            </div>
                          </div>
                          <div className="font-mono text-sm font-semibold text-foreground">
                            {fmt(open)}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Receipt composer */}
        <Card className="flex min-h-0 flex-col lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">פרטי תקבול והקצאה</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="receiptDate">תאריך תקבול</Label>
                <Input
                  id="receiptDate"
                  type="date"
                  value={receiptDate}
                  onChange={(e) => setReceiptDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>אמצעי תשלום</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as ArReceiptMethod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="reference">אסמכתא (מס׳ צ׳ק / העברה)</Label>
                <Input
                  id="reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="לדוגמה: 1234567"
                />
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>חשבון</TableHead>
                    <TableHead>אושר ב-</TableHead>
                    <TableHead className="text-end">סכום מלא</TableHead>
                    <TableHead className="text-end">שולם</TableHead>
                    <TableHead className="text-end">פתוח</TableHead>
                    <TableHead className="text-end">להקצות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeBills.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-sm text-muted-foreground"
                      >
                        {selectedContractId ? "אין חשבונות פתוחים" : "בחר חוזה כדי להקצות תקבול"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    activeBills.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono text-xs">{b.billNumber ?? b.id.slice(0, 8)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {b.approvedAt?.slice(0, 10) ?? "—"}
                        </TableCell>
                        <TableCell className="text-end font-mono text-sm">{fmt(b.totalAmount)}</TableCell>
                        <TableCell className="text-end font-mono text-sm text-emerald-600 dark:text-emerald-400">
                          {fmt(b.paidAmount)}
                        </TableCell>
                        <TableCell className="text-end font-mono text-sm font-semibold">
                          {fmt(b.openAmount)}
                        </TableCell>
                        <TableCell className="text-end">
                          <div className="flex items-center justify-end gap-2">
                            <Input
                              type="number"
                              inputMode="decimal"
                              className="w-32 text-end font-mono"
                              value={String(allocations[b.id] ?? "")}
                              onChange={(e) => setAlloc(b.id, e.target.value)}
                              min={0}
                              step={1}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => fillFullOpen(b)}
                            >
                              מלא
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-1">
              <Label htmlFor="notes">הערות</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="אופציונלי"
                rows={2}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="text-sm">
                <span className="text-muted-foreground">סה״כ תקבול: </span>
                <span className="font-mono text-lg font-semibold text-foreground">{fmt(total)}</span>
              </div>
              <Button onClick={submit} disabled={pending || total <= 0}>
                {pending ? "שומר…" : "שמור תקבול ✓"}
              </Button>
            </div>

            {message ? (
              <div
                className={`rounded-md border px-3 py-2 text-sm ${
                  message.tone === "success"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-destructive/40 bg-destructive/10 text-destructive"
                }`}
              >
                {message.text}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
