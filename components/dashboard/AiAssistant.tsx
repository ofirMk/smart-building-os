"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { Bot, Loader2, Mic, Send, Sparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getSpeechRecognitionConstructor } from "@/lib/speech-recognition"
import { cn } from "@/lib/utils"

const SPEECH_LANG = "he-IL"

export function AiAssistant() {
  const [open, setOpen] = React.useState(false)
  const [input, setInput] = React.useState("")
  const [speechSupported, setSpeechSupported] = React.useState(false)
  const [listening, setListening] = React.useState(false)

  const { messages, sendMessage, status, error, clearError } = useChat({
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
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
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
      className="fixed bottom-4 left-4 z-50 flex flex-col items-start gap-3 print:hidden sm:bottom-6 sm:left-6"
      dir="rtl"
    >
      {open ? (
        <Card
          className={cn(
            "flex h-[min(560px,calc(100dvh-7rem))] w-[min(100vw-2rem,400px)] flex-col overflow-hidden",
            "border-border/80 bg-card/95 shadow-2xl shadow-black/40 ring-1 ring-white/10 backdrop-blur-xl",
            "supports-[backdrop-filter]:bg-card/90"
          )}
        >
          <CardHeader className="border-b border-border/60 bg-muted/20 p-3 pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
                  <Bot className="size-5" aria-hidden />
                </span>
                <CardTitle className="text-base font-semibold leading-tight">
                  עוזר חכם למנהל
                </CardTitle>
              </div>
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
          </CardHeader>

          <CardContent className="min-h-0 flex-1 px-0 pb-0 pt-0">
            <div
              ref={scrollRef}
              className="h-[min(380px,calc(100dvh-14rem))] overflow-y-auto overscroll-contain px-4 py-4"
            >
              <div className="space-y-3">
                {messages.length === 0 && !busy ? (
                  <p className="text-center text-sm leading-relaxed text-muted-foreground">
                    שאלו כל דבר על ניהול הנכס, הקריאות או הדיירים — או הקלידו
                    הודעה לשליחה.
                  </p>
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
                          <span key={`${m.id}-p-${index}`}>{part.text}</span>
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
                    <p>אירעה שגיאה. נסו שוב.</p>
                    <button
                      type="button"
                      className="mt-1 underline underline-offset-2"
                      onClick={() => clearError()}
                    >
                      סגירה
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </CardContent>

          <CardFooter className="border-t border-border/60 bg-muted/10 p-3">
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
