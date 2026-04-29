"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { usePathname, useRouter } from "next/navigation"
import type { LucideIcon } from "lucide-react"
import {
  FileText,
  FolderKanban,
  GanttChartSquare,
  LayoutDashboard,
  Loader2,
  Mic,
  Search,
  Send,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"

import { useSmartWorkspace } from "@/components/marker-ofek/workspace/smart-workspace-context"
import { cn } from "@/lib/utils"
import { MARKER_OFEK_HREFS } from "@/lib/infrastructure/navigation/sidebar-routes"

function getSpeechRecognitionCtor():
  | (new () => SpeechRecognition)
  | null {
  if (typeof window === "undefined") return null
  const w = window as typeof window & {
    SpeechRecognition?: new () => SpeechRecognition
    webkitSpeechRecognition?: new () => SpeechRecognition
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

type CommandPaletteContextValue = {
  open: () => void
  close: () => void
  toggle: () => void
  isOpen: boolean
}

const CommandPaletteContext =
  createContext<CommandPaletteContextValue | null>(null)

export function useCommandPalette(): CommandPaletteContextValue | null {
  return useContext(CommandPaletteContext)
}

/** כפתור כותרת — פותח את אומניבאר (מוצג בכל הדשבורד) */
export function CommandPaletteHeaderTrigger() {
  const palette = useCommandPalette()
  if (!palette) return null
  return (
    <button
      type="button"
      onClick={palette.open}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200/90 bg-card px-2.5 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm",
        "transition-colors hover:border-emerald-500/40 hover:text-emerald-700",
        "dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300 dark:hover:border-emerald-500/50 dark:hover:text-emerald-300"
      )}
      aria-label="פתח חיפוש מהיר"
    >
      <Search className="size-3.5 shrink-0 opacity-80" aria-hidden />
      <span className="hidden sm:inline">חיפוש</span>
      <kbd className="hidden rounded border border-slate-300/80 bg-slate-100 px-1 font-mono text-[10px] text-slate-500 sm:inline dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400">
        ⌘K
      </kbd>
    </button>
  )
}

const QUICK_ROUTES: {
  title: string
  href: string
  subtitle: string
  icon: LucideIcon
}[] = [
  {
    title: "Holden Command Center",
    href: "/marker-ofek/command-center",
    subtitle: "ERP · KPIs · ביצוע",
    icon: LayoutDashboard,
  },
  {
    title: "הפקת חשבונית מס",
    href: MARKER_OFEK_HREFS.financeInvoiceNew,
    subtitle: "כספים · חשבוניות",
    icon: FileText,
  },
  {
    title: "מרכז כספים",
    href: "/marker-ofek/finance",
    subtitle: "כספים · לוח בקרה",
    icon: Wallet,
  },
  {
    title: "לוח פרויקטים",
    href: "/marker-ofek/projects",
    subtitle: "פרויקטים · פורטפוליו",
    icon: FolderKanban,
  },
  {
    title: "גאנט ביצוע",
    href: "/marker-ofek/execution/gantt",
    subtitle: "ביצוע · לוחות זמנים",
    icon: GanttChartSquare,
  },
]

export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [inputText, setInputText] = useState("")
  const [voiceListening, setVoiceListening] = useState(false)
  const [voiceParsing, setVoiceParsing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const intentInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const ctrlHoldTimerRef = useRef<number | null>(null)
  const paletteOpenRef = useRef(false)
  const voiceListeningRef = useRef(false)
  const voiceParsingRef = useRef(false)
  const router = useRouter()
  const pathname = usePathname() ?? ""
  const smartWs = useSmartWorkspace()

  paletteOpenRef.current = open
  voiceListeningRef.current = voiceListening
  voiceParsingRef.current = voiceParsing

  const value = useMemo<CommandPaletteContextValue>(
    () => ({
      open: () => {
        setQuery("")
        setInputText("")
        setOpen(true)
      },
      close: () => setOpen(false),
      toggle: () => {
        setOpen((o) => {
          if (!o) {
            setQuery("")
            setInputText("")
          }
          return !o
        })
      },
      isOpen: open,
    }),
    [open]
  )

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open])

  const stopVoiceRecognition = useCallback(() => {
    try {
      recognitionRef.current?.stop()
    } catch {
      /* ignore */
    }
    recognitionRef.current = null
    setVoiceListening(false)
  }, [])

  const clearCtrlHoldTimer = useCallback(() => {
    if (ctrlHoldTimerRef.current != null) {
      window.clearTimeout(ctrlHoldTimerRef.current)
      ctrlHoldTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (open) return
    clearCtrlHoldTimer()
    stopVoiceRecognition()
  }, [open, stopVoiceRecognition, clearCtrlHoldTimer])

  const submitHoldenIntent = useCallback(
    async (rawText: string, opts?: { syncSearchQuery?: boolean }) => {
      const t = rawText.trim()
      if (!t) return
      if (opts?.syncSearchQuery !== false) {
        setQuery(t)
      }
      setVoiceParsing(true)
      const loadingToastId = toast.loading("Processing AI Intent…")
      try {
        const res = await fetch("/api/erp/holden/intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ text: t }),
        })

        const data = (await res.json().catch(() => null)) as {
          ok?: boolean
          error?: string
          message?: string
          path?: string
          url?: string
          intent?: {
            intent?: string
            workspaceActionType?: "close_all_tabs" | "close_current_tab" | "clear_screen" | null
          }
          detail?: {
            partialAccountId?: string
            workspaceActionType?: "close_all_tabs" | "close_current_tab" | "clear_screen" | null
          }
        } | null

        toast.dismiss(loadingToastId)

        if (!res.ok) {
          const serverErr =
            typeof data?.error === "string" && data.error.trim()
              ? data.error.trim()
              : ""
          const errMsg =
            serverErr ||
            (res.status === 422
              ? "מעבר BPM נדחה — בדקו סטטוס חשבון / הרשאות"
              : "בקשת הכוונה נכשלה")
          toast.error(errMsg, {
            duration: serverErr.length > 80 ? 12_000 : 6_000,
          })
          return
        }

        if (data?.ok === true) {
          const intentName = data.intent?.intent
          const wsAct =
            data.intent?.workspaceActionType ??
            data.detail?.workspaceActionType ??
            null

          if (intentName === "WORKSPACE_ACTION" && wsAct) {
            if (!smartWs) {
              if (process.env.NODE_ENV === "development") {
                console.warn(
                  "[CommandPalette] WORKSPACE_ACTION: SmartWorkspace context missing — check provider order (SmartWorkspaceProvider must wrap CommandPaletteProvider)."
                )
              }
              toast.error("סביבת העבודה לא זמינה — נסו ממסך מרקר אופק.")
              setOpen(false)
              setQuery("")
              setInputText("")
              return
            }
            if (wsAct === "close_all_tabs") {
              queueMicrotask(() => {
                smartWs.closeAllTabs()
              })
            } else if (wsAct === "close_current_tab") {
              queueMicrotask(() => {
                smartWs.closeCurrentWorkspaceTab()
              })
            } else if (wsAct === "clear_screen") {
              queueMicrotask(() => {
                smartWs.setSplitView(false)
                smartWs.setSecondaryTabHref(null)
                smartWs.setAssistantSplitDocked(false)
              })
            }
            if (typeof data.message === "string" && data.message.trim()) {
              toast.success(data.message.trim())
            } else {
              toast.success(
                wsAct === "close_all_tabs"
                  ? "סוגר את כל החלונות"
                  : wsAct === "close_current_tab"
                    ? "סוגר את הטאב הנוכחי"
                    : "מנקה את המסך"
              )
            }
            setOpen(false)
            setQuery("")
            setInputText("")
            return
          }

          if (typeof data.message === "string" && data.message.trim()) {
            toast.success(data.message)
          }
          const rawPath =
            (typeof data.path === "string" && data.path.trim()) ||
            (typeof data.url === "string" && data.url.trim()) ||
            (data.detail?.partialAccountId
              ? `/marker-ofek/holden-erp/partial-accounts/${data.detail.partialAccountId}`
              : null)
          setOpen(false)
          setQuery("")
          setInputText("")
          if (rawPath) {
            const href = rawPath.startsWith("/") ? rawPath : `/${rawPath}`
            router.push(href)
          }
          return
        }

        toast.message("לא זוהתה פעולה ברורה — נסו לנסח אחרת.")
      } catch (e) {
        toast.dismiss(loadingToastId)
        toast.error(e instanceof Error ? e.message : "שגיאת רשת")
      } finally {
        setVoiceParsing(false)
      }
    },
    [router, smartWs]
  )

  const handleTextSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      const t = inputText.trim()
      if (!t || voiceParsing) return
      void submitHoldenIntent(t, { syncSearchQuery: false })
      setInputText("")
    },
    [inputText, voiceParsing, submitHoldenIntent]
  )

  const startVoiceRecognition = useCallback(() => {
    if (recognitionRef.current) return
    try {
      const Ctor = getSpeechRecognitionCtor()
      if (!Ctor) {
        alert("הדפדפן שלך לא תומך בזיהוי קול.")
        return
      }

      const rec = new Ctor()
      rec.lang = "he-IL"
      rec.continuous = false
      rec.interimResults = false

      rec.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0]?.[0]?.transcript ?? ""
        stopVoiceRecognition()
        void submitHoldenIntent(transcript, { syncSearchQuery: true })
      }

      rec.onerror = (event) => {
        stopVoiceRecognition()
        if (event.error !== "no-speech") {
          console.error("Speech Recognition Error:", event.error)
          alert(`שגיאת זיהוי קול: ${event.error}`)
        }
      }

      rec.onend = () => {
        stopVoiceRecognition()
      }

      recognitionRef.current = rec
      rec.start()
      setVoiceListening(true)
    } catch (err) {
      console.error("Failed to start speech recognition:", err)
      setVoiceListening(false)
    }
  }, [stopVoiceRecognition, submitHoldenIntent])

  const toggleVoiceListening = useCallback(() => {
    if (voiceListening) {
      stopVoiceRecognition()
      return
    }
    startVoiceRecognition()
  }, [voiceListening, stopVoiceRecognition, startVoiceRecognition])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Control") {
        if (ctrlHoldTimerRef.current != null) {
          clearCtrlHoldTimer()
        }
        return
      }
      if (e.repeat) return

      if (voiceListeningRef.current) {
        stopVoiceRecognition()
        return
      }
      if (voiceParsingRef.current) return

      clearCtrlHoldTimer()
      ctrlHoldTimerRef.current = window.setTimeout(() => {
        ctrlHoldTimerRef.current = null
        if (!paletteOpenRef.current) return
        if (voiceListeningRef.current || voiceParsingRef.current) return
        startVoiceRecognition()
      }, 1000)
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control") {
        clearCtrlHoldTimer()
      }
    }

    document.addEventListener("keydown", onKeyDown, { capture: true })
    document.addEventListener("keyup", onKeyUp, { capture: true })
    return () => {
      clearCtrlHoldTimer()
      document.removeEventListener("keydown", onKeyDown, { capture: true })
      document.removeEventListener("keyup", onKeyUp, { capture: true })
    }
  }, [open, clearCtrlHoldTimer, stopVoiceRecognition, startVoiceRecognition])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey
      const isK =
        e.code === "KeyK" ||
        e.key === "k" ||
        e.key === "K"
      if (isMod && isK) {
        e.preventDefault()
        e.stopImmediatePropagation()
        setOpen((prev) => {
          if (!prev) {
            setQuery("")
            setInputText("")
          }
          return !prev
        })
        return
      }
      if (e.key === "Escape" && paletteOpenRef.current) {
        e.preventDefault()
        setOpen(false)
        setQuery("")
        setInputText("")
      }
    }
    document.addEventListener("keydown", onKeyDown, { capture: true })
    return () =>
      document.removeEventListener("keydown", onKeyDown, { capture: true })
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return QUICK_ROUTES
    return QUICK_ROUTES.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.subtitle.toLowerCase().includes(q)
    )
  }, [query])

  const navigateTo = useCallback(
    (href: string) => {
      setOpen(false)
      setQuery("")
      setInputText("")
      router.push(href)
    },
    [router]
  )

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {open ? (
        <div
          className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh] px-4 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="command-palette-heading"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/75 backdrop-blur-md"
            aria-label="סגור"
            onClick={() => {
              setOpen(false)
              setQuery("")
              setInputText("")
            }}
          />
          <div
            className={cn(
              "relative z-[201] w-full max-w-lg overflow-hidden rounded-xl border border-slate-800/90",
              "bg-slate-950/95 shadow-2xl shadow-black/60 ring-1 ring-emerald-500/15"
            )}
          >
            <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2.5">
              <Search
                className="size-4 shrink-0 text-emerald-500/90"
                aria-hidden
              />
              <div className="relative min-w-0 flex-1">
                <input
                  ref={inputRef}
                  id="command-palette-heading"
                  data-command-palette-input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && filtered[0] && !voiceParsing) {
                      e.preventDefault()
                      navigateTo(filtered[0].href)
                    }
                  }}
                  placeholder="חיפוש או דיבור (עברית)…"
                  disabled={voiceParsing}
                  className={cn(
                    "w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500",
                    "outline-none disabled:opacity-60",
                    "pe-10"
                  )}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={toggleVoiceListening}
                  disabled={voiceParsing}
                  title={
                    getSpeechRecognitionCtor()
                      ? voiceListening
                        ? "עצור האזנה"
                        : "דיבור לפעולה"
                      : "זיהוי קול לא זמין בדפדפן זה"
                  }
                  className={cn(
                    "absolute end-0 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg transition-colors",
                    "text-slate-400 hover:bg-slate-800/80 hover:text-slate-200",
                    "disabled:pointer-events-none disabled:opacity-40",
                    voiceListening && "text-emerald-500 hover:text-emerald-400"
                  )}
                  aria-pressed={voiceListening}
                  aria-label={
                    voiceListening ? "מקשיב לקול" : "התחל זיהוי קול"
                  }
                >
                  {voiceParsing ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <span className="relative inline-flex">
                      {voiceListening ? (
                        <span
                          className="absolute -start-0.5 -top-0.5 flex size-2"
                          aria-hidden
                        >
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500/70 opacity-80" />
                          <span className="relative inline-flex size-1.5 rounded-full bg-red-500" />
                        </span>
                      ) : null}
                      <Mic
                        className={cn(
                          "size-4",
                          voiceListening && "text-emerald-500"
                        )}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    </span>
                  )}
                </button>
              </div>
              <kbd className="hidden shrink-0 rounded border border-slate-700 bg-slate-900 px-1.5 font-mono text-[10px] text-slate-400 sm:inline">
                Esc
              </kbd>
            </div>
            <ul className="max-h-[min(52vh,360px)] overflow-y-auto p-1.5">
              {filtered.length === 0 ? (
                <li className="px-3 py-8 text-center text-sm text-slate-500">
                  אין תוצאות
                </li>
              ) : (
                filtered.map((cmd) => {
                  const Icon = cmd.icon
                  const active =
                    pathname === cmd.href || pathname.startsWith(`${cmd.href}/`)
                  return (
                    <li key={cmd.href}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-start transition-colors",
                          active
                            ? "bg-emerald-500/15 text-emerald-100"
                            : "hover:bg-emerald-500/10 hover:text-emerald-50"
                        )}
                        onClick={() => navigateTo(cmd.href)}
                      >
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-900 text-emerald-400">
                          <Icon className="size-4" strokeWidth={1.75} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">
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
            <form
              className="border-t border-slate-800 px-3 py-2.5"
              onSubmit={handleTextSubmit}
            >
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="command-palette-holden-intent"
                    className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500"
                  >
                    Holden AI
                  </label>
                  <input
                    ref={intentInputRef}
                    id="command-palette-holden-intent"
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="הקלד פקודה ל-Holden AI..."
                    disabled={voiceParsing}
                    dir="rtl"
                    autoComplete="off"
                    className={cn(
                      "w-full rounded-lg border border-slate-700/90 bg-slate-900/80 px-3 py-2 text-sm text-slate-100",
                      "placeholder:text-slate-500",
                      "outline-none ring-emerald-500/0 transition-[box-shadow,border-color] focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20",
                      "disabled:cursor-not-allowed disabled:opacity-50"
                    )}
                  />
                </div>
                <button
                  type="submit"
                  disabled={voiceParsing || !inputText.trim()}
                  title="שלח פקודה"
                  className={cn(
                    "flex h-[42px] shrink-0 items-center justify-center self-end rounded-lg px-3",
                    "border border-emerald-600/50 bg-emerald-600/20 text-emerald-300",
                    "transition-colors hover:bg-emerald-600/30 hover:text-emerald-100",
                    "disabled:pointer-events-none disabled:opacity-40"
                  )}
                  aria-label="שלח פקודה ל-Holden AI"
                >
                  <Send className="size-4" strokeWidth={2} aria-hidden />
                </button>
              </div>
            </form>
            <div className="border-t border-slate-800/80 px-3 py-2 text-[10px] text-slate-500">
              <kbd className="rounded border border-slate-700 bg-slate-900 px-1 font-mono">
                Esc
              </kbd>{" "}
              לסגירה ·{" "}
              <kbd className="rounded border border-slate-700 bg-slate-900 px-1 font-mono">
                ⌘K
              </kbd>{" "}
              לפתיחה מחדש
            </div>
          </div>
        </div>
      ) : null}
    </CommandPaletteContext.Provider>
  )
}
