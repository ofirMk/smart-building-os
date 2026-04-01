"use client"

import * as React from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type F1UnifiedSearchItem = {
  id: string
  sku: string
  name: string
  unit: string | null
  lastPrice: number | null
}

type F1UnifiedSearchProps = {
  open: boolean
  query: string
  activeIndex: number
  items: F1UnifiedSearchItem[]
  inputRef: React.RefObject<HTMLInputElement | null>
  onOpenChange: (open: boolean) => void
  onQueryChange: (value: string) => void
  onActiveIndexChange: (index: number) => void
  onInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onSelect: (item: F1UnifiedSearchItem) => void
  currencyFormatter: Intl.NumberFormat
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function renderHighlightedText(text: string, query: string): React.ReactNode {
  const source = String(text ?? "")
  const q = query.trim()
  if (!q) return source
  const pattern = new RegExp(`(${escapeRegExp(q)})`, "ig")
  return source.split(pattern).map((part, idx) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <strong key={`${part}-${idx}`} className="font-semibold text-foreground">
        {part}
      </strong>
    ) : (
      <React.Fragment key={`${part}-${idx}`}>{part}</React.Fragment>
    )
  )
}

export function F1UnifiedSearchModal({
  open,
  query,
  activeIndex,
  items,
  inputRef,
  onOpenChange,
  onQueryChange,
  onActiveIndexChange,
  onInputKeyDown,
  onSelect,
  currencyFormatter,
}: F1UnifiedSearchProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-2xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>F1 Command Center - חיפוש קטלוג</DialogTitle>
          <DialogDescription>הקלד לחיפוש פריט... [ESC ליציאה]</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            ref={inputRef}
            placeholder="חיפוש לפי מק״ט פנימי, מק״ט ספק או תיאור פריט"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onInputKeyDown}
          />

          <div className="max-h-[320px] overflow-y-auto rounded-md border border-border/60">
            {items.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">לא נמצאו פריטים.</p>
            ) : (
              <ul className="divide-y divide-border/50">
                {items.map((item, idx) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={cn(
                        "grid w-full grid-cols-[120px_1fr_86px_110px] items-center gap-2 px-3 py-2 text-start text-sm transition-colors",
                        idx === activeIndex ? "bg-accent" : "hover:bg-accent/60"
                      )}
                      onMouseEnter={() => onActiveIndexChange(idx)}
                      onClick={() => onSelect(item)}
                    >
                      <span className="font-semibold tabular-nums">
                        {renderHighlightedText(item.sku || "—", query)}
                      </span>
                      <span className="truncate">
                        {renderHighlightedText(item.name || "—", query)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.unit?.trim() || "—"}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {item.lastPrice != null
                          ? currencyFormatter.format(item.lastPrice)
                          : "—"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
