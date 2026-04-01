import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function EvManagementSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Skeleton className="h-8 w-40 rounded-lg" />
        <Skeleton className="h-8 w-40 rounded-lg" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="ps-4 text-start">
                <Skeleton className="h-4 w-16" />
              </TableHead>
              <TableHead className="text-start">
                <Skeleton className="h-4 w-20" />
              </TableHead>
              <TableHead className="text-start">
                <Skeleton className="h-4 w-16" />
              </TableHead>
              <TableHead className="pe-4 text-start">
                <Skeleton className="h-4 w-14" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i} className="hover:bg-transparent">
                <TableCell className="ps-4">
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-36" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-36" />
                </TableCell>
                <TableCell className="pe-4">
                  <Skeleton className="h-4 w-16" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
