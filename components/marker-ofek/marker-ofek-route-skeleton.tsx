import { Skeleton } from "@/components/ui/skeleton"

/** Instant shell while a Marker Ofek route segment loads (pairs with `loading.tsx`). */
export function MarkerOfekRouteSkeleton() {
  return (
    <div
      dir="rtl"
      className="flex min-h-[50vh] flex-1 flex-col gap-6 pb-10"
      aria-busy
      aria-label="טוען…"
    >
      <div className="space-y-3 rounded-2xl border border-border/60 bg-card/60 p-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-3/4 max-w-md" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="space-y-2 rounded-xl border border-border/50 p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  )
}
