"use client"

/**
 * SupplierSearchCombobox — P1 #8
 *
 * Reusable Combobox for selecting a supplier with debounced server-side search.
 * Replaces raw supplier_id selects in PO creation forms.
 *
 * Props:
 *   value        — current supplier id (controlled)
 *   onChange     — called with the selected supplier id
 *   kind         — filter "supplier" | "subcontractor" | "all" (default "all")
 *   placeholder  — input placeholder
 *   disabled
 */

import { useCallback, useEffect, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type SupplierOption = {
  id: string
  supplierNumber: string
  name: string
  status: string | null
  kind: string
  qualificationStatus: string | null
}

type Props = {
  value: string
  onChange: (id: string, option: SupplierOption) => void
  kind?: "supplier" | "subcontractor" | "all"
  placeholder?: string
  disabled?: boolean
  className?: string
}

function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export function SupplierSearchCombobox({
  value,
  onChange,
  kind = "all",
  placeholder = "חפש ספק...",
  disabled = false,
  className,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [options, setOptions] = useState<SupplierOption[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState<string>("")
  const debouncedQuery = useDebounce(query, 280)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Fetch options when query changes
  const fetchOptions = useCallback(
    async (q: string) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ q, kind, limit: "20" })
        const res = await fetch(`/api/procurement/suppliers/search?${params}`)
        if (!res.ok) return
        const json = (await res.json()) as { data: SupplierOption[] }
        setOptions(json.data ?? [])
      } catch {
        // non-fatal
      } finally {
        setLoading(false)
      }
    },
    [kind]
  )

  useEffect(() => {
    if (open) {
      void fetchOptions(debouncedQuery)
    }
  }, [debouncedQuery, open, fetchOptions])

  // Resolve label for currently selected id
  useEffect(() => {
    if (!value) {
      setSelectedLabel("")
      return
    }
    const found = options.find((o) => o.id === value)
    if (found) {
      setSelectedLabel(`${found.supplierNumber} — ${found.name}`)
    } else if (!selectedLabel) {
      // fetch by id to display initial label
      void (async () => {
        const params = new URLSearchParams({ q: value, kind, limit: "1" })
        const res = await fetch(`/api/procurement/suppliers/search?${params}`)
        if (!res.ok) return
        const json = (await res.json()) as { data: SupplierOption[] }
        const match = json.data?.[0]
        if (match) setSelectedLabel(`${match.supplierNumber} — ${match.name}`)
      })()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function handleSelect(option: SupplierOption) {
    setSelectedLabel(`${option.supplierNumber} — ${option.name}`)
    onChange(option.id, option)
    setOpen(false)
    setQuery("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal text-right", className)}
        >
          <span className="truncate">{selectedLabel || placeholder}</span>
          <svg
            className="ms-2 size-3.5 shrink-0 opacity-50"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="p-0"
        style={{ width: triggerRef.current?.offsetWidth ?? 300 }}
        align="start"
      >
        <div className="border-b p-2">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="הקלד שם ספק או מספר ספק..."
            className="h-8 text-sm"
            dir="rtl"
          />
        </div>

        <div className="max-h-60 overflow-y-auto py-1" dir="rtl">
          {loading && (
            <p className="px-3 py-2 text-xs text-muted-foreground">מחפש...</p>
          )}
          {!loading && options.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">לא נמצאו ספקים</p>
          )}
          {!loading &&
            options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelect(opt)}
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2 text-right text-sm hover:bg-accent",
                  opt.id === value && "bg-accent font-medium"
                )}
              >
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-xs text-muted-foreground">
                    {opt.supplierNumber}
                  </span>{" "}
                  <span className="truncate">{opt.name}</span>
                </div>
                {opt.qualificationStatus === "APPROVED" && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    מוסמך
                  </Badge>
                )}
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
