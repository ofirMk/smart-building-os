"use client"

import { useMemo, useTransition } from "react"

import { updateTicketVendor } from "@/app/(dashboard)/tickets/actions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import type { VendorRow } from "@/types/vendor"

const NONE = "__none__"

type TicketVendorSelectProps = {
  ticketId: string
  vendorId: string | null
  vendors: VendorRow[]
}

export function TicketVendorSelect({
  ticketId,
  vendorId,
  vendors,
}: TicketVendorSelectProps) {
  const [isPending, startTransition] = useTransition()
  const { success, error } = useToast()

  /** פעילים לבחירה; אם יש הקצאה לחברה לא פעילה — מציגים אותה בראש כדי שלא יישבר ה-Select */
  const selectableVendors = useMemo(() => {
    const active = vendors.filter((v) => v.is_active)
    if (!vendorId) return active
    const current = vendors.find((v) => v.id === vendorId)
    if (!current) return active
    if (current.is_active) return active
    return [current, ...active]
  }, [vendors, vendorId])

  const value = vendorId ?? NONE

  return (
    <Select
      value={value}
      disabled={isPending}
      onValueChange={(next) => {
        const resolved = next === NONE ? null : next
        startTransition(() => {
          void (async () => {
            const result = await updateTicketVendor(ticketId, resolved)
            if (result.ok) {
              success("החברה עודכנה לקריאה")
            } else {
              error(result.error || "עדכון נכשל")
            }
          })()
        })
      }}
    >
      <SelectTrigger
        className="w-[min(200px,36vw)] max-w-full text-xs"
        size="sm"
        aria-label="הקצאת חברה לקריאה"
      >
        <SelectValue placeholder="בחרו חברה" />
      </SelectTrigger>
      <SelectContent diamondEntity="entities">
        <SelectItem value={NONE}>ללא חברה</SelectItem>
        {selectableVendors.map((v) => (
          <SelectItem key={v.id} value={v.id}>
            {!v.is_active
              ? `${v.name} (לא פעיל)`
              : v.profession
                ? `${v.name} (${v.profession})`
                : v.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
