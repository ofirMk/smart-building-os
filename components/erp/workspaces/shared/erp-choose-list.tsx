"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type ErpChooseListOption = {
  value: string
  label: string
  description?: string
  searchText?: string
  disabled?: boolean
}

type ErpChooseListProps = {
  value: string | null
  options: ErpChooseListOption[]
  onChange: (nextValue: string, option: ErpChooseListOption | null) => void
  placeholder: string
  searchPlaceholder?: string
  emptyText?: string
  quickCreateHref?: string
  quickCreateLabel?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
  contextualFilter?: (option: ErpChooseListOption) => boolean
}

function fuzzyScore(value: string, search: string): number {
  const q = search.trim().toLowerCase()
  if (!q) return 1
  const v = value.toLowerCase()
  if (v === q) return 5
  if (v.startsWith(q)) return 4
  if (v.includes(q)) return 3

  let pointer = 0
  for (const ch of q) {
    pointer = v.indexOf(ch, pointer)
    if (pointer === -1) return 0
    pointer += 1
  }
  return 2
}

export function ErpChooseList({
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder = "חיפוש...",
  emptyText = "לא נמצאו תוצאות",
  quickCreateHref,
  quickCreateLabel = "יצירת רשומה חדשה",
  disabled = false,
  className,
  triggerClassName,
  contextualFilter,
}: ErpChooseListProps) {
  const [open, setOpen] = React.useState(false)

  const visibleOptions = React.useMemo(
    () => (contextualFilter ? options.filter(contextualFilter) : options),
    [contextualFilter, options]
  )
  const selected = React.useMemo(
    () => visibleOptions.find((option) => option.value === value) ?? null,
    [value, visibleOptions]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-8 w-full justify-between rounded-lg border-slate-200 bg-card px-2 text-sm font-normal hover:bg-background",
            triggerClassName
          )}
        >
          <span className="truncate text-right">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="ms-2 size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("w-[--radix-popover-trigger-width] p-0", className)}>
        <Command
          shouldFilter
          filter={(itemValue, search, keywords) =>
            fuzzyScore([itemValue, ...(keywords ?? [])].join(" "), search)
          }
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {visibleOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  keywords={[
                    option.searchText ?? "",
                    option.value,
                    option.description ?? "",
                  ]}
                  disabled={option.disabled}
                  onSelect={() => {
                    onChange(option.value, option)
                    setOpen(false)
                  }}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 text-right">
                    <p className="truncate text-sm">{option.label}</p>
                    {option.description ? (
                      <p className="truncate text-[11px] text-slate-500">{option.description}</p>
                    ) : null}
                  </div>
                  <Check
                    className={cn(
                      "size-3.5 shrink-0 text-emerald-600",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
            {quickCreateHref ? (
              <CommandGroup>
                <CommandItem
                  value={quickCreateLabel}
                  onSelect={() => {
                    window.open(quickCreateHref, "_blank", "noopener,noreferrer")
                    setOpen(false)
                  }}
                  className="text-emerald-700"
                >
                  <Plus className="size-3.5" />
                  <span>{quickCreateLabel}</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

