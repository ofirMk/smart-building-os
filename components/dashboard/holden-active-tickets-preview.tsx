import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  TicketManagementTableRow,
  TicketStatusUi,
  TicketUrgency,
} from "@/types/tickets-management"

const URGENCY_LABEL: Record<TicketUrgency, string> = {
  high: "גבוהה",
  medium: "בינונית",
  low: "נמוכה",
}

const STATUS_LABEL: Record<TicketStatusUi, string> = {
  open: "פתוח",
  in_progress: "בטיפול",
  resolved: "טופל",
  closed: "סגור",
}

type HoldenActiveTicketsPreviewProps = {
  rows: TicketManagementTableRow[]
}

export function HoldenActiveTicketsPreview({
  rows,
}: HoldenActiveTicketsPreviewProps) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-lg">קריאות שירות פתוחות ובטיפול</CardTitle>
          <CardDescription>
            עד 12 קריאות אחרונות שאינן סגורות — עדכון בזמן אמת מהמסד
          </CardDescription>
        </div>
        <Link
          href="/tickets"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          כל הקריאות
        </Link>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            אין קריאות פתוחות או בטיפול להצגה
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-start">מזהה</TableHead>
                  <TableHead className="text-start">מיקום</TableHead>
                  <TableHead className="text-start">נושא</TableHead>
                  <TableHead className="text-start">דחיפות</TableHead>
                  <TableHead className="text-start">סטטוס</TableHead>
                  <TableHead className="text-start">נפתח</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.sourceId}>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {row.id}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {row.location}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      {row.categoryHe}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        {URGENCY_LABEL[row.urgency]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {STATUS_LABEL[row.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                      {row.openedAtLabel}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
