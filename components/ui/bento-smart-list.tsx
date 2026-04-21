"use client"

import * as React from "react"
import { FileDown, FileSpreadsheet, Loader2, Rows2, Rows3 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type Density = "compact" | "comfortable"

export type BentoSmartListColumn<TItem> = {
  key: string
  title: string
  className?: string
  render: (item: TItem) => React.ReactNode
}

type BentoSmartListProps<TItem> = {
  items: TItem[]
  columns: BentoSmartListColumn<TItem>[]
  rowKey: (item: TItem) => string
  density?: Density
  emptyState?: React.ReactNode
  onRowClick?: (item: TItem) => void
  selectedRowKey?: string | null
  rowActions?: (item: TItem) => React.ReactNode
}

export function BentoSmartList<TItem>({
  items,
  columns,
  rowKey,
  density = "compact",
  emptyState,
  onRowClick,
  selectedRowKey,
  rowActions,
}: BentoSmartListProps<TItem>) {
  const denseCellClass = density === "compact" ? "py-1.5 text-xs" : "py-2 text-sm"
  const denseHeadClass = density === "compact" ? "h-8 text-[10px]" : "h-10 text-xs"

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <Table>
        <TableHeader>
          <TableRow className="bg-background hover:bg-background">
            {columns.map((column) => (
              <TableHead key={column.key} className={cn("text-right", denseHeadClass, column.className)}>
                {column.title}
              </TableHead>
            ))}
            {rowActions ? <TableHead className={cn("text-right", denseHeadClass)}>פעולות</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length + (rowActions ? 1 : 0)}
                className="h-20 text-center text-xs text-slate-500"
              >
                {emptyState ?? "אין נתונים להצגה"}
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => {
              const key = rowKey(item)
              const selected = selectedRowKey === key
              return (
                <TableRow
                  key={key}
                  onClick={() => onRowClick?.(item)}
                  className={cn(
                    "group/list-row transition-colors",
                    onRowClick && "cursor-pointer",
                    selected ? "bg-emerald-50/60 hover:bg-emerald-50/70" : "hover:bg-muted/70"
                  )}
                >
                  {columns.map((column) => (
                    <TableCell key={column.key} className={cn(denseCellClass, column.className)}>
                      {column.render(item)}
                    </TableCell>
                  ))}
                  {rowActions ? (
                    <TableCell className={cn("opacity-0 transition-opacity group-hover/list-row:opacity-100", denseCellClass)}>
                      {rowActions(item)}
                    </TableCell>
                  ) : null}
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}

/**
 * Stateless density toggle for any workspace that renders `BentoSmartList`.
 *
 *   const [density, setDensity] = React.useState<Density>("compact")
 *   <SmartListDensityToggle density={density} onChange={setDensity} />
 */
export function SmartListDensityToggle({
  density,
  onChange,
  className,
}: {
  density: Density
  onChange: (next: Density) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-card p-0.5 shadow-[0_1px_0_rgba(15,23,42,0.04)]",
        className
      )}
      role="group"
      aria-label="Density"
    >
      <button
        type="button"
        onClick={() => onChange("compact")}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors",
          density === "compact" ? "bg-muted text-foreground" : "hover:bg-muted"
        )}
        aria-pressed={density === "compact"}
        aria-label="תצוגה צפופה"
      >
        <Rows3 className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onChange("comfortable")}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors",
          density === "comfortable" ? "bg-muted text-foreground" : "hover:bg-muted"
        )}
        aria-pressed={density === "comfortable"}
        aria-label="תצוגה מרווחת"
      >
        <Rows2 className="size-3.5" />
      </button>
    </div>
  )
}

/**
 * Hover-reveal row action cluster for Excel / PDF exports. Pass as
 * `rowActions={(item) => <SmartListExportActions ... />}` on BentoSmartList.
 */
export function SmartListExportActions({
  onExcel,
  onPdf,
  working,
}: {
  onExcel?: () => void | Promise<void>
  onPdf?: () => void | Promise<void>
  working?: boolean
}) {
  return (
    <div className="inline-flex items-center gap-0.5">
      {onExcel ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={working}
          onClick={(event) => {
            event.stopPropagation()
            void onExcel()
          }}
          className="h-7 w-7 p-0 text-slate-500 hover:text-emerald-700"
          aria-label="יצוא ל-Excel"
        >
          {working ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FileSpreadsheet className="size-3.5" />
          )}
        </Button>
      ) : null}
      {onPdf ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={working}
          onClick={(event) => {
            event.stopPropagation()
            void onPdf()
          }}
          className="h-7 w-7 p-0 text-slate-500 hover:text-rose-700"
          aria-label="יצוא ל-PDF"
        >
          {working ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FileDown className="size-3.5" />
          )}
        </Button>
      ) : null}
    </div>
  )
}

export function SmartListStatusPill({
  tone,
  children,
}: {
  tone: "neutral" | "success" | "warning" | "danger" | "info"
  children: React.ReactNode
}) {
  const className =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : tone === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : tone === "info"
      ? "border-blue-200 bg-blue-50 text-blue-800"
      : "border-slate-200 bg-background text-slate-700"

  return (
    <Badge variant="outline" className={cn("rounded-md text-[10px]", className)}>
      {children}
    </Badge>
  )
}
