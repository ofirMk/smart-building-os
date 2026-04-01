"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useTransition } from "react"
import { Wallet } from "lucide-react"

import {
  createInvoice,
  markInvoicePaid,
  type BillingActionState,
} from "@/app/(dashboard)/billing/actions"
import { formatIls } from "@/lib/billing-format"
import type { TenantOption } from "@/lib/billing"
import type { InvoiceWithTenant } from "@/types/billing"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

const initialFormState: BillingActionState = {
  ok: false,
  message: "",
}

function tenantLabel(t: TenantOption) {
  const name = t.full_name?.trim() || "דייר ללא שם"
  const email = t.email?.trim()
  return email ? `${name} (${email})` : name
}

function profileName(inv: InvoiceWithTenant) {
  const p = inv.profiles
  if (!p) return "—"
  const row = Array.isArray(p) ? p[0] : p
  return row?.full_name?.trim() || row?.email?.trim() || "—"
}

function formatDue(iso: string) {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "medium",
      timeZone: "Asia/Jerusalem",
    }).format(new Date(iso + "T12:00:00"))
  } catch {
    return iso
  }
}

type BillingAdminProps = {
  tenants: TenantOption[]
  invoices: InvoiceWithTenant[]
}

export function BillingAdmin({ tenants, invoices }: BillingAdminProps) {
  const router = useRouter()
  const { success, error } = useToast()
  const [formState, formAction, formPending] = useActionState(
    createInvoice,
    initialFormState
  )
  const [paidPending, startPaid] = useTransition()

  useEffect(() => {
    if (formState.ok) {
      router.refresh()
    }
  }, [formState.ok, router])

  return (
    <div
      className="mx-auto flex w-full max-w-6xl flex-col gap-8 text-start"
      dir="rtl"
    >
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          חיובים ותשלומים
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">ניהול כספים</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          רישום חיובים לדיירים, מעקב אחר תשלומים וסימון סטטוס שולם.
        </p>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <Wallet className="size-4" aria-hidden />
            </span>
            <div>
              <CardTitle className="text-lg">רישום חיוב חדש</CardTitle>
              <CardDescription>
                בחרו דייר, סכום בשקלים, תיאור ותאריך יעד לתשלום.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form
            key={invoices.length}
            action={formAction}
            className="grid gap-4 sm:grid-cols-2"
          >
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bill-tenant">דייר</Label>
              <select
                id="bill-tenant"
                name="tenant_id"
                required
                disabled={formPending || tenants.length === 0}
                defaultValue=""
                className={cn(
                  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm",
                  "outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                <option value="" disabled>
                  בחרו דייר
                </option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {tenantLabel(t)}
                  </option>
                ))}
              </select>
              {tenants.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  אין דיירים רשומים במערכת — הוסיפו דיירים תחילה.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bill-amount">סכום (₪)</Label>
              <Input
                id="bill-amount"
                name="amount"
                type="text"
                inputMode="decimal"
                required
                placeholder="0"
                disabled={formPending}
                className="text-start tabular-nums"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bill-due">תאריך יעד לתשלום</Label>
              <Input
                id="bill-due"
                name="due_date"
                type="date"
                required
                disabled={formPending}
                className="text-start"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bill-desc">תיאור</Label>
              <Input
                id="bill-desc"
                name="description"
                required
                maxLength={200}
                placeholder="לדוגמה: דמי ניהול, טעינת רכב, תיקון…"
                disabled={formPending}
                className="text-start"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button
                type="submit"
                disabled={formPending || tenants.length === 0}
              >
                {formPending ? "שומרים…" : "רישום חיוב"}
              </Button>
              {formState.message ? (
                <p
                  className={cn(
                    "text-sm",
                    formState.ok
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive"
                  )}
                  role={formState.ok ? "status" : "alert"}
                >
                  {formState.message}
                </p>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle className="text-lg">כל החיובים</CardTitle>
          <CardDescription>ממוינים לפי תאריך יעד (הקרוב ביותר).</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {invoices.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              אין חיובים. רשמו חיוב חדש מהטופס למעלה.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[140px] ps-4">דייר</TableHead>
                    <TableHead className="min-w-[120px]">תיאור</TableHead>
                    <TableHead className="hidden md:table-cell">מועד יעד</TableHead>
                    <TableHead className="text-start">סכום</TableHead>
                    <TableHead>סטטוס</TableHead>
                    <TableHead className="pe-4 text-end">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => {
                    const paid = inv.status === "paid"
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="ps-4 font-medium">
                          {profileName(inv)}
                        </TableCell>
                        <TableCell className="max-w-[220px] break-words">
                          {inv.description}
                        </TableCell>
                        <TableCell className="hidden tabular-nums text-muted-foreground md:table-cell">
                          {formatDue(inv.due_date)}
                        </TableCell>
                        <TableCell className="tabular-nums font-semibold">
                          {formatIls(inv.amount)}
                        </TableCell>
                        <TableCell>
                          {paid ? (
                            <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-400">
                              שולם
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-destructive/40 bg-destructive/10 text-destructive"
                            >
                              ממתין
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="pe-4 text-end">
                          {!paid ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={paidPending}
                              onClick={() =>
                                startPaid(async () => {
                                  const r = await markInvoicePaid(inv.id)
                                  if (r.ok) {
                                    success("החיוב סומן כשולם.")
                                    router.refresh()
                                  } else {
                                    error(r.error)
                                  }
                                })
                              }
                            >
                              שולם
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
