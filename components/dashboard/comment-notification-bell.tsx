"use client"

import * as React from "react"
import { Bell } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn } from "@/lib/utils"

type ProjectEmbed = { name: string; internal_project_code: string }
type ProfileEmbed = { full_name: string | null; email: string | null }

type FeedRow = {
  id: string
  message: string
  created_at: string
  context_label: string | null
  context_type: string
  profiles: ProfileEmbed | ProfileEmbed[] | null
  projects: ProjectEmbed | ProjectEmbed[] | null
}

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

function authorName(p: ProfileEmbed | null): string {
  if (!p) return "חבר צוות"
  const n = p.full_name?.trim()
  if (n) return n
  const e = p.email?.trim()
  if (e) return e.split("@")[0] ?? e
  return "חבר צוות"
}

function contextPhrase(label: string | null, type: string): string {
  if (label?.trim()) return label.trim()
  if (type === "po_line") return "שורת רכש"
  if (type === "contract_item") return "סעיף בחוזה"
  return "הערה כללית"
}

export function CommentNotificationBell({ className }: { className?: string }) {
  const [items, setItems] = React.useState<FeedRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [open, setOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (!uid) {
        setItems([])
        return
      }
      const { data, error } = await supabase
        .from("project_comments")
        .select(
          `
          id,
          message,
          created_at,
          context_label,
          context_type,
          user_id,
          profiles ( full_name, email ),
          projects ( name, internal_project_code )
        `
        )
        .neq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(5)

      if (error) {
        if (!/relation|does not exist|schema cache/i.test(error.message)) {
          console.warn("[CommentNotificationBell]", error.message)
        }
        setItems([])
        return
      }
      setItems((data as FeedRow[]) ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  React.useEffect(() => {
    function onGlobal() {
      void load()
    }
    window.addEventListener("mo-project-comments-changed", onGlobal)
    return () =>
      window.removeEventListener("mo-project-comments-changed", onGlobal)
  }, [load])

  React.useEffect(() => {
    if (open) void load()
  }, [open, load])

  const hasAny = items.length > 0

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className={cn(
          "relative inline-flex size-9 shrink-0 items-center justify-center rounded-md outline-none",
          "text-muted-foreground hover:bg-muted hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
        aria-label="הערות אחרונות מהצוות"
      >
        <Bell className="size-[1.15rem]" aria-hidden />
        {hasAny ? (
          <span className="absolute end-1 top-1 size-2 rounded-full bg-sky-500 ring-2 ring-background" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(100vw-2rem,22rem)] p-0"
        dir="rtl"
      >
        <DropdownMenuLabel className="px-3 py-2 text-sm font-semibold">
          הערות אחרונות (מחברי צוות)
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loading ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            טוען…
          </p>
        ) : items.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            אין הערות חדשות מאחרים.
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1">
            {items.map((row) => {
              const proj = embedOne(row.projects)
              const prof = embedOne(row.profiles)
              const pname =
                proj?.name?.trim() ||
                proj?.internal_project_code ||
                "פרויקט"
              const summary = `${authorName(prof)} הוסיף הערה על ${contextPhrase(row.context_label, row.context_type)} ב־${pname}`
              return (
                <li
                  key={row.id}
                  className="border-b border-border/40 px-3 py-2.5 last:border-0"
                >
                  <span className="text-xs font-medium leading-snug text-foreground">
                    {summary}
                  </span>
                  <span className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                    &quot;{row.message}&quot;
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
