import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { TenantAmenitiesView } from "@/components/tenant/tenant-amenities-view"
import { buttonVariants } from "@/components/ui/button-variants"
import { getTenantAmenities } from "@/lib/tenant-amenities"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "מתקנים",
}

export default async function TenantAmenitiesPage() {
  const { data: amenities, error } = await getTenantAmenities()

  return (
    <div className="flex flex-col gap-6 pb-2 text-start">
      <div className="flex flex-col gap-3">
        <Link
          href="/tenant"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ms-2 h-9 w-fit gap-1 px-2 text-muted-foreground hover:text-foreground"
          )}
        >
          <ChevronRight className="size-4 rotate-180" aria-hidden />
          חזרה לראשי
        </Link>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">הזמנת מתקנים</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            בחרו מתקן, משבצת זמן ומספר משתתפים — לאחר האישור ההזמנה תירשם במערכת.
          </p>
        </div>
      </div>

      <TenantAmenitiesView amenities={amenities} error={error} />
    </div>
  )
}
