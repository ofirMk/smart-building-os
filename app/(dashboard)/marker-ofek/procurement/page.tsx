"use client"

import Link from "next/link"
import { Package, Plus } from "lucide-react"

import {
  DenseDetailPanel,
  ERP_DENSE_LABEL_CLASS,
} from "@/components/layout/DenseMasterDetailTemplate"
import { EntityWorkspace } from "@/components/layout/EntityWorkspace"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

export default function ProcurementDashboardPage() {
  const sidebar = (
    <div className="rounded-md border border-slate-200 bg-card p-2.5 shadow-sm">
      <p className={cn(ERP_DENSE_LABEL_CLASS, "text-slate-600")}>
        סיכום מהיר
      </p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-foreground">
        <span>
          <span className="font-semibold tabular-nums">0</span>
          <span className="text-slate-600"> רשומות אחרונות</span>
        </span>
        <span className="text-slate-300">|</span>
        <span className="text-xs text-slate-600">
          תאורה, חשמל חזק, תקשורת, מיזוג — Holden / Marker Ofek
        </span>
      </div>
    </div>
  )

  const main = (
    <DenseDetailPanel className="border-slate-200 bg-card p-0 shadow-sm">
      <div className="border-b border-slate-200 bg-card px-2.5 py-2">
        <h2 className="text-start text-sm font-semibold text-foreground">
          הזמנות רכש אחרונות
        </h2>
        <p className="text-[11px] text-slate-600">
          מספר הזמנה · תאריך · פרויקט · ספק · סה״כ · סטטוס — לחיצה פותחת טיוטה
          לעריכה במנוע הזמנה
        </p>
      </div>
      <div className="w-full overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow className="h-9 border-slate-200 hover:bg-transparent">
              <TableHead className="min-w-[7rem] px-2 py-1.5 text-start text-[11px] font-semibold text-slate-700">
                מס&apos; הזמנה
              </TableHead>
              <TableHead className="min-w-[6.5rem] px-2 py-1.5 text-start text-[11px] font-semibold text-slate-700">
                תאריך
              </TableHead>
              <TableHead className="min-w-[9rem] px-2 py-1.5 text-start text-[11px] font-semibold text-slate-700">
                פרויקט
              </TableHead>
              <TableHead className="min-w-[10rem] px-2 py-1.5 text-start text-[11px] font-semibold text-slate-700">
                ספק
              </TableHead>
              <TableHead className="min-w-[7rem] px-2 py-1.5 text-start text-[11px] font-semibold text-slate-700">
                סה״כ
              </TableHead>
              <TableHead className="min-w-[6rem] px-2 py-1.5 text-start text-[11px] font-semibold text-slate-700">
                סטטוס
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-10 text-center text-sm text-slate-400"
              >
                אין הזמנות רכש להצגה.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </DenseDetailPanel>
  )

  return (
    <EntityWorkspace
      title="לוח רכש — חשמל ותשתיות"
      description="הזמנות רכש אחרונות (דמו). פרויקטים: רמת עיר היין (אשקלון), גינדי סביון, ריינבו שדה דב."
      className="bg-card text-foreground"
      headerActions={
        <>
          <Link
            href="/marker-ofek/command-center"
            className="inline-flex h-8 items-center rounded-md border border-slate-300 px-3 text-xs font-medium transition-colors hover:bg-slate-100"
          >
            <Package className="ms-1 size-3.5 text-slate-700" aria-hidden />
            מרכז הפיקוד
          </Link>
          <Link
            href="/marker-ofek/procurement/purchase-orders/new"
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-medium text-white",
              "transition-colors duration-200 hover:bg-slate-800"
            )}
          >
            <Plus className="size-3.5" aria-hidden />
            הזמנת רכש חדשה
          </Link>
        </>
      }
      sidebar={sidebar}
      main={main}
    />
  )
}
