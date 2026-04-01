import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import type { TenantRecentTicket } from "@/lib/tenant-home"
import type { TicketStatus } from "@/types/ticket"
import { cn } from "@/lib/utils"

const STATUS_HE: Record<TicketStatus, string> = {
  open: "פתוח",
  in_progress: "בטיפול",
  resolved: "טופל",
  closed: "סגור",
}

function statusBadgeClass(status: TicketStatus): string {
  switch (status) {
    case "open":
      return "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
    case "in_progress":
      return "border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200"
    case "resolved":
      return "border-sky-500/35 bg-sky-500/10 text-sky-900 dark:text-sky-300"
    case "closed":
      return "border-border bg-muted/60 text-muted-foreground"
    default:
      return ""
  }
}

type TenantRecentActivityProps = {
  tickets: TenantRecentTicket[]
  error: string | null
}

export function TenantRecentActivity({
  tickets,
  error,
}: TenantRecentActivityProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">פעילות אחרונה</h2>
        <Link
          href="/tenant/tickets"
          className="text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          כל הקריאות
        </Link>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          לא ניתן לטעון קריאות: {error}
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">אין קריאות להצגה</p>
          <p className="mt-1 text-xs text-muted-foreground">
            כשתיפתחו קריאת שירות, היא תופיע כאן.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link
                href="/tenant/tickets"
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/50 px-3 py-3 text-start shadow-sm transition-colors hover:border-border hover:bg-card active:scale-[0.99]"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
                    {t.title}
                  </p>
                  <Badge
                    variant="outline"
                    className={cn(
                      "border px-2 py-0 text-[0.7rem] font-medium",
                      statusBadgeClass(t.status)
                    )}
                  >
                    {STATUS_HE[t.status]}
                  </Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
