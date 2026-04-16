"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { usePathname, useRouter } from "next/navigation"
import {
  Bot,
  Columns2,
  FileText,
  Loader2,
  Mic,
  Paperclip,
  Send,
  Square,
  Sparkles,
  Volume2,
  X,
} from "lucide-react"
import Draggable from "react-draggable"
import { toast } from "sonner"

import { useAiAssistantScreenContext } from "@/components/dashboard/ai-assistant-screen-context"
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

const AI_PANEL_POSITION_KEY = "ai-panel-position"
const MAX_CHAT_FILE_BYTES = 4 * 1024 * 1024
const FILE_SIZE_ERROR_MESSAGE =
  "הקובץ גדול מדי. העלו קבצים עד 4MB או השתמשו בצילום מסך."

function DotsSixHandle({ className }: { className?: string }) {
  const dots = [
    [5, 5],
    [5, 12],
    [5, 19],
    [12, 5],
    [12, 12],
    [12, 19],
  ] as const
  return (
    <svg
      className={cn("shrink-0 text-emerald-700/80", className)}
      width="14"
      height="22"
      viewBox="0 0 17 24"
      fill="currentColor"
      aria-hidden
    >
      {dots.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="1.75" />
      ))}
    </svg>
  )
}

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

function filesToFileList(files: File[]): FileList {
  const dt = new DataTransfer()
  for (const file of files) dt.items.add(file)
  return dt.files
}

function pickHebrewVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const hebrewVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("he"))
  if (hebrewVoices.length === 0) return null

  const scoreVoice = (voice: SpeechSynthesisVoice) => {
    let score = 0
    const normalizedName = voice.name.toLowerCase()
    if (voice.lang.toLowerCase() === "he-il") score += 4
    if (!voice.localService) score += 2
    if (
      normalizedName.includes("natural") ||
      normalizedName.includes("premium") ||
      normalizedName.includes("carmit")
    ) {
      score += 1
    }
    return score
  }

  return [...hebrewVoices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ?? null
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
  const screenCtx = useAiAssistantScreenContext()
  const splitDocked =
    Boolean(
      ws?.splitView &&
        ws.assistantSplitDocked &&
        pathname.startsWith("/marker-ofek")
    )
  const [open, setOpen] = React.useState(false)
  const [input, setInput] = React.useState("")
  const [attachments, setAttachments] = React.useState<File[]>([])
  const [fileError, setFileError] = React.useState<string | null>(null)
  const [speechSupported, setSpeechSupported] = React.useState(false)
  const [listening, setListening] = React.useState(false)
  const [speakingMessageId, setSpeakingMessageId] = React.useState<string | null>(null)
  const [oracleBullets, setOracleBullets] = React.useState<string[] | null>(null)
  const [oracleFetched, setOracleFetched] = React.useState(false)
  const [panelSavedPos, setPanelSavedPos] = React.useState({ x: 0, y: 0 })
  /** 0 = לפני קריאת localStorage; 1+ = אחרי — מאפשר defaultPosition נכון ב־Draggable */
  const [panelLayoutKey, setPanelLayoutKey] = React.useState(0)

  React.useLayoutEffect(() => {
    try {
      const raw = localStorage.getItem(AI_PANEL_POSITION_KEY)
      if (raw) {
        const j = JSON.parse(raw) as { x?: unknown; y?: unknown }
        if (Number.isFinite(j.x) && Number.isFinite(j.y)) {
          setPanelSavedPos({ x: Number(j.x), y: Number(j.y) })
        }
      }
    } catch {
      /* ignore */
    }
    setPanelLayoutKey((k) => k + 1)
  }, [])

  const chatTransport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: {
          screenContext:
            screenCtx?.digest && screenCtx.digest.trim() !== ""
              ? screenCtx.digest.trim()
              : undefined,
        },
      }),
    [screenCtx?.digest]
  )

  const { messages, sendMessage, status, error, clearError, setMessages } = useChat({
    transport: chatTransport,
  })

  const busy = status === "submitted" || status === "streaming"

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const panelNodeRef = React.useRef<HTMLDivElement>(null)
  const recognitionRef = React.useRef<SpeechRecognition | null>(null)
  const activeUtteranceRef = React.useRef<SpeechSynthesisUtterance | null>(null)
  /** טקסט שהיה בשדה בעת התחלת ההקלטה + תוצאות סופיות מצטברות */
  const speechPrefixRef = React.useRef("")
  const speechFinalsRef = React.useRef("")
  const previewUrls = React.useMemo(
    () =>
      attachments.map((file) =>
        file.type.startsWith("image/") ? URL.createObjectURL(file) : null
      ),
    [attachments]
  )

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

  React.useEffect(() => {
    return () => {
      for (const url of previewUrls) {
        if (url) URL.revokeObjectURL(url)
      }
    }
  }, [previewUrls])

  const stopSpeaking = React.useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return
    window.speechSynthesis.cancel()
    activeUtteranceRef.current = null
    setSpeakingMessageId(null)
  }, [])

  const speakMessage = React.useCallback(
    (messageId: string, text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return
      const normalizedText = text.trim()
      if (!normalizedText) return

      if (speakingMessageId === messageId) {
        stopSpeaking()
        return
      }

      const synth = window.speechSynthesis
      synth.cancel()

      const utterance = new SpeechSynthesisUtterance(normalizedText)
      utterance.lang = "he-IL"
      utterance.pitch = 1
      utterance.rate = 0.95

      const voice = pickHebrewVoice(synth.getVoices())
      if (voice) utterance.voice = voice

      utterance.onend = () => {
        setSpeakingMessageId((current) => (current === messageId ? null : current))
        activeUtteranceRef.current = null
      }
      utterance.onerror = () => {
        setSpeakingMessageId((current) => (current === messageId ? null : current))
        activeUtteranceRef.current = null
      }

      activeUtteranceRef.current = utterance
      setSpeakingMessageId(messageId)
      synth.speak(utterance)
    },
    [speakingMessageId, stopSpeaking]
  )

  React.useEffect(() => {
    stopSpeaking()
  }, [messages.length, stopSpeaking])

  React.useEffect(() => {
    return () => {
      stopSpeaking()
    }
  }, [stopSpeaking])

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    const oversizedFiles = files.filter((file) => file.size > MAX_CHAT_FILE_BYTES)
    const validFiles = files.filter((file) => {
      const isImage = file.type.startsWith("image/")
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
      return (isImage || isPdf) && file.size <= MAX_CHAT_FILE_BYTES
    })

    if (oversizedFiles.length > 0) {
      setFileError(FILE_SIZE_ERROR_MESSAGE)
      toast.error(FILE_SIZE_ERROR_MESSAGE)
    } else {
      setFileError(null)
    }

    if (validFiles.length > 0) {
      setAttachments((prev) => [...prev, ...validFiles])
    }

    e.target.value = ""
  }

  function removeAttachment(indexToRemove: number) {
    setAttachments((prev) => prev.filter((_, index) => index !== indexToRemove))
  }

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
    if ((!text && attachments.length === 0) || busy) return

    if (listening) {
      stopSpeechRecognition()
    }

    setFileError(null)
    void sendMessage({ text, files: filesToFileList(attachments) })
    setInput("")
    setAttachments([])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const cardClassName = cn(
    "flex h-[min(560px,calc(100dvh-7rem))] flex-col overflow-hidden border-slate-200/90 bg-white",
    splitDocked
      ? "w-full max-w-none shadow-xl ring-1 ring-slate-100"
      : "w-[min(100vw-2rem,400px)] shadow-2xl shadow-slate-900/15 ring-1 ring-emerald-200/40 backdrop-blur-xl supports-[backdrop-filter]:bg-white/95"
  )

  const headerTitleBlock = (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2",
        !splitDocked &&
          open &&
          "drag-handle cursor-grab touch-none rounded-lg px-1 py-0.5 hover:bg-emerald-50/80 active:cursor-grabbing"
      )}
    >
      {!splitDocked && open ? (
        <DotsSixHandle className="opacity-90" />
      ) : null}
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-950/10 text-emerald-950 ring-1 ring-emerald-900/15">
        <Bot className="size-5" aria-hidden />
      </span>
      <CardTitle className="text-base font-semibold leading-tight text-slate-900">
        עוזר חכם — ניתוח פיננסי
      </CardTitle>
    </div>
  )

  const assistantCard = (
    <Card className={cardClassName}>
      <CardHeader className="border-b border-emerald-100/90 bg-gradient-to-br from-emerald-50/90 to-white p-3 pb-3">
        <div className="flex items-center justify-between gap-2">
          {headerTitleBlock}
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
                      {m.role === "assistant" ? (
                        <div className="mb-1 flex justify-end">
                          <button
                            type="button"
                            className="inline-flex size-6 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-200/80 hover:text-slate-700"
                            onClick={() => {
                              const text = m.parts
                                .filter((part) => part.type === "text")
                                .map((part) => part.text)
                                .join("\n")
                              speakMessage(m.id, text)
                            }}
                            aria-label={
                              speakingMessageId === m.id
                                ? "עצירת הקראה"
                                : "הקראת תשובת העוזר"
                            }
                            title={
                              speakingMessageId === m.id
                                ? "עצירת הקראה"
                                : "השמעת תשובת העוזר"
                            }
                          >
                            {speakingMessageId === m.id ? (
                              <Square className="size-3.5" aria-hidden />
                            ) : (
                              <Volume2 className="size-3.5" aria-hidden />
                            )}
                          </button>
                        </div>
                      ) : null}
                      {m.parts.map((part, index) =>
                        part.type === "text" ? (
                          <span key={`${m.id}-p-${index}`}>
                            {m.role === "assistant"
                              ? renderAssistantMessageText(part.text)
                              : part.text}
                          </span>
                        ) : part.type === "file" ? (
                          <div
                            key={`${m.id}-file-${index}`}
                            className="mt-2 rounded-lg border border-slate-300/70 bg-white/70 px-2 py-1.5 text-[11px] text-slate-600"
                          >
                            קובץ מצורף
                          </div>
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
            {fileError ? (
              <div className="w-full rounded-lg border border-amber-500/50 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                {fileError}
              </div>
            ) : null}
            <form
              className="flex w-full gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                handleSend()
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,application/pdf"
                className="hidden"
                onChange={onFileSelect}
              />
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
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 border-border/60"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                aria-label="צירוף קובץ"
                title="צירוף תמונה או PDF"
              >
                <Paperclip className="size-4" aria-hidden />
              </Button>
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
                disabled={busy || (!input.trim() && attachments.length === 0)}
                aria-label="שליחה"
              >
                <Send className="size-4" />
              </Button>
            </form>
            {attachments.length > 0 ? (
              <div className="flex w-full flex-wrap gap-2">
                {attachments.map((file, index) => {
                  const previewUrl = previewUrls[index]
                  return (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/70 px-2 py-1.5"
                    >
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt={file.name}
                          className="size-9 rounded-md border border-slate-200 object-cover"
                        />
                      ) : (
                        <span className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-slate-600">
                          <FileText className="size-4" aria-hidden />
                        </span>
                      )}
                      <div className="max-w-[150px]">
                        <p className="truncate text-[11px] font-medium text-slate-700">{file.name}</p>
                        <p className="text-[10px] text-slate-500">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <button
                        type="button"
                        className="inline-flex size-6 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                        onClick={() => removeAttachment(index)}
                        aria-label={`הסרת קובץ ${file.name}`}
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </CardFooter>
    </Card>
  )

  const fabButton = (
    <Button
      type="button"
      size="icon-lg"
      onClick={() => setOpen((o) => !o)}
      className={cn(
        "!h-14 !w-14 !min-h-14 !min-w-14 rounded-full p-0 shadow-lg shadow-emerald-600/25",
        "bg-gradient-to-br from-emerald-600 to-emerald-700",
        "ring-2 ring-emerald-500/35 ring-offset-2 ring-offset-background",
        "hover:from-emerald-600/95 hover:to-emerald-700/90 hover:shadow-xl hover:shadow-emerald-600/30",
        "focus-visible:ring-2 focus-visible:ring-ring",
        !open && !splitDocked && "drag-handle cursor-grab touch-none active:cursor-grabbing"
      )}
      aria-expanded={open}
      aria-label={open ? "סגירת עוזר חכם" : "פתיחת עוזר חכם"}
    >
      {open ? (
        <X className="size-6 text-white" />
      ) : (
        <Sparkles className="size-6 text-white" />
      )}
    </Button>
  )

  if (splitDocked) {
    return (
      <div
        className="fixed z-50 flex flex-col items-start gap-3 print:hidden"
        dir="rtl"
        style={{
          bottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))",
          insetInlineStart: "max(0.5rem, calc(50vw - 0.5rem))",
          width: "min(calc(100vw - 1rem), calc(50vw - 1rem))",
        }}
      >
        {open ? assistantCard : null}
        {fabButton}
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 pointer-events-none print:hidden"
      dir="rtl"
      aria-hidden={false}
    >
      <Draggable
        key={panelLayoutKey}
        handle=".drag-handle"
        defaultPosition={panelSavedPos}
        nodeRef={panelNodeRef}
        bounds="parent"
        enableUserSelectHack={false}
        onStop={(_, data) => {
          try {
            const next = { x: data.x, y: data.y }
            localStorage.setItem(AI_PANEL_POSITION_KEY, JSON.stringify(next))
            setPanelSavedPos(next)
          } catch {
            /* ignore */
          }
        }}
      >
        <div
          ref={panelNodeRef}
          className="pointer-events-auto absolute bottom-6 start-6 flex flex-col items-start gap-3"
        >
          {open ? assistantCard : null}
          {fabButton}
        </div>
      </Draggable>
    </div>
  )
}
