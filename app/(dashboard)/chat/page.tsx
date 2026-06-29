"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import {
  Bot,
  FileText,
  Loader2,
  Paperclip,
  SendHorizontal,
  Square,
  Sparkles,
  User2,
  Volume2,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const MAX_CHAT_FILE_BYTES = 4 * 1024 * 1024
const FILE_SIZE_ERROR_MESSAGE =
  "הקובץ גדול מדי. העלו קבצים עד 4MB או השתמשו בצילום מסך."

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
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

export default function EnterpriseChatPage() {
  const [input, setInput] = React.useState("")
  const [attachments, setAttachments] = React.useState<File[]>([])
  const [fileError, setFileError] = React.useState<string | null>(null)
  const [speakingMessageId, setSpeakingMessageId] = React.useState<string | null>(null)
  const [startedAt] = React.useState(() => new Date())
  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const activeUtteranceRef = React.useRef<SpeechSynthesisUtterance | null>(null)

  const { messages, sendMessage, status, error, clearError } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  })

  const busy = status === "submitted" || status === "streaming"
  const previewUrls = React.useMemo(
    () =>
      attachments.map((file) =>
        file.type.startsWith("image/") ? URL.createObjectURL(file) : null
      ),
    [attachments]
  )

  React.useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [messages, status])

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

  function submit(e?: React.FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if (busy || (!text && attachments.length === 0)) return
    setFileError(null)
    const files = filesToFileList(attachments)
    void sendMessage({ text, files })
    setInput("")
    setAttachments([])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card" dir="rtl">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-4 rounded-2xl border border-border bg-gradient-to-l from-slate-900 to-slate-950 p-4 shadow-2xl shadow-slate-950/30">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-1.5 rounded-full border border-cyan-700/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-300">
                <Sparkles className="size-3.5" aria-hidden />
                Holden Group AI Console
              </p>
              <h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                עוזר חכם ארגוני
              </h1>
              <p className="mt-1 text-sm text-slate-300">
                שאלות תפעול, פיננסים, אוטומציה וניתוח מהיר בזמן אמת.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/80 px-3 py-2 text-[11px] text-muted-foreground">
              התחיל ב-{formatTime(startedAt)}
            </div>
          </div>
        </div>

        <div className="flex min-h-[65vh] flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div
            ref={viewportRef}
            className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5"
          >
            {messages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-muted/30 p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  כתבו הודעה כדי להתחיל צ׳אט עם מודל OpenAI דרך ה-API החדש.
                </p>
              </div>
            ) : null}

            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex w-full",
                  message.role === "user" ? "justify-start" : "justify-end"
                )}
              >
                <div
                  className={cn(
                    "max-w-[min(100%,720px)] rounded-2xl border px-4 py-3 text-sm leading-relaxed",
                    message.role === "user"
                      ? "border-cyan-800/60 bg-cyan-500/10 text-cyan-50"
                      : "border-border bg-muted text-foreground"
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      {message.role === "user" ? (
                        <User2 className="size-3.5" aria-hidden />
                      ) : (
                        <Bot className="size-3.5" aria-hidden />
                      )}
                      {message.role === "user" ? "את/ה" : "AI"}
                    </div>
                    {message.role === "assistant" ? (
                      <button
                        type="button"
                        className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
                        onClick={() => {
                          const text = message.parts
                            .filter((part) => part.type === "text")
                            .map((part) => part.text)
                            .join("\n")
                          speakMessage(message.id, text)
                        }}
                        aria-label={
                          speakingMessageId === message.id
                            ? "עצירת הקראה"
                            : "הקראת תשובת העוזר"
                        }
                        title={
                          speakingMessageId === message.id
                            ? "עצירת הקראה"
                            : "השמעת תשובת העוזר"
                        }
                      >
                        {speakingMessageId === message.id ? (
                          <Square className="size-3.5" aria-hidden />
                        ) : (
                          <Volume2 className="size-3.5" aria-hidden />
                        )}
                      </button>
                    ) : null}
                  </div>

                  {message.parts.map((part, index) =>
                    part.type === "text" ? (
                      <p key={`${message.id}-${index}`} className="whitespace-pre-wrap">
                        {part.text}
                      </p>
                    ) : part.type === "file" ? (
                      <div
                        key={`${message.id}-${index}`}
                        className="mt-2 rounded-lg border border-border/60 bg-muted/40 p-2"
                      >
                        <p className="text-[11px] text-muted-foreground">קובץ מצורף</p>
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            ))}

            {busy ? (
              <div className="flex justify-end">
                <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  AI מייצר תשובה...
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                <p>שגיאה בחיבור לשרת הצ׳אט. ודאו שקיים `OPENAI_API_KEY` תקין.</p>
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

          <form
            onSubmit={submit}
            className="border-t border-border bg-background/95 p-3 sm:p-4"
          >
            {fileError ? (
              <div className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                {fileError}
              </div>
            ) : null}
            {attachments.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((file, index) => {
                  const previewUrl = previewUrls[index]

                  return (
                    <div
                      key={`${file.name}-${index}`}
                      className="group relative flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5"
                    >
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt={file.name}
                          className="size-10 rounded-md border border-border object-cover"
                        />
                      ) : (
                        <span className="inline-flex size-10 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                          <FileText className="size-4" aria-hidden />
                        </span>
                      )}
                      <div className="max-w-[180px]">
                        <p className="truncate text-[11px] font-medium text-foreground">{file.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <button
                        type="button"
                        className="ms-1 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
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

            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,application/pdf"
                className="hidden"
                onChange={onFileSelect}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="h-11 border-border bg-card text-foreground hover:bg-accent"
                aria-label="צירוף קובץ"
              >
                <Paperclip className="size-4" aria-hidden />
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="הקלידו הודעה..."
                disabled={busy}
                autoComplete="off"
                className="h-11 border-border bg-background text-foreground placeholder:text-muted-foreground"
              />
              <Button
                type="submit"
                disabled={busy || (!input.trim() && attachments.length === 0)}
                className="h-11 min-w-11 bg-cyan-600 text-white hover:bg-cyan-500"
                aria-label="שליחה"
              >
                <SendHorizontal className="size-4" aria-hidden />
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
