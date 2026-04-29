"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels"

import type {
  CustomerInvoiceRow,
  CustomerReceiptRow,
  FinanceCustomerRow,
} from "@/lib/marker-ofek/finance-customers-actions"
import { useDiamondNavigation } from "@/hooks/use-diamond-navigation"
import { buttonVariants } from "@/components/ui/button-variants"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
})

function contactLines(contact: Record<string, unknown>): string[] {
  const out: string[] = []
  const phone = contact.phone ?? contact.mobile ?? contact.tel
  const email = contact.email
  if (typeof phone === "string" && phone.trim()) out.push(phone.trim())
  if (typeof email === "string" && email.trim()) out.push(email.trim())
  return out
}

export function Customer360Client({
  initial,
}: {
  initial: {
    customer: FinanceCustomerRow
    invoices: CustomerInvoiceRow[]
    receipts: CustomerReceiptRow[]
    openBalance: number
  }
}) {
  useDiamondNavigation("customers")

  const c = initial.customer

  return (
    <motion.div
      className="flex flex-1 min-h-0 flex-col overflow-hidden bg-background/50"
      dir="rtl"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="shrink-0 border-b border-slate-100 bg-card px-4 py-4 md:px-8">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-400">
              לקוח — תצוגה 360°
            </p>
            <h1 className="text-xl font-light text-foreground">{c.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/marker-ofek/finance/customers"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              לרשימה
            </Link>
            <Link
              href="/marker-ofek/invoices/new"
              className={buttonVariants({
                size: "sm",
                className: "bg-slate-900 text-white hover:bg-slate-800",
              })}
            >
              חשבונית מס
            </Link>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-2 py-4 md:px-6">
        <PanelGroup direction="horizontal" className="mx-auto h-full min-h-0 max-w-[1400px]">
          <Panel defaultSize={32} minSize={22} className="min-w-0">
            <div className="h-full overflow-auto rounded-2xl border border-slate-100 bg-card p-6 shadow-sm">
              <h2 className="text-xs font-semibold tracking-wide text-slate-400">
                פרטים
              </h2>
              <dl className="mt-4 space-y-4 text-sm font-light">
                <div>
                  <dt className="text-[11px] text-slate-400">ח.פ / ע.מ</dt>
                  <dd className="font-mono text-slate-800 tabular-nums" dir="ltr">
                    {c.legal_id ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-400">כתובת חיוב</dt>
                  <dd className="text-slate-800">{c.billing_address ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-400">יצירת קשר</dt>
                  <dd className="space-y-1 text-slate-800">
                    {contactLines(c.contact_info).length ? (
                      contactLines(c.contact_info).map((line) => (
                        <span key={line} className="block" dir="ltr">
                          {line}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-400">תנאי תשלום</dt>
                  <dd className="tabular-nums text-slate-800" dir="ltr">
                    {c.payment_terms_days} ימים
                  </dd>
                </div>
              </dl>
            </div>
          </Panel>
          <PanelResizeHandle className="relative w-2 shrink-0 bg-transparent before:absolute before:inset-y-8 before:start-1/2 before:w-px before:-translate-x-1/2 before:bg-slate-200 hover:before:bg-slate-300" />
          <Panel minSize={45} className="min-w-0">
            <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
              <div className="shrink-0 rounded-2xl border border-slate-100 bg-card px-6 py-5 shadow-sm">
                <p className="text-[11px] font-medium text-slate-400">אובליגו פתוח</p>
                <p
                  className="mt-1 text-2xl font-extralight text-foreground tabular-nums"
                  dir="ltr"
                >
                  {ils.format(initial.openBalance)}
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-100 bg-card shadow-sm">
                <div className="border-b border-slate-50 px-4 py-3">
                  <h2 className="text-sm font-medium text-slate-700">פעילות כספית</h2>
                  <p className="text-[11px] font-light text-slate-500">
                    חשבוניות מס וקבלות
                  </p>
                </div>
                <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
                  <p className="px-2 py-1 text-[11px] font-semibold text-slate-400">
                    חשבוניות
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-50 hover:bg-transparent">
                        <TableHead className="h-8 text-end text-[11px]">מס׳</TableHead>
                        <TableHead className="h-8 text-end text-[11px]">תאריך</TableHead>
                        <TableHead className="h-8 text-end text-[11px]" dir="ltr">
                          סכום
                        </TableHead>
                        <TableHead className="h-8 text-end text-[11px]" dir="ltr">
                          פתוח
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {initial.invoices.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="text-center text-xs text-slate-500"
                          >
                            אין חשבוניות
                          </TableCell>
                        </TableRow>
                      ) : (
                        initial.invoices.map((inv) => (
                          <TableRow key={inv.id} className="border-slate-50">
                            <TableCell className="font-mono text-xs" dir="ltr">
                              {inv.invoice_number ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs" dir="ltr">
                              {inv.issue_date?.slice(0, 10) ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums" dir="ltr">
                              {ils.format(inv.grand_total)}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums text-amber-800" dir="ltr">
                              {ils.format(inv.open_amount)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="min-h-0 flex-1 overflow-auto border-t border-slate-50 px-2 py-2">
                  <p className="px-2 py-1 text-[11px] font-semibold text-slate-400">
                    קבלות
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-50 hover:bg-transparent">
                        <TableHead className="h-8 text-end text-[11px]">תאריך</TableHead>
                        <TableHead className="h-8 text-end text-[11px]">אמצעי</TableHead>
                        <TableHead className="h-8 text-end text-[11px]" dir="ltr">
                          סכום
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {initial.receipts.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="text-center text-xs text-slate-500"
                          >
                            אין קבלות
                          </TableCell>
                        </TableRow>
                      ) : (
                        initial.receipts.map((rec) => (
                          <TableRow key={rec.id} className="border-slate-50">
                            <TableCell className="text-xs" dir="ltr">
                              {rec.receipt_date.slice(0, 10)}
                            </TableCell>
                            <TableCell className="text-xs">{rec.payment_method}</TableCell>
                            <TableCell className="text-xs tabular-nums" dir="ltr">
                              {ils.format(rec.amount)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </motion.div>
  )
}
