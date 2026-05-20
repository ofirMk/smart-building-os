"use client"

/**
 * Sprint T15 — Holden AI Copilot chat surface (UI).
 *
 * A Claude-style chat:
 *   - User bubbles aligned end (right in RTL).
 *   - Holden bubbles aligned start (left in RTL) with avatar + sparkle accent.
 *   - Streaming-style typing indicator (3-dot bouncing skeleton ~1000 ms) so
 *     each answer "feels" inferred from live data, not pre-canned.
 *   - Inline action CTA + insight chips inside the assistant bubble.
 *   - Suggested prompt chips above the composer for instant demo flow.
 *
 * Data layer is `askHoldenAction` (smart keyword router); see T15 actions
 * for the contract. UI is purely client-side state — no DB writes.
 */

import * as React from "react"
import Link from "next/link"
import {
  ArrowLeft,
  CornerDownLeft,
  Sparkles,
  User,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  askHoldenAction,
  type HoldenInsightChip,
  type HoldenResponse,
} from "@/lib/marker-ofek/holden/t15-holden-actions"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type Sender = "user" | "holden"

interface ChatTurn {
  id: string
  sender: Sender
  text: string
  response?: HoldenResponse
  isError?: boolean
}

const SUGGESTED_PROMPTS: string[] = [
  "מי הקבלן הזול במכרז?",
  "הצג לי חריגות תקציב",
  "סקירת מנכ״ל כללית",
  "הראה לי את פורטל הספקים",
  "מה המצב של פרק השלד?",
]

const TYPING_DELAY_MS = 1000

// ---------------------------------------------------------------------------
// Insight chip
// ---------------------------------------------------------------------------

function InsightPill({ chip }: { chip: HoldenInsightChip }) {
  const tones: Record<HoldenInsightChip["tone"], string> = {
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    violet: "border-violet-200 bg-violet-50 text-violet-900",
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        tones[chip.tone],
      )}
    >
      {chip.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Bubble
// ---------------------------------------------------------------------------

function HoldenAvatar({ small }: { small?: boolean }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 via-indigo-700 to-slate-900 text-white shadow-md ring-1 ring-violet-500/40",
        small ? "size-7" : "size-9",
      )}
      aria-hidden
    >
      <Sparkles className={small ? "size-3.5" : "size-4"} />
    </span>
  )
}

function UserAvatar() {
  return (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-sm ring-1 ring-slate-700/30"
      aria-hidden
    >
      <User className="size-4" />
    </span>
  )
}

