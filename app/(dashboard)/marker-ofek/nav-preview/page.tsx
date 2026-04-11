"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  Building2,
  Command,
  FileText,
  FolderKanban,
  Home,
  LayoutDashboard,
  MapPin,
  Search,
  Sparkles,
  Wallet,
} from "lucide-react"

import { cn } from "@/lib/utils"

type ActiveModule = "home" | "finance" | "projects"

type ContextLink = { label: string; hint?: string }

const MODULE_CONTEXT: Record<ActiveModule, ContextLink[]> = {
  home: [
    { label: "לוח בקרה", hint: "סקירה כללית" },
    { label: "התראות", hint: "עדכונים אחרונים" },
    { label: "קיצורי דרך", hint: "פעולות נפוצות" },
  ],
  finance: [
    { label: "הפקת חשבונית", hint: "חשבונית מס חדשה" },
    { label: "דוחות מע״מ", hint: "דיווח תקופתי" },
    { label: "מרכז חיוב ותזרים", hint: "תזרים מזומנים" },
  ],
  projects: [
    { label: "עיר היין", hint: "פרויקט פעיל" },
    { label: "נחלים", hint: "פרויקט פעיל" },
    { label: "לוחות זמנים", hint: "תכנון ביצוע" },
  ],
}

const COMMAND_MOCK = [
  {
    id: "1",
    title: "הפקת חשבונית חדשה",
    subtitle: "כספים · חשבוניות",
    icon: FileText,
  },
  {
    id: "2",
    title: "ניווט לפרויקט עיר היין",
    subtitle: "פרויקטים · מיקום",
    icon: MapPin,
  },
  {
    id: "3",
    title: "שאל את ה-AI על תקציב נחלים",
    subtitle: "עוזר חכם · תקציב",
    icon: Sparkles,
  },
] as const

const SLIM_MODULES: {
  id: ActiveModule
  label: string
  icon: typeof Home
}[] = [
  { id: "home", label: "ראשי", icon: Home },
  { id: "finance", label: "כספים", icon: Wallet },
  { id: "projects", label: "פרויקטים", icon: FolderKanban },
]

