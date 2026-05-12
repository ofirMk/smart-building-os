"use client"

/**
 * Sprint T3 — Award→Contract Button (MedaTech §7.3.5 + §2.1.2).
 *
 * The lifecycle loop closer. Renders inline next to a winning quote
 * (`is_winner=true`). Clicking it triggers `awardQuoteToContractAction`
 * which routes the winner into the right target table based on the RFQ's
 * `contract_type`:
 *   • NEW_CONTRACT → erp_subcontractor_contracts
 *   • FRAME_PO     → erp_blanket_purchase_orders
 *   • PRICE_LIST   → erp_vendor_price_lists
 *   • AD_HOC       → no-op (just the mark)
 *
 * Idempotent — re-clicking returns the existing target id.
 */

import { CheckCircle2, FileCheck2, Layers, Loader2 } from "lucide-react"
import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import {
  awardQuoteToContractAction,
  type AwardQuoteKind,
} from "@/lib/marker-ofek/tenders/t1-tender-engine-actions"
import { cn } from "@/lib/utils"

const KIND_LABELS: Record<AwardQuoteKind, string> = {
  subcontractor_contract: "חוזה קבלן משנה",
  blanket_purchase_order: "הזמנת מסגרת",
  vendor_price_list: "מחירון ספק",
  ad_hoc: "ad-hoc (ללא יעד)",
}

interface AwardQuoteToContractButtonProps {
  quoteId: string
  isAlreadyAwarded?: boolean
  variant?: "default" | "outline" | "ghost" | "secondary"
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
  onSuccess?: (kind: AwardQuoteKind, targetId: string | null) => void
}

export function AwardQuoteToContractButton({
  quoteId,
  isAlreadyAwarded = false,
  variant = "default",
  size = "sm",
  className,
  onSuccess,
}: AwardQuoteToContractButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<
    | {
        kind: "ok"
        created: boolean
        target: AwardQuoteKind
        linesCreated: number
        targetNumber: string | null
        reason: string | null
      }
    | { kind: "err"; message: string }
    | null
  >(null)

  const handleClick = () => {
    setFeedback(null)
    startTransition(async () => {
      const result = await awardQuoteToContractAction({ quoteId })
      if (result.ok) {
        setFeedback({
          kind: "ok",
          created: result.created,
          target: result.kind,
          linesCreated: result.linesCreated,
          targetNumber: result.targetNumber,
          reason: result.reason,
        })
        onSuccess?.(result.kind, result.targetId)
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
        aria-pressed={isAlreadyAwarded}
      >
        {isPending ? (
          <Loader2 className="ms-1 size-4 animate-spin" aria-hidden />
        ) : isAlreadyAwarded ? (
          <CheckCircle2 className="ms-1 size-4" aria-hidden />
        ) : (
          <FileCheck2 className="ms-1 size-4" aria-hidden />
        )}
        {isPending
          ? "ממיר לחוזה…"
          : isAlreadyAwarded
            ? "כבר הומר"
            : "המר לחוזה"}
      </Button>
      {feedback?.kind === "ok" ? (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
          role="status"
        >
          <Layers className="size-3" aria-hidden />
          {feedback.created
            ? `נוצר ${KIND_LABELS[feedback.target]}`
            : feedback.reason === "already_awarded"
              ? "כבר הומר בעבר"
              : feedback.reason === "ad_hoc_no_target"
                ? "ad-hoc — אין יעד אוטומטי"
                : KIND_LABELS[feedback.target]}
          {feedback.targetNumber ? ` · ${feedback.targetNumber}` : ""}
          {feedback.linesCreated > 0
            ? ` · ${feedback.linesCreated} שורות`
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
