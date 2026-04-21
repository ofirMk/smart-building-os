"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"

import type { AgingBucket, AgingInvoiceRow } from "@/lib/marker-ofek/finance-aging-actions"
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

export function AgingReportClient({
  initial,
}: {
  initial: {
    buckets: AgingBucket[]
    rows: AgingInvoiceRow[]
    totalOpen: number
  }
}) {
  return (
    <motion.div
      className="mx-auto w-full max-w-6xl px-4 py-10"
      dir="rtl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.22em] text-slate-400">
            דוחות כספיים
          </p>
          <h1 className="text-2xl font-extralight text-foreground">גילוי חובות</h1>
          <p className="mt-1 text-sm font-light text-slate-500">
            לפי תאריך יעד (הנפקה + תנאי תשלום מהלקוח).
          </p>
        </div>
        <Link
          href="/marker-ofek/finance"
          className="text-xs font-medium text-indigo-600 underline-offset-2 hover:underline"
        >
          חזרה לכספים
        </Link>
      </header>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {initial.buckets.map((b) => (
          <div
            key={b.key}
            className="rounded-2xl border border-slate-100 bg-card px-4 py-4 shadow-sm"
          >
            <p className="text-[11px] font-medium text-slate-400">{b.label}</p>
            <p
              className="mt-2 text-lg font-light tabular-nums text-foreground"
              dir="ltr"
            >
              {ils.format(b.amount)}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-card p-2 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-50 px-4 py-3">
          <span className="text-sm font-medium text-slate-700">סה״כ פתוח</span>
          <span className="text-lg font-light tabular-nums text-foreground" dir="ltr">
            {ils.format(initial.totalOpen)}
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-slate-50 hover:bg-transparent">
              <TableHead className="text-end text-[11px]">לקוח</TableHead>
              <TableHead className="text-end text-[11px]" dir="ltr">
                מס׳
              </TableHead>
              <TableHead className="text-end text-[11px]" dir="ltr">
                הנפקה
              </TableHead>
              <TableHead className="text-end text-[11px]" dir="ltr">
                יעד
              </TableHead>
              <TableHead className="text-end text-[11px]" dir="ltr">
                ימים
              </TableHead>
              <TableHead className="text-end text-[11px]" dir="ltr">
                פתוח
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initial.rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-12 text-center text-sm text-slate-500"
                >
                  אין חובות פתוחים להצגה.
                </TableCell>
              </TableRow>
            ) : (
              initial.rows.map((r) => (
                <TableRow key={r.invoice_id} className="border-slate-50">
                  <TableCell className="font-medium text-slate-800">
                    <Link
                      href={`/marker-ofek/finance/customers/${r.entity_id}`}
                      className="hover:text-indigo-600 hover:underline"
                    >
                      {r.entity_name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs" dir="ltr">
                    {r.invoice_number ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs" dir="ltr">
                    {r.issue_date}
                  </TableCell>
                  <TableCell className="text-xs" dir="ltr">
                    {r.due_date}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums" dir="ltr">
                    {r.days_past_due}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-amber-900" dir="ltr">
                    {ils.format(r.open_amount)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </motion.div>
  )
}
