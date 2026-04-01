"use client"

import * as React from "react"
import { AlertTriangle, Info } from "lucide-react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import type { AnnouncementRow, AnnouncementUrgency } from "@/lib/announcements"
import { cn } from "@/lib/utils"

function urgencyToVariant(
  u: AnnouncementUrgency
): "info" | "warning" | "destructive" {
  switch (u) {
    case "critical":
      return "destructive"
    case "warning":
      return "warning"
    default:
      return "info"
  }
}

function UrgencyIcon({ urgency }: { urgency: AnnouncementUrgency }) {
  const className = "size-4 shrink-0"
  if (urgency === "critical" || urgency === "warning") {
    return <AlertTriangle className={className} aria-hidden />
  }
  return <Info className={className} aria-hidden />
}

export function AnnouncementsBanner() {
  const [items, setItems] = React.useState<AnnouncementRow[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase
          .from("announcements")
          .select("id, title, content, urgency, is_active, created_at, updated_at")
          .eq("is_active", true)
          .order("created_at", { ascending: false })

        if (cancelled) return
        if (error) {
          setLoadError(error.message)
          setItems([])
          return
        }
        setItems((data ?? []) as AnnouncementRow[])
        setLoadError(null)
      } catch (e) {
        if (cancelled) return
        setLoadError(e instanceof Error ? e.message : "שגיאה בטעינה")
        setItems([])
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  if (items === null) {
    return (
      <div
        className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-3 py-3 text-center text-xs text-muted-foreground"
        aria-hidden
      >
        טוען הודעות…
      </div>
    )
  }

  if (loadError) {
    return null
  }

  if (items.length === 0) {
    return null
  }

  return (
    <div
      className="flex flex-col gap-3"
      dir="rtl"
      role="region"
      aria-label="הודעות ועדכונים לדיירים"
    >
      {items.map((a) => {
        const variant = urgencyToVariant(a.urgency)
        return (
          <Alert
            key={a.id}
            variant={variant}
            className={cn(
              "text-start shadow-sm",
              variant === "warning" && "border-amber-500/50",
              variant === "info" && "border-sky-500/45"
            )}
          >
            <UrgencyIcon urgency={a.urgency} />
            <AlertTitle>{a.title}</AlertTitle>
            <AlertDescription className="whitespace-pre-wrap text-foreground/90">
              {a.content}
            </AlertDescription>
          </Alert>
        )
      })}
    </div>
  )
}
