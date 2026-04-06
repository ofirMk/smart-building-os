"use client"

import * as React from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type AiFieldSuggestion = {
  value: string | number
  source: string
}

export type InputWithAiSuggestionProps = Omit<
  React.ComponentProps<typeof Input>,
  "ref"
> & {
  aiSuggestion?: AiFieldSuggestion | null
  /** נקרא עם ערך ההצעה לאחר לחיצה על השבב */
  onApplyAiSuggestion?: (value: string) => void
}

const InputWithAiSuggestion = React.forwardRef<
  HTMLInputElement,
  InputWithAiSuggestionProps
>(function InputWithAiSuggestion(
  { className, aiSuggestion, onApplyAiSuggestion, disabled, ...inputProps },
  ref
) {
  const hasSuggestion = Boolean(aiSuggestion)

  return (
    <div className="relative w-full">
      <Input
        ref={ref}
        disabled={disabled}
        className={cn(
          hasSuggestion && "min-h-10 pe-[11.5rem] text-start sm:pe-[13rem]",
          className
        )}
        {...inputProps}
      />
      {aiSuggestion ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onApplyAiSuggestion?.(String(aiSuggestion.value))}
          className={cn(
            "absolute end-2 top-1/2 z-10 max-w-[min(12rem,calc(100%-1rem))] -translate-y-1/2 truncate rounded-md bg-blue-100 px-1.5 py-1 text-[10px] font-medium leading-tight text-blue-900 shadow-sm transition-colors hover:bg-blue-200 sm:text-[11px]",
            disabled && "pointer-events-none opacity-50"
          )}
          title={aiSuggestion.source}
          aria-label={`הצעה מהחוזה: ${aiSuggestion.value}. מקור: ${aiSuggestion.source}`}
        >
          <span aria-hidden>🪄 </span>
          הצעה מהחוזה: {String(aiSuggestion.value)}
        </button>
      ) : null}
    </div>
  )
})

export { InputWithAiSuggestion }
