import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function AmenitiesPageSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2 border-b border-border/50 pb-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 border-t border-border/60 pt-10">
        <Skeleton className="h-6 w-56" />
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="ps-4 text-start">
                  <Skeleton className="h-4 w-16" />
                </TableHead>
                <TableHead className="text-start">
                  <Skeleton className="h-4 w-28" />
                </TableHead>
                <TableHead className="text-start">
                  <Skeleton className="h-4 w-28" />
                </TableHead>
                <TableHead className="text-start">
                  <Skeleton className="h-4 w-20" />
                </TableHead>
                <TableHead className="pe-4 text-start">
                  <Skeleton className="h-4 w-32" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  <TableCell className="ps-4">
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-8" />
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
    </div>
  )
}
