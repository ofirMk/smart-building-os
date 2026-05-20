"use client"

/**
 * Sprint T16 — Global Command Palette (Ctrl/Cmd + K).
 *
 * A SaaS-grade quick-launcher inspired by Linear / Vercel / Notion.
 * Architecture:
 *
 *   <CommandPaletteProvider>          ← React context: { open, setOpen, toggle }
 *     <DashboardShell ...>            ← anything inside (incl. top-navigation)
 *       <CommandPaletteSearchTrigger /> ← fake "search bar" button in top nav
 *     </DashboardShell>
 *     <CommandPaletteDialog />        ← fixed-position modal w/ backdrop-blur
 *   </CommandPaletteProvider>
 *
 * The provider also installs a single global `keydown` listener for ⌘/Ctrl+K
 * (and Esc to close). The list of commands lives in this file as a single
 * source of truth so we never drift between the palette and the top nav.
 */

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  Command as CommandIcon,
  CornerDownLeft,
  Folder,
  LayoutDashboard,
  PieChart,
  Search,
  Smartphone,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Command catalogue — single source of truth
// ---------------------------------------------------------------------------

interface CommandEntry {
  id: string
  label: string
  description?: string
  href: string
  /** Extra search keywords (Hebrew + English) for fuzzy matching. */
  keywords?: string[]
  icon: React.ComponentType<{ className?: string }>
}

interface CommandSection {
  title: string
  items: CommandEntry[]
}

// Canonical demo project / token used by Sprint T13–T15.
const DEMO_PROJECT_ID = "123e4567-e89b-12d3-a456-426614174000"
const DEMO_VENDOR_TOKEN = "123e4567-e89b-12d3-a456-426614174000"

