"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, Eye } from "lucide-react"

import { setMirrorMode } from "@/lib/marker-ofek/mirror-mode-actions"
import type { ViewAsToken } from "@/lib/marker-ofek/mirror-mode-types"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

const OPTIONS: { value: ViewAsToken; label: string }[] = [
  { value: "global", label: "המראה שלי (גלובלי)" },
  { value: "guy", label: "גיא" },
  { value: "samer", label: "סאמר" },
  { value: "site_manager", label: "מנהל אתר" },
]

export function MirrorModeSelector({ currentViewAs }: { currentViewAs: ViewAsToken }) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  const activeLabel =
    OPTIONS.find((o) => o.value === currentViewAs)?.label ?? "המראה שלי (גלובלי)"

  async function select(value: ViewAsToken) {
    if (value === currentViewAs) return
    setPending(true)
    const res = await setMirrorMode(value)
    setPending(false)
    if (res.ok) router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-md border border-indigo-200 bg-white px-2.5 text-xs font-medium text-indigo-900 shadow-sm outline-none transition hover:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-indigo-500/30 disabled:opacity-60",
          currentViewAs !== "global" && "border-indigo-400 bg-indigo-50"
        )}
        aria-label="מצב צפייה כשותף"
        disabled={pending}
      >
        <Eye className="size-3.5 shrink-0 text-indigo-600" aria-hidden />
        <span className="hidden max-w-[10rem] truncate sm:inline">{activeLabel}</span>
        <span className="sm:hidden">מראה</span>
        <ChevronDown className="size-3 opacity-70" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          צפייה כ…
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o.value}
            onClick={() => void select(o.value)}
            className={cn(
              "text-sm",
              o.value === currentViewAs && "bg-indigo-50 font-medium text-indigo-900"
            )}
          >
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
