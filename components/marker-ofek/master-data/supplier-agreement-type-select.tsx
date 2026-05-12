"use client"

/**
 * W2.5 — Supplier Agreement Type Select (MedaTech §2.1.2).
 *
 * Per-supplier strategy selector. Optimistic UI: shows the chosen value
 * immediately, then reconciles with server response. Surfaces validation
 * errors inline.
 *
 * The four values map verbatim to the spec:
 *   NONE         → ad-hoc (no standing agreement)
 *   PRICE_LIST   → מחירון ספק
 *   FRAME_PO     → הזמנת מסגרת
 *   QUOTE        → הצעת מחיר
 */

import { useState, useTransition } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  setSupplierAgreementTypeAction,
  type SupplierAgreementType,
} from "@/lib/marker-ofek/master-data/supplier-agreement-action"
import { cn } from "@/lib/utils"

const AGREEMENT_TYPE_LABELS: Record<SupplierAgreementType, string> = {
  NONE: "ללא הסכם קבוע",
  PRICE_LIST: "מחירון ספק",
  FRAME_PO: "הזמנת מסגרת",
  QUOTE: "הצעת מחיר",
}

const AGREEMENT_TYPE_DESCRIPTIONS: Record<SupplierAgreementType, string> = {
  NONE: "רכש אד-הוק ללא הסכם מסחרי קבוע.",
  PRICE_LIST: "מחירון ספק כללי — תקף לכל הפרויקטים, ללא הגבלת כמות.",
  FRAME_PO: "הסכם מסגרת — התחייבות לכמות וזמן עם תנאים מועדפים.",
  QUOTE: "הצעת מחיר פר-פרויקט — תנאים ספציפיים לעבודה אחת.",
}

interface SupplierAgreementTypeSelectProps {
  supplierId: string
  currentValue: SupplierAgreementType
  className?: string
  disabled?: boolean
}

export function SupplierAgreementTypeSelect({
  supplierId,
  currentValue,
  className,
  disabled,
}: SupplierAgreementTypeSelectProps) {
  const [value, setValue] = useState<SupplierAgreementType>(currentValue)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleChange = (next: string | null) => {
    if (!next) return
    setError(null)
    const typedNext = next as SupplierAgreementType
    const previous = value
    setValue(typedNext)
    startTransition(async () => {
      const result = await setSupplierAgreementTypeAction({
        supplierId,
        agreementType: typedNext,
      })
      if (!result.ok) {
        // Revert optimistic update on failure.
        setValue(previous)
        setError(result.error)
      }
    })
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Select
        value={value}
        onValueChange={handleChange}
        disabled={disabled || isPending}
      >
        <SelectTrigger className="w-full" aria-label="סוג הסכם ספק">
          <SelectValue placeholder="בחר סוג הסכם" />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(AGREEMENT_TYPE_LABELS) as SupplierAgreementType[]).map(
            (key) => (
              <SelectItem key={key} value={key}>
                <div className="flex flex-col">
                  <span className="font-medium">
                    {AGREEMENT_TYPE_LABELS[key]}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {AGREEMENT_TYPE_DESCRIPTIONS[key]}
                  </span>
                </div>
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>
      {isPending ? (
        <span className="text-[11px] text-muted-foreground" role="status">
          מעדכן…
        </span>
      ) : null}
      {error ? (
        <span
          className="text-[11px] font-medium text-rose-600 dark:text-rose-400"
          role="alert"
        >
          שגיאה: {error}
        </span>
      ) : null}
    </div>
  )
}