const COMMAND_SECTIONS: CommandSection[] = [
  {
    title: "הנהלה ו-AI",
    items: [
      {
        id: "holden",
        label: "הולדן (Holden AI) ✨",
        description: "Copilot חכם של המערכת — שאל שאלה וקבל תובנה מיידית",
        href: "/marker-ofek/holden",
        icon: Sparkles,
        keywords: ["holden", "ai", "copilot", "צ׳אט", "סייען"],
      },
      {
        id: "portfolio",
        label: 'קוקפיט מנכ״ל (Portfolio)',
        description: "סקירת כלל הפרויקטים, חריגות, ויעדים",
        href: "/marker-ofek/portfolio",
        icon: LayoutDashboard,
        keywords: ["portfolio", "ceo", "מנכ״ל", "פורטפוליו", "סקירה"],
      },
    ],
  },
  {
    title: "כספים",
    items: [
      {
        id: "finance",
        label: "תזרים מזומנים (Cash Flow)",
        description: "מצב פיננסי, חשבוניות, וגבייה",
        href: "/marker-ofek/finance",
        icon: Wallet,
        keywords: ["finance", "cashflow", "כספים", "תזרים"],
      },
    ],
  },
  {
    title: "פרויקטים ותקציב",
    items: [
      {
        id: "new-project",
        label: "פתיחת פרויקט חדש (Wizard)",
        description: "צור פרויקט חדש בעזרת אשף ההקמה",
        href: "/marker-ofek/projects/new",
        icon: Folder,
        keywords: ["new project", "wizard", "פרויקט חדש", "אשף"],
      },
      {
        id: "cost-control",
        label: "בקרת תקציב (Cost Control)",
        description: "מטריצת מתוקצב מול בוצע — הדגמה",
        href: `/marker-ofek/projects/${DEMO_PROJECT_ID}/cost-control`,
        icon: PieChart,
        keywords: ["budget", "wbs", "variance", "תקציב", "חריגות"],
      },
    ],
  },
  {
    title: "רכש ומכרזים",
    items: [
      {
        id: "tenders-compare",
        label: "השוואת הצעות קבלנים (Bid Leveling)",
        description: "מטריצת השוואה בין הצעות קבלנים פעילים",
        href: "/marker-ofek/procurement/tenders/compare",
        icon: TrendingUp,
        keywords: ["bid", "tender", "מכרז", "הצעות"],
      },
      {
        id: "vendor-portal",
        label: "פורטל קבלנים במובייל",
        description: "דמו הגשת הצעת מחיר במובייל ע״י קבלן משנה",
        href: `/vendor/rfq/${DEMO_VENDOR_TOKEN}`,
        icon: Smartphone,
        keywords: ["vendor", "magic link", "ספק", "קבלן", "מובייל"],
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface CommandPaletteContextValue {
  open: boolean
  setOpen: (next: boolean) => void
  toggle: () => void
}

const CommandPaletteContext =
  React.createContext<CommandPaletteContextValue | null>(null)

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = React.useContext(CommandPaletteContext)
  if (!ctx) {
    // Defensive default — components rendered outside the provider get a
    // no-op so we never crash a screen.
    return { open: false, setOpen: () => {}, toggle: () => {} }
  }
  return ctx
}

// ---------------------------------------------------------------------------
// Provider — installs the global keybinding & renders the dialog portal.
// ---------------------------------------------------------------------------

export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const toggle = React.useCallback(() => setOpen((v) => !v), [])

  // Global ⌘K / Ctrl+K listener.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isK = e.key === "k" || e.key === "K"
      const meta = e.metaKey || e.ctrlKey
      if (isK && meta) {
        e.preventDefault()
        setOpen((v) => !v)
        return
      }
      if (e.key === "Escape" && open) {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  // Lock background scroll while open.
  React.useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const value = React.useMemo<CommandPaletteContextValue>(
    () => ({ open, setOpen, toggle }),
    [open, toggle],
  )

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPaletteDialog
        open={open}
        onClose={() => setOpen(false)}
      />
    </CommandPaletteContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

function platformShortcutLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl K"
  const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
  return isMac ? "⌘ K" : "Ctrl K"
}

function CommandPaletteDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [shortcutLabel, setShortcutLabel] = React.useState("⌘ K")

  React.useEffect(() => {
    setShortcutLabel(platformShortcutLabel())
  }, [])

  if (!open) return null

  const runCommand = (href: string) => {
    onClose()
    // Defer the navigation by a tick so the close animation can begin —
    // also avoids rare React state-update-during-render warnings.
    setTimeout(() => router.push(href), 0)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="לוח פקודות"
      className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[12vh] sm:pt-[15vh]"
      dir="rtl"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="סגור לוח פקודות"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity"
      />

      {/* Panel */}
      <div
        className={cn(
          "relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200/80 bg-card shadow-2xl",
          "animate-in fade-in-0 zoom-in-95 duration-150",
        )}
      >
        <Command
          className="bg-card"
          // cmdk's default filter is fine; we boost matching by passing
          // keywords on each item.
          shouldFilter
        >
          <div className="relative">
            <CommandInput
              placeholder="חיפוש במערכת — מסכים, מודולים, פעולות…"
              autoFocus
            />
            <kbd className="absolute end-3 top-1/2 hidden -translate-y-1/2 items-center rounded-md border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-600 sm:inline-flex">
              {shortcutLabel}
            </kbd>
          </div>

          <CommandList className="max-h-[60vh] py-2">
            <CommandEmpty>
              <div className="flex flex-col items-center gap-1 py-4 text-slate-500">
                <span className="text-sm">לא נמצאו תוצאות.</span>
                <span className="text-[11px] text-slate-400">
                  נסה לחפש במילים אחרות, או לחץ Esc לסגירה.
                </span>
              </div>
            </CommandEmpty>

            {COMMAND_SECTIONS.map((section, idx) => (
              <React.Fragment key={section.title}>
                {idx > 0 ? <CommandSeparator /> : null}
                <CommandGroup
                  heading={section.title}
                  className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                >
                  {section.items.map((item) => {
                    const Icon = item.icon
                    return (
                      <CommandItem
                        key={item.id}
                        value={`${item.label} ${item.keywords?.join(" ") ?? ""}`}
                        onSelect={() => runCommand(item.href)}
                        className="group cursor-pointer gap-3 px-2 py-2"
                      >
                        <span
                          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-50 to-indigo-50 text-violet-700 ring-1 ring-violet-200/60 group-data-[selected=true]:from-violet-100 group-data-[selected=true]:to-indigo-100"
                          aria-hidden
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium text-foreground">
                            {item.label}
                          </span>
                          {item.description ? (
                            <span className="truncate text-[11.5px] text-slate-500">
                              {item.description}
                            </span>
                          ) : null}
                        </span>
                        <CommandShortcut className="opacity-0 transition-opacity group-data-[selected=true]:opacity-100">
                          <CornerDownLeft className="size-3.5" aria-hidden />
                        </CommandShortcut>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </React.Fragment>
            ))}
          </CommandList>

          <div className="flex items-center justify-between border-t border-slate-200/80 bg-slate-50 px-3 py-2 text-[10.5px] text-slate-500">
            <div className="flex items-center gap-2">
              <CommandIcon className="size-3" aria-hidden />
              <span className="font-mono uppercase tracking-wider">
                Marker Ofek · Command Palette
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-slate-300 bg-white px-1 font-mono text-[9px] text-slate-600">
                  ↑
                </kbd>
                <kbd className="rounded border border-slate-300 bg-white px-1 font-mono text-[9px] text-slate-600">
                  ↓
                </kbd>
                לניווט
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-slate-300 bg-white px-1 font-mono text-[9px] text-slate-600">
                  ↵
                </kbd>
                לבחירה
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-slate-300 bg-white px-1 font-mono text-[9px] text-slate-600">
                  Esc
                </kbd>
                לסגירה
              </span>
            </div>
          </div>
        </Command>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Auto-close on route change — referenced by consumers that need it
// (`usePathname` is cheap; we wire it once inside the provider so the dialog
// always closes after a successful navigation).
// ---------------------------------------------------------------------------

export function CommandPaletteAutoClose() {
  const pathname = usePathname()
  const { open, setOpen } = useCommandPalette()
  const last = React.useRef(pathname)
  React.useEffect(() => {
    if (last.current !== pathname && open) setOpen(false)
    last.current = pathname
  }, [pathname, open, setOpen])
  return null
}

// ---------------------------------------------------------------------------
// Top-nav fake search-bar trigger
// ---------------------------------------------------------------------------

export function CommandPaletteSearchTrigger({
  className,
}: {
  className?: string
}) {
  const { setOpen } = useCommandPalette()
  const [shortcutLabel, setShortcutLabel] = React.useState("⌘ K")
  React.useEffect(() => {
    setShortcutLabel(platformShortcutLabel())
  }, [])

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="פתח לוח פקודות לחיפוש מהיר"
      className={cn(
        "group inline-flex h-9 min-w-0 shrink items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 text-[12.5px] text-slate-500 shadow-sm",
        "transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-700",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
        className,
      )}
    >
      <Search className="size-3.5 shrink-0" aria-hidden />
      <span className="flex-1 truncate text-start">חיפוש במערכת…</span>
      <kbd className="ms-2 hidden items-center rounded-md border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-600 group-hover:border-slate-400 sm:inline-flex">
        {shortcutLabel}
      </kbd>
    </button>
  )
}
