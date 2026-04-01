"use client"

import { MoreHorizontal, Pencil, UserX } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type TenantRowActionsProps = {
  tenantId: string
}

export function TenantRowActions({ tenantId }: TenantRowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground opacity-70 transition-opacity hover:opacity-100 group-hover:opacity-100"
            aria-label="תפריט פעולות"
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-44" dir="rtl">
        <DropdownMenuItem
          onClick={() =>
            toast.message("בקרוב", {
              description: `עריכת פרטי דייר (${tenantId.slice(0, 8)}…) תתווסף בגרסה הבאה.`,
            })
          }
        >
          <Pencil className="size-4" aria-hidden />
          ערוך פרטים
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={() =>
            toast.message("בקרוב", {
              description: "השעיית דייר תתווסף בגרסה הבאה.",
            })
          }
        >
          <UserX className="size-4" aria-hidden />
          השעה דייר
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
