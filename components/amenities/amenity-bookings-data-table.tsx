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
import type { AmenityBookingWithName } from "@/lib/amenities-management"

const TZ = "Asia/Jerusalem"

function formatDateTime(iso: string): string {
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

type AmenityBookingsDataTableProps = {
  data: AmenityBookingWithName[]
}

export function AmenityBookingsDataTable({ data }: AmenityBookingsDataTableProps) {
  const columns = React.useMemo<ColumnDef<AmenityBookingWithName>[]>(
    () => [
      {
        accessorKey: "amenity_name",
        header: "מתקן",
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {row.original.amenity_name}
          </span>
        ),
      },
      {
        accessorKey: "starts_at",
        header: "תאריך ושעת התחלה",
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">
            {formatDateTime(row.original.starts_at)}
          </span>
        ),
      },
      {
        accessorKey: "ends_at",
        header: "תאריך ושעת סיום",
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">
            {formatDateTime(row.original.ends_at)}
          </span>
        ),
      },
      {
        accessorKey: "party_size",
        header: "מספר משתתפים",
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">
            {row.original.party_size}
          </span>
        ),
      },
      {
        accessorKey: "health_declaration_version",
        header: "גרסת הצהרת בריאות",
        cell: ({ row }) => {
          const v = row.original.health_declaration_version
          if (!v?.trim()) {
            return (
              <span className="text-muted-foreground italic">לא הוגדר</span>
            )
          }
          return (
            <span className="font-mono text-sm text-foreground">{v}</span>
          )
        },
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
          אין הזמנות מתקנים להצגה
        </p>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          הזמנות שאושרו או שמתוכננות לעתיד יופיעו כאן, ממוינות לפי מועד ההתחלה.
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
                  className="min-w-[120px] ps-4 text-start font-semibold first:ps-4 last:pe-4"
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
