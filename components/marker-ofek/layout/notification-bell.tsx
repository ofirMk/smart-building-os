"use client"

import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Bell, PieChart, ShieldAlert, Truck } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  MOCK_NOTIFICATIONS,
  type Notification,
  type NotificationType,
  countUnreadNotifications,
} from "@/lib/marker-ofek/notification-schema"
import { cn } from "@/lib/utils"

function typeLabel(t: NotificationType): string {
  switch (t) {
    case "QA":
      return "ליקויים"
    case "BUDGET":
      return "תקציב"
    case "LOGISTICS":
      return "לוגיסטיקה"
    default:
      return t
  }
}

function TypeIcon({ type, className }: { type: NotificationType; className?: string }) {
  const c = cn("size-3.5 shrink-0", className)
  switch (type) {
    case "QA":
      return <ShieldAlert className={c} aria-hidden />
    case "BUDGET":
      return <PieChart className={c} aria-hidden />
    case "LOGISTICS":
      return <Truck className={c} aria-hidden />
    default:
      return null
  }
}

function formatNotificationTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(d)
  } catch {
    return iso
  }
}

function NotificationDropdownPanel({
  open,
  align = "end",
  children,
}: {
  open: boolean
  align?: "end" | "start"
  children: React.ReactNode
}) {
  const reduce = useReducedMotion()
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? undefined : { opacity: 0, y: -4, scale: 0.99 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "absolute top-[calc(100%+6px)] z-[60] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/[0.04]",
            align === "end" ? "end-0" : "start-0"
          )}
          dir="rtl"
          lang="he"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

/**
 * פעמון התראות — מרכז התראות גלובלי (QA / תקציב / לוגיסטיקה), תקן Jimmy: RTL, צפיפות.
 */
export function NotificationBell({
  className,
  onOpenChange,
}: {
  className?: string
  /** נקרא כשהמגירה נפתחת/נסגרת — לסגירת תפריט פרופיל ב־TopNavBar */
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [items, setItems] = React.useState<Notification[]>(() => [...MOCK_NOTIFICATIONS])

  const setOpenNotify = React.useCallback(
    (next: boolean) => {
      setOpen(next)
      onOpenChange?.(next)
    },
    [onOpenChange]
  )
  const rootRef = React.useRef<HTMLDivElement>(null)

  const unread = countUnreadNotifications(items)

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (rootRef.current && !rootRef.current.contains(t)) setOpenNotify(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [setOpenNotify])

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenNotify(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [setOpenNotify])

  function markRead(id: string) {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    )
  }

  return (
    <div className={cn("relative", className)} ref={rootRef}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="relative size-9 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        aria-label="מרכז התראות"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((o) => {
            const next = !o
            onOpenChange?.(next)
            return next
          })
        }}
      >
        <Bell className="size-[18px]" aria-hidden />
        {unread > 0 ? (
          <span
            className="absolute -end-0.5 -top-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white shadow-sm"
            aria-hidden
          >
            {unread > 9 ? "9+" : String(unread)}
          </span>
        ) : null}
      </Button>

      <NotificationDropdownPanel open={open} align="end">
        <div className="border-b border-slate-100 px-3 py-2.5">
          <p className="text-sm font-semibold text-slate-900">מרכז התראות</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {unread > 0 ? `${unread} שלא נקראו` : "הכל נקרא"}
          </p>
        </div>
        <ul
          className="max-h-[min(50vh,18rem)] divide-y divide-slate-100 overflow-y-auto p-1"
          role="list"
        >
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => markRead(n.id)}
                className={cn(
                  "flex w-full flex-col gap-1 rounded-lg px-2.5 py-2.5 text-start transition-colors",
                  n.isRead
                    ? "bg-white hover:bg-slate-50/80"
                    : "bg-sky-50/90 hover:bg-sky-100/90"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      n.type === "QA" &&
                        "bg-amber-100 text-amber-900",
                      n.type === "BUDGET" &&
                        "bg-violet-100 text-violet-900",
                      n.type === "LOGISTICS" &&
                        "bg-emerald-100 text-emerald-900"
                    )}
                  >
                    <TypeIcon type={n.type} className="size-3" />
                    {typeLabel(n.type)}
                  </span>
                  <time
                    className="shrink-0 text-[10px] tabular-nums text-slate-500"
                    dateTime={n.timestamp}
                  >
                    {formatNotificationTime(n.timestamp)}
                  </time>
                </div>
                <span
                  className={cn(
                    "text-[13px] leading-snug",
                    n.isRead ? "text-slate-600" : "font-medium text-slate-900"
                  )}
                >
                  {n.message}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </NotificationDropdownPanel>
    </div>
  )
}
