"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import type {
  MoInvoiceDocumentType,
  MoReceiptPaymentMethod,
} from "@/types/marker-ofek"

const VAT_RATE = 0.17

const DOC_LABELS: Record<MoInvoiceDocumentType, string> = {
  tax_invoice: "חשבונית מס",
  receipt: "קבלה",
  tax_invoice_receipt: "חשבונית מס קבלה",
}

const PAY_LABELS: Record<MoReceiptPaymentMethod, string> = {
  bank_transfer: "העברה בנקאית",
  check: "צ׳ק",
  credit_card: "כרטיס אשראי",
  cash: "מזומן",
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

type ClientOption = { id: string; name: string }
type PartialOption = { id: string; account_number: number; created_at: string }

export type IssueClientInvoiceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  contractId: string
  projectId: string
  defaultSubtotal: number
  onIssued?: (invoiceId: string) => void
}

export function IssueClientInvoiceDialog({
  open,
  onOpenChange,
  contractId,
  projectId,
  defaultSubtotal,
  onIssued,
}: IssueClientInvoiceDialogProps) {
  const [clients, setClients] = React.useState<ClientOption[]>([])
  const [partials, setPartials] = React.useState<PartialOption[]>([])
  const [entityId, setEntityId] = React.useState("")
  const [partialId, setPartialId] = React.useState<string>("")
  const [docType, setDocType] =
    React.useState<MoInvoiceDocumentType>("tax_invoice")
  const [issueDate, setIssueDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [subtotalStr, setSubtotalStr] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [loadingRefs, setLoadingRefs] = React.useState(false)

  const needsPayment =
    docType === "receipt" || docType === "tax_invoice_receipt"

  const [payMethod, setPayMethod] =
    React.useState<MoReceiptPaymentMethod>("bank_transfer")
  const [payRef, setPayRef] = React.useState("")
  const [payDate, setPayDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )

  const subtotal = roundMoney(parseFloat(subtotalStr.replace(",", ".")) || 0)
  const vatAmount = roundMoney(subtotal * VAT_RATE)
  const grandTotal = roundMoney(subtotal + vatAmount)

  React.useEffect(() => {
    if (!open) return
    setSubtotalStr(
      defaultSubtotal > 0 ? String(roundMoney(defaultSubtotal)) : ""
    )
    setPartialId("")
    setDocType("tax_invoice")
    setPayRef("")
    setIssueDate(new Date().toISOString().slice(0, 10))
    setPayDate(new Date().toISOString().slice(0, 10))
  }, [open, defaultSubtotal])

  React.useEffect(() => {
    if (!open || !contractId) return
    let cancelled = false
    async function load() {
      setLoadingRefs(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const [cRes, pRes] = await Promise.all([
          supabase
            .from("entities")
            .select("id, name")
            .eq("type", "client")
            .eq("is_deleted", false)
            .order("name", { ascending: true }),
          supabase
            .from("partial_accounts")
            .select("id, account_number, created_at")
            .eq("contract_id", contractId)
            .eq("is_deleted", false)
            .order("created_at", { ascending: false })
            .limit(30),
        ])
        if (cRes.error) throw cRes.error
        if (pRes.error) throw pRes.error
        if (!cancelled) {
          const cl = (cRes.data as ClientOption[]) ?? []
          setClients(cl)
          setEntityId((prev) => {
            if (prev && cl.some((x) => x.id === prev)) return prev
            return cl[0]?.id ?? ""
          })
          setPartials((pRes.data as PartialOption[]) ?? [])
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(
            e instanceof Error ? e.message : "טעינת נתונים לחשבונית נכשלה"
          )
        }
      } finally {
        if (!cancelled) setLoadingRefs(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, contractId])

  async function handleSave() {
    if (!entityId) {
      toast.error("נא לבחור לקוח (ישות מסוג ׳לקוח׳).")
      return
    }
    if (subtotal <= 0) {
      toast.error("סכום לפני מע״מ חייב להיות חיובי.")
      return
    }
    if (needsPayment && !payRef.trim()) {
      toast.error("נא למלא אסמכתא / מספר צ׳ק / אישור תשלום.")
      return
    }

    setSaving(true)
    const supabase = createSupabaseBrowserClient()
    try {
      const status =
        docType === "tax_invoice_receipt" || docType === "receipt"
          ? "paid"
          : "issued"

      const { data: inv, error: invErr } = await supabase
        .from("mo_invoices")
        .insert({
          project_id: projectId,
          entity_id: entityId,
          contract_id: contractId,
          linked_partial_account_id: partialId || null,
          issue_date: issueDate,
          document_type: docType,
          subtotal,
          vat_amount: vatAmount,
          grand_total: grandTotal,
          status,
        })
        .select("id, invoice_number")
        .single()

      if (invErr) throw invErr
      if (!inv?.id) throw new Error("לא נשמר מזהה חשבונית")

      if (needsPayment) {
        const { error: payErr } = await supabase
          .from("mo_receipt_payments")
          .insert({
            invoice_id: inv.id,
            payment_method: payMethod,
            reference_number: payRef.trim(),
            amount: grandTotal,
            payment_date: payDate,
          })
        if (payErr) {
          await supabase.from("mo_invoices").delete().eq("id", inv.id)
          throw payErr
        }
      }

      toast.success(
        `נוצרה חשבונית מס מס׳ ${(inv as { invoice_number: number }).invoice_number}`
      )
      onOpenChange(false)
      onIssued?.(inv.id as string)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(`שמירה נכשלה: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  const currency = new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle>הפקת חשבונית מס ללקוח</DialogTitle>
          <DialogDescription>
            מסמך רשמי לפי מע״מ — מספר רץ אוטומטי מהמסד. מע״מ {VAT_RATE * 100}%
            על בסיס הסכום לפני מע״מ.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {loadingRefs ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              טוען לקוחות וחשבונות חלקיים…
            </p>
          ) : null}

          <div className="space-y-2">
            <Label>סוג מסמך</Label>
            <Select
              value={docType}
              onValueChange={(v) => setDocType(v as MoInvoiceDocumentType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DOC_LABELS) as MoInvoiceDocumentType[]).map(
                  (k) => (
                    <SelectItem key={k} value={k}>
                      {DOC_LABELS[k]}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>לקוח (חייב במע״מ)</Label>
            <Select
              value={entityId}
              onValueChange={(v) => setEntityId(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="בחרו לקוח" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {clients.length === 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                אין ישויות מסוג ׳לקוח׳. הוסיפו לקוח בטבלת entities לפני הפקת חשבונית.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>קישור לחשבון חלקי (אופציונלי)</Label>
            <Select
              value={partialId || "none"}
              onValueChange={(v) => setPartialId(!v || v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="ללא" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">ללא</SelectItem>
                {partials.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    חשבון חלקי #{p.account_number} (
                    {new Date(p.created_at).toLocaleDateString("he-IL")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="inv-issue-date">תאריך מסמך</Label>
            <Input
              id="inv-issue-date"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="inv-subtotal">סכום לפני מע״מ (₪)</Label>
            <Input
              id="inv-subtotal"
              inputMode="decimal"
              value={subtotalStr}
              onChange={(e) => setSubtotalStr(e.target.value)}
              dir="ltr"
              className="font-mono text-end"
            />
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">מע״מ ({VAT_RATE * 100}%)</span>
              <span className="tabular-nums font-medium">
                {currency.format(vatAmount)}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-2 border-t border-border/50 pt-1 font-semibold">
              <span>סה״כ כולל מע״מ</span>
              <span className="tabular-nums">{currency.format(grandTotal)}</span>
            </div>
          </div>

          {needsPayment ? (
            <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                פרטי תשלום (חובה למסמך קבלה)
              </p>
              <div className="space-y-2">
                <Label>אמצעי תשלום</Label>
                <Select
                  value={payMethod}
                  onValueChange={(v) =>
                    setPayMethod(v as MoReceiptPaymentMethod)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PAY_LABELS) as MoReceiptPaymentMethod[]).map(
                      (k) => (
                        <SelectItem key={k} value={k}>
                          {PAY_LABELS[k]}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pay-ref">אסמכתא / מספר צ׳ק</Label>
                <Input
                  id="pay-ref"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="למשל: אסמכתא בנק / 4 ספרות אשראי"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pay-date">תאריך תשלום</Label>
                <Input
                  id="pay-date"
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                />
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            ביטול
          </Button>
          <Button
            type="button"
            className="bg-emerald-600 text-white hover:bg-emerald-500"
            disabled={saving || loadingRefs}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            שמירה והמשך להדפסה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
