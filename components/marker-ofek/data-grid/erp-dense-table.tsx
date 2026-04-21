"use client"

import * as React from "react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

/** Header cells sit on `ErpDenseHeaderRow` background — no second bg on th. */
const denseHead =
  "h-9 px-2 py-1.5 text-start text-[11px] font-semibold normal-case tracking-normal text-slate-700 [&:has([role=checkbox])]:pe-0"
const denseCell =
  "px-2 py-1.5 text-[13px] leading-snug text-foreground [&:has([role=checkbox])]:pe-0"
const interactiveRow =
  "cursor-pointer border-b border-slate-100 transition-colors hover:bg-background"

const staticRow =
  "border-b border-slate-100 hover:bg-transparent"

/** Dense ERP table — 13px body, compact header. Use inside `ErpDataCard`. */
export function ErpDenseTable({
  className,
  ...props
}: React.ComponentProps<typeof Table>) {
  return <Table className={cn("text-[13px]", className)} {...props} />
}

export function ErpDenseTableHeader(props: React.ComponentProps<typeof TableHeader>) {
  return <TableHeader {...props} />
}

/** Non-interactive header row — subtle slate strip, no hover flash. */
export function ErpDenseHeaderRow({
  className,
  ...props
}: React.ComponentProps<typeof TableRow>) {
  return (
    <TableRow
      className={cn(
        "border-b border-slate-200 bg-slate-100/50 hover:bg-slate-100/50",
        className
      )}
      {...props}
    />
  )
}

export function ErpDenseTableBody(props: React.ComponentProps<typeof TableBody>) {
  return <TableBody {...props} />
}

export function ErpDenseTableHead({
  className,
  ...props
}: React.ComponentProps<typeof TableHead>) {
  return <TableHead className={cn(denseHead, className)} {...props} />
}

export function ErpDenseTableRow({
  className,
  interactive = false,
  ...props
}: React.ComponentProps<typeof TableRow> & { interactive?: boolean }) {
  return (
    <TableRow
      className={cn(interactive ? interactiveRow : staticRow, className)}
      {...props}
    />
  )
}

export function ErpDenseTableCell({
  className,
  ...props
}: React.ComponentProps<typeof TableCell>) {
  return <TableCell className={cn(denseCell, className)} {...props} />
}
