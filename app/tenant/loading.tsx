import { Skeleton } from "@/components/ui/skeleton"

export default function TenantLoading() {
  return (
    <div className="flex flex-col gap-6 text-start">
      <div className="space-y-3">
        <Skeleton className="h-8 w-4/5 max-w-sm rounded-lg bg-gray-800" />
        <Skeleton className="h-4 w-2/3 max-w-xs rounded bg-gray-800/80" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-28 rounded-2xl bg-gray-800" />
        <Skeleton className="h-28 rounded-2xl bg-gray-800" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-14 rounded-xl bg-gray-800" />
        <Skeleton className="h-14 rounded-xl bg-gray-800" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-28 rounded bg-gray-800/80" />
        <Skeleton className="h-32 w-full rounded-2xl bg-gray-800" />
        <Skeleton className="h-28 w-full rounded-2xl bg-gray-800" />
      </div>
    </div>
  )
}
