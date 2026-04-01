"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import type { FileUIPart } from "ai"
import { Camera, Loader2, Send, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () =>
      resolve(typeof r.result === "string" ? r.result : "")
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

async function fileToUIPart(file: File): Promise<FileUIPart> {
  const url = await readFileAsDataUrl(file)
  return {
    type: "file",
    url,
    mediaType: file.type || "image/jpeg",
    filename: file.name,
  }
}

export default function ChatPage() {
  const [input, setInput] = React.useState("")
  const [imageFile, setImageFile] = React.useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const { messages, sendMessage, status, error, clearError } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  })

  const busy = status === "submitted" || status === "streaming"
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [messages, status])

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function clearImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setImageFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setImageFile(f)
    setPreviewUrl(URL.createObjectURL(f))
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if ((!text && !imageFile) || busy) return

    let files: FileUIPart[] | undefined
    if (imageFile) {
      files = [await fileToUIPart(imageFile)]
    }

    const userText = text || (imageFile ? "נא לנתח את התמונה המצורפת." : "")

    if (files?.length) {
      void sendMessage({ text: userText, files })
    } else {
      void sendMessage({ text: userText })
    }

    setInput("")
    clearImage()
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col gap-4 pb-8" dir="rtl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">צ&apos;אט AI — ניהול נכסים</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          שלחו טקסט או צרפו תמונה לניתוח חזותי ופתיחת קריאות תחזוקה.
        </p>
      </div>

      <div
        ref={scrollRef}
        className="min-h-[min(420px,50vh)] flex-1 overflow-y-auto rounded-xl border border-border/60 bg-muted/20 p-4"
      >
        <div className="space-y-3">
          {messages.length === 0 && !busy ? (
            <p className="text-center text-sm text-muted-foreground">
              התחילו בשיחה — ניתן לצרף צילום של לוח חשמל, גנרטור או תקלה נראית לעין.
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
                  "max-w-[min(100%,520px)] space-y-2 rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border border-border/60 bg-card text-foreground"
                )}
              >
                {m.parts.map((part, index) => {
                  if (part.type === "text") {
                    return (
                      <p key={`${m.id}-t-${index}`} className="whitespace-pre-wrap">
                        {part.text}
                      </p>
                    )
                  }
                  if (part.type === "file") {
                    const isImage =
                      part.mediaType?.startsWith("image/") ||
                      /\.(png|jpe?g|gif|webp)$/i.test(part.filename ?? "")
                    if (isImage && part.url) {
                      return (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={`${m.id}-f-${index}`}
                          src={part.url}
                          alt={part.filename ?? "העלאה"}
                          className="max-h-48 max-w-full rounded-lg border border-white/20 object-contain"
                        />
                      )
                    }
                    return (
                      <p key={`${m.id}-f-${index}`} className="text-xs opacity-80">
                        קובץ: {part.filename ?? "קובץ"}
                      </p>
                    )
                  }
                  return null
                })}
              </div>
            </div>
          ))}
          {status === "submitted" ? (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-muted/40 px-4 py-3 text-muted-foreground">
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                <span className="text-xs">העוזר מנתח…</span>
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

      {previewUrl ? (
        <div className="relative flex max-w-md items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="תצוגה מקדימה"
            className="max-h-32 max-w-[200px] rounded-md object-contain"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            onClick={clearImage}
            aria-label="הסרת תמונה"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      <form
        className="flex w-full max-w-3xl flex-wrap items-end gap-2"
        onSubmit={handleSend}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickImage}
          aria-hidden
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0 border-border/60"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          aria-label="העלאת תמונה"
          title="צילום או תמונה מהמכשיר"
        >
          <Camera className="size-4" aria-hidden />
        </Button>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="הקלידו הודעה…"
          disabled={busy}
          className="min-w-0 flex-1 border-border/60 bg-background"
          autoComplete="off"
        />
        <Button
          type="submit"
          size="icon"
          className="shrink-0"
          disabled={busy || (!input.trim() && !imageFile)}
          aria-label="שליחה"
        >
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  )
}
