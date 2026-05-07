"use client"

/**
 * InvestorCommandCenter — "Pitch Ready" hero for the project hub.
 *
 * תפקיד: לתת למנכ"ל מסך בולט ומרהיב שמדבר את שפת המשקיעים — KPI פיננסי,
 * חיסכון AI בולט, אבני דרך, ו-AI Copilot חי בנגיעה — מבלי להפר את שאר
 * חוויית הניהול הקיימת ב-`ProjectMasterHub360`.
 *
 * **Mock-data only** — אסור לקרוא ל-DB. כל הערכים מתחת קבועים, ויפים
 * לעין, כדי שהמסך ייראה זהה בהצגה גם כשהפרויקט בסביבת dev/empty.
 *
 * חלק 2 של הדרישה (Live Audio UI) מוטמע בכפתור המיקרופון בתוך ה-Sheet:
 * 5 בריקסים דקים מטה-מעלה עם stagger ב-`animationDelay` שמדמים גלי קול.
 */

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import {
  Bot,
  Coins,
  Mic,
  MicOff,
  Send,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { playMicStart, playMicStop, playSuccess } from "@/lib/audio-sfx"
import { readActiveCompanyIdFromCookie } from "@/lib/company-context"
import { getSpeechRecognitionConstructor } from "@/lib/speech-recognition"
import { cn } from "@/lib/utils"

// ============================================================================
// Mock data — investor-grade numbers
// ============================================================================

const MOCK_KPI = {
  budgetApproved: 10_000_000,
  budgetUsed: 4_200_000,
  aiSavings: 84_000,
  /** Forecast vs plan (AI Copilot inferred). */
  forecastVarianceIls: -126_000, // negative = under-budget = good
  progressPct: 41,
}

type Milestone = {
  id: string
  label: string
  pct: number
  status: "done" | "in-progress" | "upcoming"
}

const MOCK_MILESTONES: Milestone[] = [
  { id: "m-1", label: "אישורי היתר", pct: 100, status: "done" },
  { id: "m-2", label: "ביצוע מרתפים", pct: 60, status: "in-progress" },
  { id: "m-3", label: "שלד עליון", pct: 18, status: "in-progress" },
  { id: "m-4", label: "מעטפת + גמר", pct: 0, status: "upcoming" },
  { id: "m-5", label: "מסירה ללקוח", pct: 0, status: "upcoming" },
]

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

// ============================================================================
// Component
// ============================================================================

export function InvestorCommandCenter({
  projectId,
  projectName,
  internalCode,
}: {
  projectId: string
  projectName: string
  internalCode: string | null
}) {
  return (
    <section
      dir="rtl"
      className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-6 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
      data-investor-pitch="command-center"
    >
      {/* Decorative gradient halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 h-72 w-72 rounded-full bg-gradient-to-br from-emerald-300/30 via-cyan-300/20 to-transparent blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-gradient-to-tr from-violet-400/25 via-fuchsia-300/20 to-transparent blur-3xl"
      />

      <header className="relative mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1.5">
          <Badge
            variant="secondary"
            className="border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
          >
            <Sparkles className="me-1 size-3" />
            Investor Command Center
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            {projectName}
          </h2>
          {internalCode ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              קוד פנימי <span className="font-mono">{internalCode}</span>
            </p>
          ) : null}
        </div>

        <CopilotDrawer projectId={projectId} projectName={projectName} />
      </header>

      {/* Bento KPI grid */}
      <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          tone="indigo"
          icon={<Wallet className="size-5" />}
          label="תקציב מאושר"
          value={ILS.format(MOCK_KPI.budgetApproved)}
          hint="לפי כתב כמויות חתום"
        />
        <KpiTile
          tone="amber"
          icon={<Coins className="size-5" />}
          label="תקציב שנוצל"
          value={ILS.format(MOCK_KPI.budgetUsed)}
          hint={`${Math.round(
            (MOCK_KPI.budgetUsed / MOCK_KPI.budgetApproved) * 100,
          )}% מהמסגרת`}
          progressPct={Math.round(
            (MOCK_KPI.budgetUsed / MOCK_KPI.budgetApproved) * 100,
          )}
        />
        <KpiTile
          tone="emerald"
          icon={<TrendingUp className="size-5" />}
          label="חיסכון מוערך ע״י AI"
          value={`+${ILS.format(MOCK_KPI.aiSavings)}`}
          hint="ניתוב חכם של רכש + מניעת חריגות"
          glow
        />
        <KpiTile
          tone="sky"
          icon={<TrendingDown className="size-5" />}
          label="סטיית תחזית"
          value={ILS.format(MOCK_KPI.forecastVarianceIls)}
          hint="מתחת לתכנון — תחזית AI"
        />
      </div>

      {/* Milestones strip */}
      <div className="relative mt-6 rounded-2xl border border-slate-200 bg-white/70 p-5 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/60">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              אבני דרך
            </p>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              התקדמות הפרויקט · {MOCK_KPI.progressPct}%
            </h3>
          </div>
          <Badge
            variant="outline"
            className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            On-Track
          </Badge>
        </div>
        <Progress value={MOCK_KPI.progressPct} className="h-2" />
        <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {MOCK_MILESTONES.map((m) => (
            <li
              key={m.id}
              className={cn(
                "rounded-xl border bg-white p-3 text-sm shadow-sm dark:bg-slate-950",
                m.status === "done" &&
                  "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
                m.status === "in-progress" &&
                  "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
                m.status === "upcoming" &&
                  "border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400",
              )}
            >
              <div className="text-xs font-medium opacity-75">{m.label}</div>
              <div className="mt-1 text-lg font-semibold leading-none">
                {m.pct}%
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ============================================================================
// KPI Tile
// ============================================================================

const TONE_CLASS = {
  indigo:
    "from-indigo-500/10 to-transparent ring-indigo-200 dark:ring-indigo-900",
  amber:
    "from-amber-500/10 to-transparent ring-amber-200 dark:ring-amber-900",
  emerald:
    "from-emerald-500/15 to-transparent ring-emerald-300 dark:ring-emerald-800",
  sky: "from-sky-500/10 to-transparent ring-sky-200 dark:ring-sky-900",
} as const

const TONE_TEXT = {
  indigo: "text-indigo-700 dark:text-indigo-300",
  amber: "text-amber-700 dark:text-amber-300",
  emerald: "text-emerald-700 dark:text-emerald-300",
  sky: "text-sky-700 dark:text-sky-300",
} as const

function KpiTile({
  tone,
  icon,
  label,
  value,
  hint,
  progressPct,
  glow = false,
}: {
  tone: keyof typeof TONE_CLASS
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  progressPct?: number
  glow?: boolean
}) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden border-0 bg-gradient-to-br p-5 shadow-sm ring-1",
        TONE_CLASS[tone],
        "bg-white dark:bg-slate-900",
      )}
    >
      {glow ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-pulse bg-emerald-400/10"
        />
      ) : null}
      <div className="relative flex items-center justify-between">
        <span className={cn("text-xs font-medium", TONE_TEXT[tone])}>
          {label}
        </span>
        <span
          className={cn(
            "rounded-full bg-white p-1.5 ring-1 ring-slate-200 dark:bg-slate-950 dark:ring-slate-800",
            TONE_TEXT[tone],
          )}
        >
          {icon}
        </span>
      </div>
      <div
        className={cn(
          "relative mt-3 text-2xl font-bold tracking-tight",
          tone === "emerald"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-slate-900 dark:text-slate-50",
        )}
      >
        {value}
      </div>
      {hint ? (
        <p className="relative mt-1 text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      ) : null}
      {typeof progressPct === "number" ? (
        <div className="relative mt-3">
          <Progress value={progressPct} className="h-1.5" />
        </div>
      ) : null}
    </Card>
  )
}

// ============================================================================
// Copilot Drawer (Sheet) — chat + live audio waveform on mic
// ============================================================================

const COPILOT_INTRO_MESSAGE: UIMessage = {
  id: "investor-copilot-intro",
  role: "assistant",
  parts: [
    {
      type: "text",
      text:
        "שלום, אני סוכן ה-AI של הפרויקט. " +
        "אני יודע לקרוא תוכניות, לחלץ כמויות מ-DWG/DXF, ולהוציא הזמנת רכש מדויקת " +
        "תוך שניות. נסה: 'הזמן 100 מ' תעלת חשמל למפלס -1' או צרף תוכנית.",
    },
  ],
}

function CopilotDrawer({
  projectId,
  projectName,
}: {
  projectId: string
  projectName: string
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        size="lg"
        type="button"
        onClick={() => setOpen(true)}
        className="group relative overflow-hidden bg-gradient-to-l from-emerald-500 via-emerald-600 to-cyan-600 text-white shadow-lg shadow-emerald-500/30 hover:from-emerald-600 hover:to-cyan-700"
      >
        <span
          aria-hidden
          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full"
        />
        <Bot className="me-2 size-5" />
        פתח AI Copilot
        <span className="ms-2 inline-flex h-2 w-2 animate-pulse rounded-full bg-white" />
      </Button>
      <SheetContent
        side="left"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
        dir="rtl"
      >
        <SheetHeader className="border-b bg-gradient-to-l from-emerald-50 to-cyan-50 p-4 dark:from-emerald-950/40 dark:to-cyan-950/40">
          <SheetTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            <Bot className="size-5" />
            AI Copilot · {projectName}
          </SheetTitle>
          <SheetDescription>
            פרויקט מקושר אוטומטית · הקלטה חיה · Vision + Vector Extraction
          </SheetDescription>
        </SheetHeader>
        <CopilotChat
          projectId={projectId}
          projectName={projectName}
          onClose={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}

// ============================================================================
// CopilotChat — stripped down conversation UI with live audio waveform
// ============================================================================

function CopilotChat({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string
  projectName: string
  onClose: () => void
}) {
  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/procurement/autonomous-po/chat",
        headers: () => {
          const cid = readActiveCompanyIdFromCookie()
          const out: Record<string, string> = {}
          if (cid) {
            out["x-company-id"] = cid
            out["x-active-company-id"] = cid
          }
          return out
        },
      }),
    [],
  )

  const { messages, sendMessage, status } = useChat({
    transport,
    messages: [COPILOT_INTRO_MESSAGE],
  })
  const busy = status === "submitted" || status === "streaming"

  const [input, setInput] = React.useState("")
  const [listening, setListening] = React.useState(false)
  const [speechSupported, setSpeechSupported] = React.useState(false)
  const recognitionRef = React.useRef<SpeechRecognition | null>(null)
  const speechFinalsRef = React.useRef("")
  const scrollRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    setSpeechSupported(!!getSpeechRecognitionConstructor())
  }, [])

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages.length])

  // Play a success chime whenever the AI just finished streaming a reply
  // (status transitions away from "streaming"/"submitted" → "ready").
  // We track previous status with a ref to fire only on the falling edge.
  const prevStatusRef = React.useRef(status)
  React.useEffect(() => {
    const wasBusy =
      prevStatusRef.current === "streaming" ||
      prevStatusRef.current === "submitted"
    const isIdle = status === "ready"
    if (wasBusy && isIdle && messages.length > 1) {
      try {
        playSuccess()
      } catch {
        /* SFX is best-effort. */
      }
    }
    prevStatusRef.current = status
  }, [status, messages.length])

  const stopListening = React.useCallback(() => {
    try {
      recognitionRef.current?.stop()
    } catch {
      /* no-op */
    }
    setListening(false)
    // Audible release cue.
    try {
      playMicStop()
    } catch {
      /* SFX is best-effort; never break UX. */
    }
  }, [])

  function startListening() {
    const Ctor = getSpeechRecognitionConstructor()
    if (!Ctor) return
    // Synth bloop — plays through speakers immediately on user gesture.
    try {
      playMicStart()
    } catch {
      /* SFX is best-effort. */
    }
    const rec = new Ctor()
    rec.lang = "he-IL"
    rec.continuous = true
    rec.interimResults = true
    speechFinalsRef.current = input
    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        const t = r[0]?.transcript ?? ""
        if (r.isFinal) {
          speechFinalsRef.current = (
            (speechFinalsRef.current ? speechFinalsRef.current + " " : "") + t
          ).trim()
        } else {
          interim += t
        }
      }
      setInput(
        (speechFinalsRef.current + (interim ? " " + interim : "")).trim(),
      )
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    if (listening) stopListening()
    // Inject hidden project context — system prompt sees project mention
    // even when the user typed only the request.
    const wrapped =
      `[PROJECT_CONTEXT: id="${projectId}" name="${projectName}"]\n` + text
    void sendMessage({ text: wrapped })
    setInput("")
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* messages */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4 dark:bg-slate-950/40"
      >
        {messages.map((m) => (
          <ChatBubble key={m.id} message={m} />
        ))}
        {busy ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="size-1.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.3s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.15s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-emerald-500" />
            <span>הסוכן חושב…</span>
          </div>
        ) : null}
      </div>

      {/* composer */}
      <form
        onSubmit={handleSubmit}
        className="border-t bg-white p-3 dark:bg-slate-950"
      >
        {listening ? (
          <div className="mb-2 flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 dark:border-rose-900 dark:bg-rose-950/40">
            <LiveAudioWaveform />
            <span className="text-xs font-medium text-rose-700 dark:text-rose-300">
              מקליט · דבר חופשי בעברית
            </span>
            <button
              type="button"
              onClick={stopListening}
              className="ms-auto rounded-md p-1 text-rose-700 hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-900/40"
              aria-label="עצור הקלטה"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          {speechSupported ? (
            <Button
              type="button"
              variant={listening ? "destructive" : "outline"}
              size="icon"
              onClick={listening ? stopListening : startListening}
              aria-label={listening ? "עצור הקלטה" : "הקלט הודעה"}
              className={cn(
                "shrink-0 transition-transform",
                listening &&
                  "scale-110 ring-4 ring-rose-300/60 dark:ring-rose-900/60",
              )}
            >
              {listening ? (
                <MicOff className="size-4" />
              ) : (
                <Mic className="size-4" />
              )}
            </Button>
          ) : null}
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="הזמן 100 מ' תעלת חשמל למפלס -1, או צרף תוכנית…"
            rows={2}
            className="min-h-[2.5rem] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e as unknown as React.FormEvent)
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || busy}
            className="shrink-0 bg-emerald-600 hover:bg-emerald-700"
            aria-label="שלח"
          >
            <Send className="size-4" />
          </Button>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
          <span>פרויקט מקושר אוטומטית</span>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            סגור
          </button>
        </div>
      </form>
    </div>
  )
}

