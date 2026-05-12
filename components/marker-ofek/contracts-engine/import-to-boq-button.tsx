"use client"

/**
 * W2.5 — Import-to-BOQ Button (MedaTech §5.5.3).
 *
 * Triggers the server action that projects an APPROVED change order
 * (or a full ACTIVE/APPROVED contract) into a planning version's BOQ.
 *
 * Renders inline next to a change-order or contract row. Idempotent —
 * re-clicking refreshes the imported row instead of duplicating.
 */

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import {
  importChangeOrderToBoqAction,
  importContractToBoqAction,
} from "@/lib/marker-ofek/contracts/w2-engine-actions"
import { cn } from "@/lib/utils"

type ImportMode =
  | { kind: "change-order"; changeOrderId: string }
  | { kind: "contract"; contractId: string }

interface ImportToBoqButtonProps {
  mode: ImportMode
  planningVersionId: string
  label?: string
  variant?: "default" | "outline" | "ghost" | "secondary"
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
  onSuccess?: (rowsTouched: number) => void
}

export function ImportToBoqButton({
  mode,
  planningVersionId,
  label,
  variant = "outline",
  size = "sm",
  className,
  onSuccess,
}: ImportToBoqButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<
    | { kind: "ok"; rows: number }
    | { kind: "err"; message: string }
    | null
  >(null)

  const handleClick = () => {
    setFeedback(null)
    startTransition(async () => {
      const result =
        mode.kind === "change-order"
          ? await importChangeOrderToBoqAction({
              changeOrderId: mode.changeOrderId,
              planningVersionId,
            })
          : await importContractToBoqAction({
              contractId: mode.contractId,
              planningVersionId,
            })
      if (result.ok) {
        setFeedback({ kind: "ok", rows: result.rowsTouched })
        onSuccess?.(result.rowsTouched)
      } else {
        setFeedback({ kind: "err", message: result.error })
      }
    })
  }

  const defaultLabel =
    mode.kind === "change-order"
      ? "שיוך הוראת שינוי לתקציב"
      : "שיוך חוזה לתקציב"

  return (
    <div className={cn("inline-flex flex-col items-end gap-1", className)}>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleClick}
        disabled={isPending || !planningVersionId}
      >
        {isPending ? "מבצע שיוך…" : label ?? defaultLabel}
      </Button>
      {feedback?.kind === "ok" ? (
        <span
          className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
          role="status"
        >
          {feedback.rows > 0
            ? `שויכו ${feedback.rows} שורות לתקציב`
            : "השיוך כבר היה קיים — אין שינוי"}
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
