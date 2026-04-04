"use client"

import * as React from "react"
import Link from "next/link"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { Loader2, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

function renderMessageParts(message: UIMessage): React.ReactNode {
  return message.parts.map((part, i) => {
    if (part.type === "text") {
      return (
        <span key={`${message.id}-t-${i}`} className="whitespace-pre-wrap">
          {part.text}
        </span>
      )
    }
    if (typeof part.type === "string" && part.type.startsWith("tool-")) {
      const p = part as Record<string, unknown>
      const out = p.output ?? p
      return (
        <pre
          key={`${message.id}-tool-${i}`}
          className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-100 bg-slate-50/90 p-2 font-mono text-[10px] leading-relaxed text-slate-700"
        >
          {JSON.stringify(out, null, 2)}
        </pre>
      )
    }
    return null
  })
}

export function AiUserSetupClient({
  projectOptions,
}: {
  projectOptions: { id: string; name: string }[]
}) {
  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/hr-onboarding-chat",
        body: { projectCatalog: projectOptions },
      }),
    [projectOptions]
  )

  const { messages, sendMessage, status, error, clearError, setMessages, stop } = useChat<UIMessage>({
    transport,
    messages: [
      {
        id: "hr-concierge-intro",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "שלום. אני קונסיירג׳ HR — אסכם שם מלא, אימייל, תפקיד (כספים / שטח / הנהלה / מנהל מערכת) ופרויקט אופציונלי, ואז אפעיל הקמה אוטומטית (הזמנה, הרשאות, שולחן עבודה, שיוך פרויקט). אפשר לכתוב בחופשיות, למשל: «צריך להוסיף את דני דנינו, dani@company.co.il, מהנדס שטח על פרויקט X».",
          },
        ],
      },
    ],
  })

  const [input, setInput] = React.useState("")
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const busy = status === "submitted" || status === "streaming"

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, status])

  React.useEffect(() => {
    if (!error) return
    toast.error(error.message ?? "שגיאת צ'אט")
  }, [error])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    void sendMessage({ text })
    setInput("")
  }

  function clearChat() {
    stop()
    clearError()
    setMessages([
      {
        id: "hr-concierge-intro-reset",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "השיחה אופסה. תארו את המשתמש החדש — שם, אימייל, תפקיד ופרויקט (אם רלוונטי).",
          },
        ],
      },
    ])
  }

  return (
    <div dir="rtl" className="mx-auto w-full max-w-3xl space-y-6 pb-12">
      <div>
        <Link
          href="/marker-ofek/settings"
          className="mb-2 inline-flex h-9 items-center rounded-md px-2 text-[13px] text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          ← חזרה להגדרות
        </Link>
        <h1 className="text-xl font-semibold text-indigo-950">קונסיירג׳ HR — הקמת משתמש</h1>
        <p className="mt-1 text-[13px] text-slate-600">
          שיחה חופשית; המודל מזהה תפקיד ופרויקט ומפעיל הקמה (שולחן עבודה, EmailBridge, סימניות, שיוך
          RLS לפרויקט).
        </p>
      </div>

      <Card className="border-slate-100 shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base text-indigo-950">שיחה</CardTitle>
              <CardDescription className="text-[12px]">
                {projectOptions.length} פרויקטים בקטלוג לזיהוי שם — או בחרו «ללא שיוך» במילים.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-slate-200 text-[12px]"
              disabled={busy}
              onClick={() => clearChat()}
            >
              <Trash2 className="ms-1 size-3.5" aria-hidden />
              איפוס שיחה
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div
            ref={scrollRef}
            className="max-h-[min(420px,55vh)] space-y-3 overflow-y-auto rounded-xl border border-slate-100 bg-white p-4"
          >
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
                    "max-w-[min(100%,520px)] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm",
                    m.role === "user"
                      ? "bg-indigo-950 text-white"
                      : "border border-slate-100 bg-slate-50/80 text-slate-900"
                  )}
                >
                  {renderMessageParts(m)}
                </div>
              </div>
            ))}
            {status === "submitted" ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-slate-500">
                  <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                  <span className="text-xs">המודל מעבד…</span>
                </div>
              </div>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="space-y-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="תארו את המשתמש החדש…"
              rows={3}
              disabled={busy}
              className="resize-none border-slate-200 bg-white text-[13px]"
            />
            <div className="flex justify-end gap-2">
              <Button type="submit" disabled={busy || !input.trim()} className="gap-1.5">
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" aria-hidden />
                )}
                שליחה
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