// ============================================================================
// Live audio waveform — pure CSS, 5 bars, staggered animation
// ============================================================================

const WAVE_BAR_DELAYS = ["0s", "0.12s", "0.24s", "0.36s", "0.48s"]

function LiveAudioWaveform() {
  return (
    <div
      className="flex h-6 items-center gap-1"
      role="img"
      aria-label="גלי סאונד חיים"
    >
      {WAVE_BAR_DELAYS.map((delay, i) => (
        <span
          key={i}
          className="block w-1 rounded-full bg-rose-500"
          style={{
            animation: "icc-wave 900ms ease-in-out infinite",
            animationDelay: delay,
            height: "100%",
          }}
        />
      ))}
      <style jsx>{`
        @keyframes icc-wave {
          0%,
          100% {
            transform: scaleY(0.35);
          }
          50% {
            transform: scaleY(1);
          }
        }
      `}</style>
    </div>
  )
}

// ============================================================================
// ChatBubble — minimal renderer for UIMessage parts
// ============================================================================

function ChatBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user"
  const text = (message.parts ?? [])
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("\n")
    // strip the hidden PROJECT_CONTEXT marker from the bubble
    .replace(/^\s*\[PROJECT_CONTEXT:[^\]]*\]\s*\n?/, "")
    .trim()
  if (!text) return null

  return (
    <div className={cn("flex", isUser ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          isUser
            ? "bg-emerald-600 text-white"
            : "border bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100",
        )}
      >
        {text.split("\n").map((line, i) => (
          <p key={i} className="whitespace-pre-wrap leading-relaxed">
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}
