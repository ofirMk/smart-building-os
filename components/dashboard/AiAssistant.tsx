"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { usePathname, useRouter } from "next/navigation"
import { Bot, Columns2, Loader2, Mic, Send, Sparkles, X } from "lucide-react"
import { toast } from "sonner"

import { useSmartWorkspace } from "@/components/marker-ofek/workspace/smart-workspace-context"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { HrWelcomePayload } from "@/lib/marker-ofek/diamond-navigator-curriculum"
import { MARKER_ONBOARDING_SANDBOX_PATH } from "@/lib/marker-ofek/hr-qualification-gate"
import { personaLabelHe } from "@/lib/marker-ofek/hr-onboarding-copy"
import { getExecutiveOracleBrief } from "@/lib/marker-ofek/partner-metrics-actions"
import { completeHrConciergeWelcome } from "@/lib/marker-ofek/user-dashboard-config-actions"
import { isWorkspacePersona } from "@/lib/marker-ofek/workspace-types"
import { getSpeechRecognitionConstructor } from "@/lib/speech-recognition"
import { cn } from "@/lib/utils"

const SPEECH_LANG = "he-IL"

/** מספרים עם ₪ — יישור מטבע כמו בשאר מודולי הכספים */
const ASSISTANT_MONEY_CHUNK =
  /(\d[\d,'\s\u200f\u202a\u202c]*(?:\.\d{1,2})?\s*₪)/g

function renderAssistantMessageText(text: string) {
  const parts = text.split(ASSISTANT_MONEY_CHUNK)
  return parts.map((part, i) => {
    if (/^\d[\d,'\s\u200f\u202a\u202c]*(?:\.\d{1,2})?\s*₪$/.test(part.trim())) {
      return (
        <span key={i} className="font-currency-mono tabular-nums">
          {part}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

export function AiAssistant({
  hostFirstName = null,
  hrWelcome = null,
  hrWelcomePending = false,
}: {
  hostFirstName?: string | null
  hrWelcome?: HrWelcomePayload | null
  hrWelcomePending?: boolean
}) {
  const pathname = usePathname() ?? ""
  const router = useRouter()
  const ws = useSmartWorkspace()
  const splitDocked =
    Boolean(
      ws?.splitView &&
        ws.assistantSplitDocked &&
        pathname.startsWith("/marker-ofek")
    )
  const [open, setOpen] = React.useState(false)
  const [input, setInput] = React.useState("")
  const [speechSupported, setSpeechSupported] = React.useState(false)
  const [listening, setListening] = React.useState(false)
  const [oracleBullets, setOracleBullets] = React.useState<string[] | null>(null)
  const [oracleFetched, setOracleFetched] = React.useState(false)

  const { messages, sendMessage, status, error, clearError, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  })

  const busy = status === "submitted" || status === "streaming"

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const recognitionRef = React.useRef<SpeechRecognition | null>(null)
  /** טקסט שהיה בשדה בעת התחלת ההקלטה + תוצאות סופיות מצטברות */
  const speechPrefixRef = React.useRef("")
  const speechFinalsRef = React.useRef("")

  React.useEffect(() => {
    setSpeechSupported(getSpeechRecognitionConstructor() !== null)
  }, [])

  React.useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    }
  }, [open])

  React.useEffect(() => {
    if (!hrWelcomePending || !hrWelcome) return
    if (!pathname.startsWith("/marker-ofek")) return
    setMessages((prev) => {
      if (prev.some((m) => m.id === "hr-welcome-marker")) return prev
      const name = hostFirstName?.trim() || "שם"
      const proj = hrWelcome.projectName?.trim() || "הארגון"
      const persona = isWorkspacePersona(hrWelcome.persona) ? hrWelcome.persona : "field"
      const roleLine = personaLabelHe(persona, hrWelcome.grantSystemAdmin === true)
      const text = `שלום ${name}, הכנתי עבורך סביבת עבודה במרקר אופק עבור ${proj} (${roleLine}).\n\n${hrWelcome.rulesBrief}`
      return [
        ...prev,
        {
          id: "hr-welcome-marker",
          role: "assistant",
          parts: [{ type: "text", text }],
        },
      ]
    })
    setOpen(true)
  }, [hrWelcomePending, hrWelcome, hostFirstName, pathname, setMessages])

  React.useEffect(() => {
    if (!pathname.startsWith(MARKER_ONBOARDING_SANDBOX_PATH)) return
    if (!pathname.startsWith("/marker-ofek")) return
    setMessages((prev) => {
      if (prev.some((m) => m.id === "diamond-sandbox-mission")) return prev
      const text =
        "משימת Diamond Qualification — בפרויקט הדמו בלבד:\n\n" +
        "שלב 1: הקימו ספק חדש (במסכי רכש אפשר להשתמש ב־F2 לפתיחת הקמה מהירה).\n" +
        "שלב 2: הגדירו לספק ניכוי מס במקור לפי חוקי הברזל בארגון (תוקף ואחוזים).\n" +
        "שלב 3: צרו הזמנת רכש ראשונה לפרויקט «אימון Diamond — ארגז חול» ושמרו בשדות ההזמנה ניכוי מס במקור תקין (אחוז גדול מ־0).\n\n" +
        "לאחר השמירה תאושרו אוטומטית לעבודה מלאה."
      return [
        ...prev,
        {
          id: "diamond-sandbox-mission",
          role: "assistant" as const,
          parts: [{ type: "text" as const, text }],
        },
      ]
    })
    setOpen(true)
  }, [pathname, setMessages])

  React.useEffect(() => {
    if (!open || oracleFetched) return
    setOracleFetched(true)
    void (async () => {
      const res = await getExecutiveOracleBrief()
      if (res.ok && res.bullets.length > 0) {
        setOracleBullets(res.bullets)
      } else {
        setOracleBullets(null)
      }
    })()
  }, [open, oracleFetched])

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" })
  }, [messages, status, open])

  React.useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort()
      } catch {
        /* ignore */
      }
      recognitionRef.current = null
    }
  }, [])

  function stopSpeechRecognition() {
    try {
      recognitionRef.current?.stop()
    } catch {
      /* ignore */
    }
    recognitionRef.current = null
    setListening(false)
  }

  function startSpeechRecognition() {
    const Ctor = getSpeechRecognitionConstructor()
    if (!Ctor || busy) return

    if (listening) {
      stopSpeechRecognition()
      return
    }

    speechPrefixRef.current = input
    speechFinalsRef.current = ""

    const recognition = new Ctor()
    recognition.lang = SPEECH_LANG
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        const piece = r[0]?.transcript ?? ""
        if (r.isFinal) {
          speechFinalsRef.current += piece
        } else {
          interim += piece
        }
      }
      const prefix = speechPrefixRef.current
      const finals = speechFinalsRef.current
      setInput(prefix + finals + interim)
    }

    recognition.onerror = () => {
      recognitionRef.current = null
      setListening(false)
    }

    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
      setListening(true)
    } catch {
      recognitionRef.current = null
      setListening(false)
    }
  }

  function handleSend() {
    const text = input.trim()
    if (!text || busy) return

    if (listening) {
      stopSpeechRecognition()
    }

    void sendMessage({ text })
    setInput("")
  }

  return (
    <div
      className={cn(
        "fixed z-50 flex flex-col items-start gap-3 print:hidden",
        splitDocked
          ? "bottom-6 start-[max(0.5rem,calc(50vw-0.5rem))] w-[min(calc(100vw-1rem),calc(50vw-1rem))] sm:bottom-8"
          : "bottom-4 start-4 sm:bottom-6 sm:start-6"
      )}
      dir="rtl"
    >
      {open ? (
        <Card
          className={cn(
            "flex h-[min(560px,calc(100dvh-7rem))] flex-col overflow-hidden border-slate-100 bg-white shadow-xl ring-1 ring-slate-100",
            splitDocked
              ? "w-full max-w-none"
              : "w-[min(100vw-2rem,400px)] border-border/80 bg-card/95 shadow-2xl shadow-black/40 ring-white/10 backdrop-blur-xl supports-[backdrop-filter]:bg-card/90"
          )}
        >
          <CardHeader className="border-b border-slate-100 bg-white p-3 pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-950/10 text-indigo-950 ring-1 ring-indigo-950/15">
                  <Bot className="size-5" aria-hidden />
                </span>
                <CardTitle className="text-base font-semibold leading-tight text-indigo-950">
                  עוזר חכם — ניתוח פיננסי
                </CardTitle>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {ws && pathname.startsWith("/marker-ofek") && ws.splitView ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className={cn(
                      "text-muted-foreground hover:text-foreground",
                      ws.assistantSplitDocked &&
                        "bg-indigo-950 text-white hover:bg-indigo-900 hover:text-white"
                    )}
                    title="עיגון לצד אזור הגלישה (תצוגה מפוצלת)"
                    aria-pressed={ws.assistantSplitDocked}
                    onClick={() => ws.setAssistantSplitDocked(!ws.assistantSplitDocked)}
                  >
                    <Columns2 className="size-4" aria-hidden />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setOpen(false)}
                  aria-label="סגירת הצ'אט"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="min-h-0 flex-1 px-0 pb-0 pt-0">
            <div
              ref={scrollRef}
              className="h-[min(380px,calc(100dvh-14rem))] overflow-y-auto overscroll-contain px-4 py-4"
            >
              <div className="space-y-3">
                {messages.length === 0 && !busy ? (
                  <div className="space-y-3 text-start text-sm leading-relaxed text-muted-foreground">
                    {oracleBullets && oracleBullets.length > 0 ? (
                      <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5 text-indigo-950">
                        <p className="text-xs font-semibold text-indigo-900">
                          {hostFirstName
                            ? `${hostFirstName}, שלוש נקודות מפתח מהדשבורד הפיננסי:`
                            : "שלוש נקודות מפתח מהדשבורד הפיננסי:"}
                        </p>
                        <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-indigo-950/90">
                          {oracleBullets.map((b) => (
                            <li key={b}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <p className="text-center">
                      שאלו על מע״מ לפי פרויקט, רווח שטח מול רווח טעון, עומס הנהלה,
                      או הערכת תשלום לספק אחרי ניכוי במקור — בנוסף לנכס ולקריאות.
                    </p>
                  </div>
                ) : null}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "flex w-full",
                      m.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[min(100%,280px)] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "border border-border/60 bg-muted/60 text-foreground"
                      )}
                    >
                      {m.parts.map((part, index) =>
                        part.type === "text" ? (
                          <span key={`${m.id}-p-${index}`}>
                            {m.role === "assistant"
                              ? renderAssistantMessageText(part.text)
                              : part.text}
                          </span>
                        ) : null
                      )}
                    </div>
                  </div>
                ))}
                {status === "submitted" ? (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-muted/40 px-4 py-3 text-muted-foreground">
                      <Loader2
                        className="size-4 shrink-0 animate-spin"
                        aria-hidden
                      />
                      <span className="text-xs">העוזר כותב…</span>
                    </div>
                  </div>
                ) : null}
                {error ? (
                  <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
                    <p>
                      {hostFirstName
                        ? `${hostFirstName}, משהו נתקע בדרך — נסו שוב בעוד רגע, או בדקו את החיבור.`
                        : "משהו נתקע בדרך — נסו שוב בעוד רגע."}
                    </p>
                    <button
                      type="button"
                      className="mt-1 underline underline-offset-2"
                      onClick={() => clearError()}
                    >
                      הבנתי, סגירה
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-2 border-t border-border/60 bg-muted/10 p-3">
            {hrWelcomePending && hrWelcome ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full border-slate-200 bg-white text-[12px] text-slate-800 hover:bg-slate-50"
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    const res = await completeHrConciergeWelcome()
                    if (res.ok) {
                      toast.success("נשמר — ברוכים הבאים למרקר אופק.")
                      router.refresh()
                    } else {
                      toast.error(res.error)
                    }
                  })()
                }}
              >
                סיימתי את סיור הקליטה
              </Button>
            ) : null}
            <form
              className="flex w-full gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                handleSend()
              }}
            >
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="הקלידו הודעה…"
                disabled={busy}
                readOnly={listening}
                className="min-w-0 flex-1 border-border/60 bg-background/80 read-only:opacity-95"
                autoComplete="off"
              />
              {speechSupported ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={cn(
                    "shrink-0 border-border/60",
                    listening &&
                      "animate-pulse border-destructive/60 bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive"
                  )}
                  disabled={busy}
                  onClick={startSpeechRecognition}
                  aria-pressed={listening}
                  aria-label={
                    listening ? "עצירת ההקלטה" : "הקלטה קולית בעברית"
                  }
                  title={listening ? "לחצו לעצירה" : "הקלטה קולית (עברית)"}
                >
                  <Mic className="size-4" aria-hidden />
                </Button>
              ) : null}
              <Button
                type="submit"
                size="icon"
                className="shrink-0"
                disabled={busy || !input.trim()}
                aria-label="שליחה"
              >
                <Send className="size-4" />
              </Button>
            </form>
          </CardFooter>
        </Card>
      ) : null}

      <Button
        type="button"
        size="icon-lg"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "!h-14 !w-14 !min-h-14 !min-w-14 rounded-full p-0 shadow-lg shadow-primary/25",
          "bg-gradient-to-br from-primary to-primary/80",
          "ring-2 ring-primary/30 ring-offset-2 ring-offset-background",
          "hover:from-primary/95 hover:to-primary/75 hover:shadow-xl hover:shadow-primary/30",
          "focus-visible:ring-2 focus-visible:ring-ring"
        )}
        aria-expanded={open}
        aria-label={open ? "סגירת עוזר חכם" : "פתיחת עוזר חכם"}
      >
        {open ? (
          <X className="size-6 text-primary-foreground" />
        ) : (
          <Sparkles className="size-6 text-primary-foreground" />
        )}
      </Button>
    </div>
  )
}
