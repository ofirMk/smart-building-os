import Link from "next/link"
import { PlugZap } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatKwhHe } from "@/lib/dashboard-stats"

type EvLiveChargersWidgetProps = {
  evReadySpots: number
  activeChargingSessions: number
  monthKwh: number
  error: string | null
}

export function EvLiveChargersWidget({
  evReadySpots,
  activeChargingSessions,
  monthKwh,
  error,
}: EvLiveChargersWidgetProps) {
  const idleApprox = Math.max(0, evReadySpots - activeChargingSessions)

  return (
    <Card className="h-full border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-transparent shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <PlugZap
                className="size-5 text-violet-600 dark:text-violet-400"
                aria-hidden
              />
              עמדות טעינה (חי)
            </CardTitle>
            <CardDescription>
              עמדות EV-ready מול סשנים פעילים (ללא סיום) — מתעדכן מהמסד
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="text-sm text-destructive">
            לא ניתן לטעון סטטוס: {error}
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-border/60 bg-card/80 px-3 py-2">
                <dt className="text-muted-foreground">עמדות EV</dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {evReadySpots}
                </dd>
              </div>
              <div className="rounded-lg border border-border/60 bg-card/80 px-3 py-2">
                <dt className="text-muted-foreground">בטעינה כעת</dt>
                <dd className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {activeChargingSessions}
                </dd>
              </div>
              <div className="col-span-2 rounded-lg border border-border/60 bg-card/80 px-3 py-2">
                <dt className="text-muted-foreground">ככל הנראה פנויות</dt>
                <dd className="text-lg font-medium tabular-nums">
                  {idleApprox}
                </dd>
              </div>
              <div className="col-span-2 rounded-lg border border-border/60 bg-card/80 px-3 py-2">
                <dt className="text-muted-foreground">צריכה מצטברת החודש</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {formatKwhHe(monthKwh)}
                </dd>
              </div>
            </dl>
            <Link
              href="/ev-management"
              className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              ניהול מלא — עמדות, דיירים ומונה
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  )
}
