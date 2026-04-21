"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"

import type { FinanceCustomerRow } from "@/lib/marker-ofek/finance-customers-actions"
import { buttonVariants } from "@/components/ui/button-variants"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function CustomersListClient({
  initialRows,
}: {
  initialRows: FinanceCustomerRow[]
}) {
  return (
    <motion.div
      className="mx-auto w-full max-w-5xl px-4 py-10"
      dir="rtl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold tracking-[0.22em] text-slate-400">
            Diamond Finance &amp; CRM
          </p>
          <h1 className="text-2xl font-extralight text-foreground">לקוחות</h1>
          <p className="text-sm font-light text-slate-500">
            מזמינים — תצוגת רשימה; F2 מכל בחירה ליצירת לקוח חדש.
          </p>
        </div>
        <Link
          href="/marker-ofek/entities/new?kind=client&lock=1"
          className={buttonVariants({
            variant: "outline",
            className: "border-slate-200 bg-card shadow-sm",
          })}
        >
          לקוח חדש
        </Link>
      </header>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-100 hover:bg-transparent">
              <TableHead className="text-end font-medium text-slate-500">
                שם
              </TableHead>
              <TableHead className="text-end font-medium text-slate-500">
                ח.פ / ע.מ
              </TableHead>
              <TableHead className="text-end font-medium text-slate-500">
                תנאי תשלום (ימים)
              </TableHead>
              <TableHead className="w-28 text-end font-medium text-slate-500">
                פעולות
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-12 text-center text-sm font-light text-slate-500"
                >
                  אין לקוחות רשומים. צרו לקוח חדש (F2 או כפתור למעלה).
                </TableCell>
              </TableRow>
            ) : (
              initialRows.map((r) => (
                <TableRow
                  key={r.id}
                  className="border-slate-50 hover:bg-background/60"
                >
                  <TableCell className="font-medium text-slate-800">
                    {r.name}
                  </TableCell>
                  <TableCell
                    className="font-mono text-xs text-slate-600 tabular-nums"
                    dir="ltr"
                  >
                    {r.legal_id ?? "—"}
                  </TableCell>
                  <TableCell className="tabular-nums" dir="ltr">
                    {r.payment_terms_days}
                  </TableCell>
                  <TableCell className="text-end">
                    <Link
                      href={`/marker-ofek/finance/customers/${r.id}`}
                      className={buttonVariants({
                        variant: "ghost",
                        size: "sm",
                        className: "text-slate-700",
                      })}
                    >
                      תצוגה 360°
                    </Link>
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
