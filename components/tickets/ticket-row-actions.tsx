"use client"

import { useState, useTransition } from "react"
import { Loader2, MoreHorizontal } from "lucide-react"

import { updateTicketStatus } from "@/app/(dashboard)/tickets/actions"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import type { TicketStatus } from "@/types/ticket"

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "open", label: "פתוח" },
  { value: "in_progress", label: "בטיפול" },
  { value: "resolved", label: "טופל" },
  { value: "closed", label: "סגור" },
]

type TicketRowActionsProps = {
  ticketId: string
  currentStatus: TicketStatus
}

export function TicketRowActions({
  ticketId,
  currentStatus,
}: TicketRowActionsProps) {
  const [isPending, startTransition] = useTransition()
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const { success, error } = useToast()

  const busy = isPending && updatingId === ticketId

  function handleStatusSelect(next: TicketStatus) {
    if (next === currentStatus) return

    startTransition(() => {
      void (async () => {
        setUpdatingId(ticketId)
        try {
          const result = await updateTicketStatus(ticketId, next)
          if (result.ok) {
            success("סטטוס הקריאה עודכן בהצלחה")
          } else {
            error(result.error || "עדכון הסטטוס נכשל")
          }
        } finally {
          setUpdatingId(null)
        }
      })()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            className="text-muted-foreground opacity-70 transition-opacity hover:opacity-100 group-hover:opacity-100 disabled:opacity-40"
            aria-label="פתיחת תפריט פעולות"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <MoreHorizontal className="size-4" />
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>עדכון סטטוס</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40">
            {STATUS_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                disabled={busy || opt.value === currentStatus}
                onClick={() => handleStatusSelect(opt.value)}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span>{opt.label}</span>
                  {opt.value === currentStatus ? (
                    <span className="text-xs text-muted-foreground">(נוכחי)</span>
                  ) : null}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