export default function NavPreviewPage() {
  const [activeModule, setActiveModule] = useState<ActiveModule>("finance")
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const contextualLinks = MODULE_CONTEXT[activeModule]

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [...COMMAND_MOCK]
    return COMMAND_MOCK.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.subtitle.toLowerCase().includes(q)
    )
  }, [query])

  const openPalette = useCallback(() => {
    setPaletteOpen(true)
    setQuery("")
  }, [])

  const closePalette = useCallback(() => {
    setPaletteOpen(false)
    setQuery("")
  }, [])

  useEffect(() => {
    if (!paletteOpen) return
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [paletteOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((prev) => {
          if (!prev) setQuery("")
          return !prev
        })
        return
      }
      if (e.key === "Escape") {
        setPaletteOpen((prev) => {
          if (prev) {
            e.preventDefault()
            setQuery("")
          }
          return false
        })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const moduleTitle =
    activeModule === "home"
      ? "ראשי"
      : activeModule === "finance"
        ? "כספים"
        : "פרויקטים"

  return (
    <div
      className="flex w-full flex-col gap-4 pb-8"
      dir="rtl"
    >
      <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 px-4 py-3 text-slate-400">
        <p className="text-xs font-medium tracking-wide text-emerald-500/90">
          ארגז חול · ניווט דור הבא
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          תצוגה מבודדת לבדיקה בלבד. לחץ{" "}
          <kbd className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
            Ctrl+K
          </kbd>{" "}
          או{" "}
          <kbd className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
            ⌘K
          </kbd>{" "}
          לפלטת פקודות.
        </p>
      </div>

      {/* Mock app chrome — self-contained */}
      <div
        className={cn(
          "flex h-[min(100dvh,920px)] w-full max-w-[1400px] flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-2xl shadow-black/40"
        )}
      >
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800/90 bg-slate-950 px-4">
          <div className="flex items-center gap-2 text-slate-100">
            <LayoutDashboard className="size-5 text-emerald-500" aria-hidden />
            <span className="text-sm font-semibold tracking-tight">
              מרקר אופק · תצוגה
            </span>
          </div>
          <button
            type="button"
            onClick={openPalette}
            className={cn(
              "flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-400",
              "transition-colors hover:border-emerald-500/40 hover:text-emerald-400/90"
            )}
          >
            <Search className="size-3.5 shrink-0" aria-hidden />
            <span className="hidden sm:inline">חיפוש…</span>
            <Command className="size-3.5 opacity-60" aria-hidden />
            <kbd className="hidden rounded border border-slate-700 bg-slate-950 px-1 font-mono text-[10px] sm:inline">
              ⌘K
            </kbd>
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Pane 1 — slim icons */}
          <nav
            className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-e border-slate-800/90 bg-slate-950 py-3"
            aria-label="מודולים"
          >
            {SLIM_MODULES.map((m) => {
              const Icon = m.icon
              const active = activeModule === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  title={m.label}
                  onClick={() => setActiveModule(m.id)}
                  className={cn(
                    "flex size-10 items-center justify-center rounded-lg transition-all duration-200",
                    active
                      ? "bg-emerald-500/15 text-emerald-400 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.35)]"
                      : "text-slate-500 hover:bg-slate-800/80 hover:text-slate-200"
                  )}
                >
                  <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
                  <span className="sr-only">{m.label}</span>
                </button>
              )
            })}
          </nav>

          {/* Pane 2 — contextual */}
          <aside
            className="flex w-[220px] shrink-0 flex-col border-e border-slate-800/90 bg-slate-900/40"
            aria-label={`תפריט ${moduleTitle}`}
          >
            <div className="border-b border-slate-800/80 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                הקשר
              </p>
              <p className="mt-1 text-sm font-medium text-slate-100">
                {moduleTitle}
              </p>
            </div>
            <ul className="flex flex-col gap-0.5 p-2">
              {contextualLinks.map((link) => (
                <li key={link.label}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-start text-sm transition-colors",
                      "text-slate-300 hover:bg-slate-800/90 hover:text-emerald-400"
                    )}
                  >
                    <span className="font-medium">{link.label}</span>
                    {link.hint ? (
                      <span className="text-[11px] text-slate-500">
                        {link.hint}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* Main */}
          <main className="min-w-0 flex-1 overflow-auto bg-slate-950 p-6">
            <div className="mx-auto max-w-lg">
              <div className="mb-2 flex items-center gap-2 text-emerald-500">
                <Building2 className="size-4" aria-hidden />
                <span className="text-xs font-semibold uppercase tracking-widest">
                  תוכן ראשי
                </span>
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-50">
                אזור עבודה — {moduleTitle}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                סרגל צד כפול: רצועת אייקונים קבועה, ותפריט הקשר שמשתנה לפי
                המודול הנבחר. כאן יוצגו דפים, טבלאות וווידג׳טים באפליקציה
                האמיתית.
              </p>
              <div className="mt-8 h-32 rounded-lg border border-dashed border-slate-800 bg-slate-900/30" />
            </div>
          </main>
        </div>
      </div>

      {/* Command palette */}
      {paletteOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nav-preview-cmd-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-md"
            aria-label="סגור"
            onClick={closePalette}
          />
          <div
            className={cn(
              "relative z-[101] w-full max-w-lg overflow-hidden rounded-xl border border-slate-800/90",
              "bg-slate-900/95 shadow-2xl shadow-black/50 ring-1 ring-white/5"
            )}
          >
            <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2.5">
              <Search
                className="size-4 shrink-0 text-emerald-500/80"
                aria-hidden
              />
              <input
                ref={inputRef}
                id="nav-preview-cmd-title"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="חפש פעולה, פרויקט או שאלה…"
                className={cn(
                  "min-w-0 flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500",
                  "outline-none"
                )}
                autoComplete="off"
              />
            </div>
            <ul className="p-1.5">
              {filteredCommands.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-slate-500">
                  אין תוצאות
                </li>
              ) : (
                filteredCommands.map((cmd) => {
                  const Icon = cmd.icon
                  return (
                    <li key={cmd.id}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-start transition-colors",
                          "hover:bg-emerald-500/10 hover:text-emerald-100"
                        )}
                        onClick={closePalette}
                      >
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-800/80 text-emerald-400">
                          <Icon className="size-4" strokeWidth={1.75} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-slate-100">
                            {cmd.title}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-slate-500">
                            {cmd.subtitle}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
            <div className="border-t border-slate-800/80 px-3 py-2 text-[10px] text-slate-500">
              <kbd className="font-mono">Esc</kbd> לסגירה
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
