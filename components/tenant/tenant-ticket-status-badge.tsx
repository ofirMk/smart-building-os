import { Badge } from "@/components/ui/badge"
import type { TicketStatus } from "@/types/ticket"
import { cn } from "@/lib/utils"

export const TENANT_TICKET_STATUS_HE: Record<TicketStatus, string> = {
  open: "פתוח",
  in_progress: "בטיפול",
  resolved: "טופל",
  closed: "סגור",
}

export function tenantTicketStatusBadgeClass(status: TicketStatus): string {
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

type TenantTicketStatusBadgeProps = {
  status: TicketStatus
  className?: string
}

export function TenantTicketStatusBadge({
  status,
  className,
}: TenantTicketStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border px-2 py-0 text-[0.7rem] font-medium",
        tenantTicketStatusBadgeClass(status),
        className
      )}
    >
      {TENANT_TICKET_STATUS_HE[status]}
    </Badge>
  )
}
