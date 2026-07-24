import Link from "next/link"
import { Building2, Home, PlugZap, type LucideIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { BuildingListItem } from "@/types/building"
import { cn } from "@/lib/utils"

function formatCount(n: number): string {
  return n.toLocaleString("he-IL")
}

type BuildingsGridProps = {
  buildings: BuildingListItem[]
}

export function BuildingsGrid({ buildings }: BuildingsGridProps) {
  if (buildings.length === 0) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/15 px-6 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
          <Building2 className="size-7" aria-hidden />
        </div>
        <h2 className="mt-5 text-lg font-semibold text-foreground">
          אין בניינים בפורטפוליו
        </h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          כאשר יתווספו נכסים למערכת, הם יוצגו כאן כרטיסים עם כתובת מלאה, מספר
          דירות ועמדות טעינה.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {buildings.map((b) => {
        const aptCount = b.apartmentCount
        const spotCount = b.parkingSpotCount
        const line1 = String(b.address_line1 ?? "").trim()
        const city = String(b.city ?? "").trim()
        const addressMain = [line1, city].filter(Boolean).join(" · ")

        return (
          <Card
            key={b.id}
            className="overflow-hidden border-border/70 shadow-sm transition-shadow hover:shadow-md"
          >
            <Link href={`/buildings/${b.id}`} className="block">
              <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border/50 pb-4">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-start text-lg font-semibold leading-snug tracking-tight">
                    {b.name}
                  </CardTitle>
                </div>
                <div
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20"
                  aria-hidden
                >
                  <Building2 className="size-5" />
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                <p className="text-start text-sm leading-relaxed text-muted-foreground">
                  {addressMain}
                </p>
                {b.address_line2 ? (
                  <p className="mt-1 text-start text-xs text-muted-foreground/90">
                    {b.address_line2}
                  </p>
                ) : null}
                {b.region || b.postal_code ? (
                  <p className="mt-2 text-start text-xs text-muted-foreground">
                    {[b.region, b.postal_code].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </CardContent>
            </Link>
            <CardFooter className="flex flex-col gap-3 border-t bg-muted/35 p-4 sm:flex-row">
              <StatBlock
                icon={Home}
                label="סה״כ דירות"
                value={formatCount(aptCount)}
                className="border-emerald-500/15 bg-emerald-500/5"
                iconClassName="text-emerald-600 dark:text-emerald-400"
              />
              <StatBlock
                icon={PlugZap}
                label="עמדות טעינה"
                value={formatCount(spotCount)}
                className="border-primary/20 bg-primary/5"
                iconClassName="text-primary"
              />
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}

function StatBlock({
  icon: Icon,
  label,
  value,
  className,
  iconClassName,
}: {
  icon: LucideIcon
  label: string
  value: string
  className?: string
  iconClassName?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-1 items-center gap-3 rounded-xl border px-3 py-3",
        className
      )}
    >
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg bg-background/80 ring-1 ring-border/60",
          iconClassName
        )}
      >
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 text-start">
        <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-xl font-semibold tabular-nums tracking-tight text-foreground">
          {value}
        </p>
      </div>
    </div>
  )
}
