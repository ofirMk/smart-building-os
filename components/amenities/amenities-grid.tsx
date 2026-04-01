import { Building2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { AmenityRecord } from "@/lib/amenities-management"
import { cn } from "@/lib/utils"

function amenityCategoryHe(type: string): string {
  switch (type) {
    case "gym":
      return "חדר כושר"
    case "clubhouse":
      return "מתחם משותף"
    default:
      return type || "מתקן"
  }
}

type AmenitiesGridProps = {
  amenities: AmenityRecord[]
}

export function AmenitiesGrid({ amenities }: AmenitiesGridProps) {
  if (amenities.length === 0) {
    return (
      <div className="flex min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 py-10 text-center">
        <Building2 className="mb-3 size-10 text-muted-foreground/60" />
        <p className="text-sm font-medium text-foreground">
          אין מתקנים לרישום במערכת
        </p>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          לאחר הגדרת מתקנים (חדר כושר, מתחם משותף וכו׳) בבניינים, הם יוצגו כאן.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {amenities.map((a) => (
        <Card
          key={a.id}
          className="border-border/70 shadow-sm transition-shadow hover:shadow-md"
        >
          <CardHeader className="border-b border-border/50 pb-3">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base leading-snug">{a.name}</CardTitle>
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 font-medium",
                  a.is_active
                    ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-300"
                    : "border-muted-foreground/30 bg-muted/70 text-muted-foreground"
                )}
              >
                {a.is_active ? "פעיל" : "לא פעיל"}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              {amenityCategoryHe(a.type)}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-sm text-foreground">
              <span className="text-muted-foreground">קיבולת למשבצת: </span>
              <span className="font-medium tabular-nums">
                {a.capacity_per_slot}
              </span>
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
