import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"

export function BuildingsGridSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card
          key={i}
          className="overflow-hidden border-border/70 shadow-sm"
        >
          <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border/50 pb-4">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-[85%] max-w-[240px]" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="size-11 shrink-0 rounded-xl" />
          </CardHeader>
          <CardContent className="space-y-2 pt-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
          <CardFooter className="flex gap-3 border-t bg-muted/40">
            <Skeleton className="h-16 flex-1 rounded-lg" />
            <Skeleton className="h-16 flex-1 rounded-lg" />
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
