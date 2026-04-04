"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"

import { PartnerMetricsClient } from "@/components/marker-ofek/partner-metrics-client"
import type { PartnerMetricsPayload } from "@/lib/marker-ofek/partner-metrics-actions"
import { cn } from "@/lib/utils"

export function PartnerFinanceExpandableDashboard({
  initialPayload,
}: {
  initialPayload: PartnerMetricsPayload
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <details
      className="group rounded-xl border border-border bg-card/50 shadow-sm"
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium text-foreground outline-none [&::-webkit-details-marker]:hidden">
        <span>דשבורד מלא — טבלה, סינון שותפים ואישורי רכש</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </summary>
      <div className="border-t border-border px-2 pb-4 pt-2">
        {open ? (
          <PartnerMetricsClient variant="partnerFinance" initialPayload={initialPayload} />
        ) : null}
      </div>
    </details>
  )
}
