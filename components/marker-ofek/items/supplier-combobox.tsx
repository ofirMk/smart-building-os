"use client"

/**
 * SupplierComboBox — Phase 7.14.1.
 *
 * Combobox מבוסס Popover + Command (cmdk) לבחירת ספק מתוך רשימה.
 * נועד לבחירת "ספק מועדף" בכרטיס פריט, אבל הוא reusable לכל הקשר שבו
 * צריך picker עם search.
 *
 * UX:
 *   • Trigger: כפתור עם שם הספק הנבחר או placeholder.
 *   • Popover נפתח עם input חיפוש (חיפוש לפי name + supplierNumber).
 *   • אופציה ראשונה: "אין ספק מועדף" (clear) — מציבה value="".
 *   • Empty state: "לא נמצא ספק" אם החיפוש לא מוצא.
 *   • Loading: spinner קטן בכפתור.
 *
 * Accessibility:
 *   • role="combobox", aria-expanded, aria-controls.
 *   • Esc סוגר, Enter בוחר את ה-highlighted, חיצים נווטים.
 *   • RTL-aware: ChevronsUpDown ו-checks מותאמים.
 */

import * as React from "react"
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import type { SupplierLookupOption } from "@/components/marker-ofek/items/item-edit-form-types"
import { cn } from "@/lib/utils"

export interface SupplierComboBoxProps {
  /** UUID של הספק הנבחר; ריק = "אין מועדף". */
  value: string
  /** נקרא בכל שינוי. ריק "" = clear. */
  onChange: (next: string) => void
  /** רשימת ספקים זמינים לבחירה. */
  options: SupplierLookupOption[]
  /** האם הרשימה בטעינה — מציגים spinner ב-trigger. */
  loading?: boolean
  /** טקסט ב-trigger כשאין בחירה. */
  placeholder?: string
  /** disabled. */
  disabled?: boolean
  /** id ל-aria-labelledby אם יש Label חיצוני. */
  id?: string
  /** className נוסף ל-trigger. */
  className?: string
}

export function SupplierComboBox({
  value,
  onChange,
  options,
  loading = false,
  placeholder = "בחר ספק…",
  disabled = false,
  id,
  className,
}: SupplierComboBoxProps) {
  const [open, setOpen] = React.useState(false)

  const selected = React.useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className={cn(
            "w-full justify-between gap-2 text-start font-normal",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {loading ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
            ) : null}
            <span className="truncate">
              {selected ? (
                <>
                  {selected.name}
                  {selected.supplierNumber ? (
                    <span className="ms-1 text-xs text-muted-foreground">
                      ({selected.supplierNumber})
                    </span>
                  ) : null}
                </>
              ) : (
                placeholder
              )}
            </span>
          </span>
          <ChevronsUpDown
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        sideOffset={4}
      >
        <Command
          // ערכי החיפוש מצורפים לכל פריט דרך value+keywords (cmdk).
          filter={(itemValue, search) => {
            const term = search.toLowerCase().trim()
            if (!term) return 1
            return itemValue.toLowerCase().includes(term) ? 1 : 0
          }}
        >
          <CommandInput placeholder="חיפוש ספק…" />
          <CommandList>
            <CommandEmpty>לא נמצא ספק תואם.</CommandEmpty>
            {value ? (
              <>
                <CommandGroup>
                  <CommandItem
                    value="__clear__"
                    onSelect={() => {
                      onChange("")
                      setOpen(false)
                    }}
                    className="text-muted-foreground"
                  >
                    <X className="me-2 size-3.5" aria-hidden />
                    נקה בחירה (אין ספק מועדף)
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            ) : null}
            <CommandGroup>
              {options.map((opt) => {
                const searchable =
                  `${opt.name} ${opt.supplierNumber ?? ""}`.trim()
                const isSelected = opt.id === value
                return (
                  <CommandItem
                    key={opt.id}
                    value={searchable}
                    onSelect={() => {
                      onChange(opt.id)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "me-2 size-3.5",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                      aria-hidden
                    />
                    <span className="flex-1 truncate">{opt.name}</span>
                    {opt.supplierNumber ? (
                      <span className="ms-2 text-xs text-muted-foreground">
                        {opt.supplierNumber}
                      </span>
                    ) : null}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
