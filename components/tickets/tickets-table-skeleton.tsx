import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function TicketsTableSkeleton() {
  return (
    <div className="rounded-xl border border-border/70 bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="min-w-[220px] text-start">נושא</TableHead>
            <TableHead className="w-[120px] text-start">עדיפות</TableHead>
            <TableHead className="w-[110px] text-start">סטטוס</TableHead>
            <TableHead className="w-[160px] text-start">יעד לטיפול</TableHead>
            <TableHead className="w-[52px] p-2 text-end">
              <span className="sr-only">פעולות</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, i) => (
            <TableRow key={i} className="hover:bg-transparent">
              <TableCell className="align-top">
                <div className="space-y-2 py-0.5">
                  <Skeleton className="h-4 w-[85%] max-w-[280px]" />
                  <Skeleton className="h-3 w-full max-w-[360px]" />
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-16 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-14 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell className="text-end">
                <Skeleton className="ms-auto size-8 rounded-md" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
