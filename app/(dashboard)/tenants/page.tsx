import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { TenantsContent } from "./tenants-content"

export const dynamic = "force-dynamic"

function TenantsTableSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-3/4" />
    </div>
  )
}

export default function TenantsPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 text-start">
      <div className="space-y-1">
        <p className="max-w-2xl text-sm text-muted-foreground">
          רשימת כל הדיירים הרשומים במערכת: פרטי קשר, שיוך לבניין ודירה, וסטטוס
          חשבון.
        </p>
      </div>

      <Suspense fallback={<TenantsTableSkeleton />}>
        <TenantsContent />
      </Suspense>
    </div>
  )
}
