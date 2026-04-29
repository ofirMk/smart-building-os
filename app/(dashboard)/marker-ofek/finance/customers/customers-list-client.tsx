"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Building2 } from "lucide-react"

import { MasterDetailWorkspace } from "@/components/layout/MasterDetailWorkspace"
import type { FinanceCustomerRow } from "@/lib/marker-ofek/finance-customers-actions"
import { buttonVariants } from "@/components/ui/button-variants"
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
  const router = useRouter()
  const preview = initialRows[0] ?? null

  return (
    <motion.div
      dir="rtl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      <MasterDetailWorkspace
        title="לקוחות"
        description="קטלוג לקוחות בסגנון Master-Detail"
        headerActions={
          <Link
            href="/marker-ofek/entities/new?kind=client&lock=1"
            className={buttonVariants({
              variant: "outline",
              className: "border-border bg-card shadow-sm",
            })}
          >
            לקוח חדש
          </Link>
        }
        master={
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              בחירת לקוח מהטבלה תפתח את כרטיס ה-360.
            </p>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-end font-medium text-muted-foreground">
                      שם
                    </TableHead>
                    <TableHead className="text-end font-medium text-muted-foreground">
                      ח.פ / ע.מ
                    </TableHead>
                    <TableHead className="text-end font-medium text-muted-foreground">
                      ימי אשראי
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initialRows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        אין לקוחות להצגה
                      </TableCell>
                    </TableRow>
                  ) : (
                    initialRows.map((r) => (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-accent/50"
                        onClick={() => router.push(`/marker-ofek/finance/customers/${r.id}`)}
                      >
                        <TableCell className="font-medium text-foreground">
                          {r.name}
                        </TableCell>
                        <TableCell
                          className="font-mono text-xs tabular-nums text-muted-foreground"
                          dir="ltr"
                        >
                          {r.legal_id ?? "—"}
                        </TableCell>
                        <TableCell className="tabular-nums text-foreground" dir="ltr">
                          {r.payment_terms_days}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        }
        detail={
          preview ? (
            <div className="space-y-4 p-1">
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Building2 className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{preview.name}</p>
                  <p className="text-xs text-muted-foreground">תצוגה מהירה של הלקוח הראשון ברשימה</p>
                </div>
              </div>
              <div className="space-y-2 rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">ח.פ / ע.מ</p>
                <p className="font-mono text-sm text-foreground" dir="ltr">
                  {preview.legal_id ?? "—"}
                </p>
              </div>
              <div className="space-y-2 rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">תנאי תשלום</p>
                <p className="text-sm text-foreground" dir="ltr">
                  {preview.payment_terms_days} ימים
                </p>
              </div>
              <Link
                href={`/marker-ofek/finance/customers/${preview.id}`}
                className={buttonVariants({ className: "w-fit" })}
              >
                פתיחת כרטיס לקוח 360°
              </Link>
            </div>
          ) : (
            <div className="p-3 text-sm text-muted-foreground">בחרו או צרו לקוח להצגת פרטים.</div>
          )
        }
      />
    </motion.div>
  )
}
