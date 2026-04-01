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
import type { EvSessionWithSpot } from "@/lib/ev-management"

const TZ = "Asia/Jerusalem"

function formatStartEnd(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: TZ,
    }).format(new Date(iso))
  } catch {
    return "—"
  }
}

function formatKwh(value: number): string {
  return new Intl.NumberFormat("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

type EvSessionsDataTableProps = {
  data: EvSessionWithSpot[]
}

export function EvSessionsDataTable({ data }: EvSessionsDataTableProps) {
  const columns = React.useMemo<ColumnDef<EvSessionWithSpot>[]>(
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
        accessorKey: "started_at",
        header: "התחלה",
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">
            {formatStartEnd(row.original.started_at)}
          </span>
        ),
      },
      {
        accessorKey: "ended_at",
        header: "סיום",
        cell: ({ row }) => {
          const end = row.original.ended_at
          if (!end) {
            return (
              <span className="text-muted-foreground italic">בטעינה</span>
            )
          }
          return (
            <span className="tabular-nums text-foreground">
              {formatStartEnd(end)}
            </span>
          )
        },
      },
      {
        accessorKey: "kwh",
        header: "צריכה",
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">
            {formatKwh(row.original.kwh)} קוט״ש
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
          אין נתוני טעינה כרגע
        </p>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          כאשר יירשמו סשני טעינה במערכת, הם יוצגו בטבלה זו לפי מקום החניה וזמני
          ההתחלה והסיום.
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
