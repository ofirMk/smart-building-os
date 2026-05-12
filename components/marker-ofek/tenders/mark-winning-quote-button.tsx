"use client"

/**
 * Sprint T1 — Mark Winning Quote Button (MedaTech §7.3.5).
 *
 * Renders inline next to a quote row. Clicking it triggers the server action
 * that:
 *   • Demotes any other winning quote in the same sub-tender.
 *   • Promotes this quote (status=ACCEPTED, is_winner=true).
 *   • Promotes its non-zero-priced lines as winning lines.
 *
 * Idempotent — re-clicking on an already-winning quote re-applies the same
 * state without side-effects.
 */

import { Trophy } from "lucide-react"
import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { markWinningQuoteAction } from "@/lib/marker-ofek/tenders/t1-tender-engine-actions"
import { cn } from "@/lib/utils"

interface MarkWinningQuoteButtonProps {
  quoteId: string
  isAlreadyWinner?: boolean
  variant?: "default" | "outline" | "ghost" | "secondary"
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
  onSuccess?: (linesWon: number, othersDemoted: number) => void
}

export function MarkWinningQuoteButton({
  quoteId,
  isAlreadyWinner = false,
  variant = "default",
  size = "sm",
  className,
  onSuccess,
}: MarkWinningQuoteButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<
    | { kind: "ok"; linesWon: number; othersDemoted: number }
    | { kind: "err"; message: string }
    | null
  >(null)

  const handleClick = () => {
    setFeedback(null)
    startTransition(async () => {
      const result = await markWinningQuoteAction({ quoteId })
      if (result.ok) {
        setFeedback({
          kind: "ok",
          linesWon: result.linesWon,
          othersDemoted: result.othersDemoted,
        })
        onSuccess?.(result.linesWon, result.othersDemoted)
      } else {
        setFeedback({ kind: "err", message: result.error })
      }
    })
  }

  return (
    <div className={cn("inline-flex flex-col items-end gap-1", className)}>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleClick}
        disabled={isPending}
        aria-pressed={isAlreadyWinner}
      >
        <Trophy className="ms-1 h-4 w-4" aria-hidden />
        {isPending
          ? "מסמן זוכה…"
          : isAlreadyWinner
            ? "הצעה זוכה"
            : "סמן כזוכה"}
      </Button>
      {feedback?.kind === "ok" ? (
        <span
          className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
          role="status"
        >
          {feedback.linesWon} שורות סומנו זוכות
          {feedback.othersDemoted > 0
            ? ` · ${feedback.othersDemoted} הצעות הורדו`
            : ""}
        </span>
      ) : null}
      {feedback?.kind === "err" ? (
        <span
          className="text-[11px] font-medium text-rose-600 dark:text-rose-400"
          role="alert"
        >
          שגיאה: {feedback.message}
        </span>
      ) : null}
    </div>
  )
}
