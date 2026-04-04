"use client"

import { TicketRowActions } from "@/components/tickets/ticket-row-actions"
import { TicketVendorSelect } from "@/components/tickets/ticket-vendor-select"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { TicketPriority, TicketRow, TicketStatus } from "@/types/ticket"
import type { VendorRow } from "@/types/vendor"

const STATUS_HE: Record<TicketStatus, string> = {
  open: "פתוח",
  in_progress: "בטיפול",
  resolved: "טופל",
  closed: "סגור",
}

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  P1: "קריטי",
  P2: "גבוה",
  P3: "שגרתי",
  P4: "תכנון",
}

function priorityBadgeClass(priority: TicketPriority): string {
  switch (priority) {
    case "P1":
      return "border-red-500/30 bg-red-500/15 text-red-700 dark:border-red-500/40 dark:bg-red-500/20 dark:text-red-300"
    case "P2":
      return "border-orange-500/35 bg-orange-500/15 text-orange-800 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-300"
    case "P3":
      return "border-sky-500/35 bg-sky-500/15 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-300"
    case "P4":
      return "border-muted-foreground/25 bg-muted/80 text-muted-foreground"
    default:
      return ""
  }
}

function statusBadgeClass(status: TicketStatus): string {
  switch (status) {
    case "open":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
    case "in_progress":
      return "border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200"
    case "resolved":
      return "border-sky-500/35 bg-sky-500/10 text-sky-900 dark:text-sky-300"
    case "closed":
      return "border-border bg-muted/60 text-muted-foreground"
    default:
      return ""
  }
}

function formatSlaDue(iso: string | null): string {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jerusalem",
    }).format(d)
  } catch {
    return "—"
  }
}

type TicketsDataTableProps = {
  tickets: TicketRow[]
  vendors: VendorRow[]
  vendorsError?: string | null
}

export function TicketsDataTable({
  tickets,
  vendors,
  vendorsError,
}: TicketsDataTableProps) {
  if (tickets.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 py-12 text-center">
        <p className="text-sm font-medium text-foreground">אין קריאות להצגה</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          כאשר יתווספו קריאות שירות במערכת, הן יופיעו בטבלה זו.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
      <Table>
        <TableHeader className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur-sm supports-[backdrop-filter]:bg-card/80">
          <TableRow className="hover:bg-transparent">
            <TableHead className="min-w-[220px] ps-4 text-start font-semibold">
              נושא
            </TableHead>
            <TableHead className="w-[120px] text-start font-semibold">
              עדיפות
            </TableHead>
            <TableHead className="w-[120px] text-start font-semibold">
              סטטוס
            </TableHead>
            <TableHead className="w-[170px] text-start font-semibold">
              יעד לטיפול (SLA)
            </TableHead>
            <TableHead className="min-w-[180px] text-start font-semibold">
              חברה
            </TableHead>
            <TableHead className="w-[52px] p-2 pe-4 text-end">
              <span className="sr-only">פעולות</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket) => (
            <TableRow key={ticket.id} className="group">
              <TableCell className="max-w-[min(420px,40vw)] align-top ps-4">
                <div className="space-y-1 py-0.5">
                  <p className="font-semibold leading-snug text-foreground">
                    {ticket.title}
                  </p>
                  {ticket.description ? (
                    <p
                      className="line-clamp-2 text-xs leading-relaxed text-muted-foreground"
                      title={ticket.description}
                    >
                      {ticket.description}
                    </p>
                  ) : (
                    <p className="text-xs italic text-muted-foreground/70">
                      ללא תיאור
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell className="align-middle">
                <Badge
                  variant="outline"
                  className={cn(
                    "font-medium border px-2 py-0.5",
                    priorityBadgeClass(ticket.priority)
                  )}
                >
                  {ticket.priority} · {PRIORITY_LABEL[ticket.priority]}
                </Badge>
              </TableCell>
              <TableCell className="align-middle">
                <Badge
                  variant="outline"
                  className={cn(
                    "font-medium border px-2 py-0.5",
                    statusBadgeClass(ticket.status)
                  )}
                >
                  {STATUS_HE[ticket.status]}
                </Badge>
              </TableCell>
              <TableCell className="align-middle tabular-nums text-sm text-foreground">
                {formatSlaDue(ticket.sla_due_at)}
              </TableCell>
              <TableCell className="align-middle">
                {vendorsError ? (
                  <span
                    className="text-xs text-muted-foreground"
                    title={vendorsError}
                  >
                    לא זמין
                  </span>
                ) : (
                  <TicketVendorSelect
                    ticketId={ticket.id}
                    vendorId={ticket.vendor_id ?? null}
                    vendors={vendors}
                  />
                )}
              </TableCell>
              <TableCell className="align-middle pe-4 text-end">
                <TicketRowActions
                  ticketId={ticket.id}
                  currentStatus={ticket.status}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