function ChatBubble({
  turn,
  onPrompt,
}: {
  turn: ChatTurn
  onPrompt: (text: string) => void
}) {
  const isUser = turn.sender === "user"
  if (isUser) {
    return (
      <div className="flex flex-row-reverse items-start gap-2.5">
        <UserAvatar />
        <div
          className={cn(
            "max-w-[85%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-3 text-sm text-white shadow-sm sm:max-w-[70%]",
          )}
        >
          {turn.text}
        </div>
      </div>
    )
  }

  // Holden bubble
  return (
    <div className="flex items-start gap-2.5">
      <HoldenAvatar />
      <div className="flex max-w-[85%] flex-col gap-2 sm:max-w-[80%]">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-700/80">
          Holden · AI Copilot
        </div>
        <div
          className={cn(
            "whitespace-pre-line rounded-2xl rounded-tl-sm border px-4 py-3 text-sm shadow-sm",
            turn.isError
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : "border-violet-200/70 bg-gradient-to-br from-white to-violet-50/40 text-foreground",
          )}
        >
          {turn.text}
        </div>

        {turn.response?.insightChips && turn.response.insightChips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {turn.response.insightChips.map((c, i) => (
              <InsightPill key={`${c.label}-${i}`} chip={c} />
            ))}
          </div>
        ) : null}

        {turn.response?.actionLink ? (
          <Button
            size="sm"
            className="w-fit gap-1.5 bg-gradient-to-l from-violet-600 to-indigo-700 text-white shadow-sm hover:from-violet-700 hover:to-indigo-800"
            render={<Link href={turn.response.actionLink.href} />}
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {turn.response.actionLink.label}
          </Button>
        ) : null}

        {turn.response?.followUps && turn.response.followUps.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {turn.response.followUps.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onPrompt(p)}
                className="rounded-full border border-violet-200 bg-white px-3 py-1 text-[11px] font-medium text-violet-800 shadow-sm transition-colors hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                {p}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Typing indicator
// ---------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5">
      <HoldenAvatar />
      <div className="flex flex-col gap-1.5">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-700/80">
          Holden מנתח את הנתונים…
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-violet-200/70 bg-gradient-to-br from-white to-violet-50/40 px-4 py-3 shadow-sm">
          <span
            className="size-2 animate-bounce rounded-full bg-violet-500 [animation-delay:-0.3s]"
            aria-hidden
          />
          <span
            className="size-2 animate-bounce rounded-full bg-violet-500 [animation-delay:-0.15s]"
            aria-hidden
          />
          <span
            className="size-2 animate-bounce rounded-full bg-violet-500"
            aria-hidden
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function HoldenChat() {
  const [turns, setTurns] = React.useState<ChatTurn[]>([
    {
      id: "welcome",
      sender: "holden",
      text:
        "שלום, אני הולדן — מנוע ה-AI Copilot של מרקר אופק. " +
        "אני יכול לקרוא את הנתונים הפעילים של המערכת ולתת תובנות מיידיות " +
        "עם קישור למסך הרלוונטי. שאל אותי על מכרזים, תקציב, חריגות, " +
        "פורטפוליו, או על פורטל הספקים — או לחץ על אחת ההמלצות למטה כדי " +
        "להתחיל מהר.",
      response: {
        intent: "greeting",
        text: "",
        followUps: SUGGESTED_PROMPTS.slice(0, 3),
        insightChips: [
          { label: "Holden v0.1", tone: "violet" },
          { label: "Demo Mode", tone: "amber" },
        ],
      },
    },
  ])
  const [input, setInput] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const composerRef = React.useRef<HTMLTextAreaElement | null>(null)

  // Auto-scroll on new turn / typing flip.
  React.useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" })
  }, [turns, pending])

  const send = React.useCallback(async (rawText: string) => {
    const text = rawText.trim()
    if (text.length === 0 || pending) return

    const userTurn: ChatTurn = {
      id: `u-${Date.now()}`,
      sender: "user",
      text,
    }
    setTurns((prev) => [...prev, userTurn])
    setInput("")
    setPending(true)

    // Artificial think-time so the chat *feels* like it's reasoning over
    // live system data. The action itself returns near-instantly.
    const [, res] = await Promise.all([
      new Promise<void>((resolve) => setTimeout(resolve, TYPING_DELAY_MS)),
      askHoldenAction(text),
    ])

    if (!res.ok) {
      setTurns((prev) => [
        ...prev,
        {
          id: `h-${Date.now()}`,
          sender: "holden",
          text: res.error,
          isError: true,
        },
      ])
    } else {
      setTurns((prev) => [
        ...prev,
        {
          id: `h-${Date.now()}`,
          sender: "holden",
          text: res.response.text,
          response: res.response,
        },
      ])
    }
    setPending(false)
    composerRef.current?.focus()
  }, [pending])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void send(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void send(input)
    }
  }

  return (
    <div
      dir="rtl"
      className="flex h-full min-h-0 w-full flex-col gap-4 px-4 pb-4 pt-5 sm:px-6"
    >
      {/* Header */}
      <header className="flex flex-col gap-2 rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <HoldenAvatar />
          <div className="leading-tight">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-violet-700/80">
              Sprint T15 · ERP Brain
            </p>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              הולדן — מנוע ה-AI Copilot של מרקר אופק
            </h1>
          </div>
          <span className="ms-auto inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900">
            <Sparkles className="size-3.5" aria-hidden />
            Demo Mode
          </span>
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          Holden מנתח חיים את הנתונים שלך לאורך מודולי הפלטפורמה — מכרזים,
          תקציב, פורטפוליו ופורטל ספקים — ומחזיר תובנות מיידיות עם קישור
          ישיר למסך הפעולה.
        </p>
      </header>

      {/* Chat scroll */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-border/70 p-0 shadow-sm">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-5 sm:px-6"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {turns.map((turn) => (
              <ChatBubble
                key={turn.id}
                turn={turn}
                onPrompt={(t) => void send(t)}
              />
            ))}
            {pending ? <TypingIndicator /> : null}
          </div>
        </div>

        {/* Suggested prompts */}
        <div className="border-t border-border/60 bg-muted/30 px-4 py-2.5 sm:px-6">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            הצעות מהירות
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                disabled={pending}
                onClick={() => void send(p)}
                className={cn(
                  "rounded-full border border-violet-200 bg-white px-3 py-1 text-[11.5px] font-medium text-violet-800 shadow-sm transition-colors",
                  "hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Composer */}
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 border-t border-border/60 bg-card px-4 py-3 sm:px-6"
        >
          <div className="relative flex-1">
            <textarea
              ref={composerRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={1500}
              placeholder="שאל את הולדן… (Enter לשליחה · Shift+Enter שורה חדשה)"
              className={cn(
                "block min-h-11 w-full resize-none rounded-xl border border-border bg-background px-4 py-3 pe-12 text-sm shadow-sm",
                "placeholder:text-muted-foreground/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
              )}
              dir="rtl"
              autoComplete="off"
              aria-label="הקלד שאלה להולדן"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground/70"
            >
              <CornerDownLeft className="size-3.5" />
            </span>
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={pending || input.trim().length === 0}
            className={cn(
              "h-11 gap-1.5 rounded-xl bg-gradient-to-l from-violet-600 to-indigo-700 px-5 font-semibold text-white shadow-sm",
              "hover:from-violet-700 hover:to-indigo-800",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <Sparkles className="size-4" aria-hidden />
            שלח
          </Button>
        </form>
      </Card>
    </div>
  )
}
