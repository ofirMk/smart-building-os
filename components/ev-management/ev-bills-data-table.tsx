"use client"

import * as React from "react"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { EvMonthlyBillWithSpot } from "@/lib/ev-management"

function formatPeriodMonthYear(periodStart: string): string {
  try {
    const [y, m] = periodStart.split("-").map(Number)
    if (!y || !m) return periodStart
    const d = new Date(Date.UTC(y, m - 1, 1))
    return new Intl.DateTimeFormat("he-IL", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(d)
  } catch {
    return periodStart
  }
}

function formatKwh(value: number): string {
  return new Intl.NumberFormat("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

function formatIls(value: number, currency: string): string {
  const code = currency === "ILS" || !currency ? "ILS" : currency
  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0)
  } catch {
    return `${Number.isFinite(value) ? value.toFixed(2) : "0.00"} ${code}`
  }
}

type EvBillsDataTableProps = {
  data: EvMonthlyBillWithSpot[]
}

export function EvBillsDataTable({ data }: EvBillsDataTableProps) {
  const columns = React.useMemo<ColumnDef<EvMonthlyBillWithSpot>[]>(
    () => [
      {
        accessorKey: "spot_label",
        header: "חניה",
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {row.original.spot_label}
          </span>
        ),
      },
      {
        accessorKey: "period_start",
        header: "תקופת חיוב",
        cell: ({ row }) => (
          <span className="text-foreground">
            {formatPeriodMonthYear(row.original.period_start)}
          </span>
        ),
      },
      {
        accessorKey: "kwh_total",
        header: 'סה״כ קוט״ש',
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">
            {formatKwh(row.original.kwh_total)}
          </span>
        ),
      },
      {
        accessorKey: "total_amount",
        header: 'סה״כ לתשלום',
        cell: ({ row }) => (
          <span className="tabular-nums font-medium text-foreground">
            {formatIls(row.original.total_amount, row.original.currency)}
          </span>
        ),
      },
    ],
    []
  )

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (data.length === 0) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 py-12 text-center">
        <p className="text-sm font-medium text-foreground">
          אין חיובים חודשיים להצגה
        </p>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          לאחר הנפקת חשבוניות חודשיות לפי מקומות חניה, יופיעו כאן תקופת החיוב,
          צריכת הקוט״ש והסכום לגבייה.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
      <Table>
        <TableHeader className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur-sm supports-[backdrop-filter]:bg-card/80">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="ps-4 text-start font-semibold first:ps-4 last:pe-4"
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="ps-4 last:pe-4">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
