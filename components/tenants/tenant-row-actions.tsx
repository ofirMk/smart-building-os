"use client"

import { MoreHorizontal, Pencil, UserX, ExternalLink } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type TenantRowActionsProps = {
  tenantId: string
  tenantName: string | null
}

export function TenantRowActions({ tenantId, tenantName }: TenantRowActionsProps) {
  const displayName = tenantName ?? tenantId.slice(0, 8)

  function handleSuspend() {
    if (!confirm(`האם לבצע השעיה זמנית עבור ${displayName}?`)) return
    toast.promise(
      fetch(`/api/tenants/${tenantId}/suspend`, { method: "POST" })
        .then((r) => { if (!r.ok) throw new Error("שגיאה בשרת") }),
      {
        loading: "מבצע השעיה...",
        success: "הדייר הושעה זמנית. ניתן להחזיר גישה בכל עת.",
        error: "לא הצליח להשעות — פנה למנהל המערכת.",
      }
    )
  }

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
        <DropdownMenuItem render={<Link href={`/tenants/${tenantId}`} />}>
          <ExternalLink className="size-4" aria-hidden />
          פרופיל מלא
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={`/tenants/${tenantId}/edit`} />}>
          <Pencil className="size-4" aria-hidden />
          ערוך פרטים
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleSuspend}>
          <UserX className="size-4" aria-hidden />
          השעה זמנית
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
