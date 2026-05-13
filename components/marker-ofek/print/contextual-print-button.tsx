"use client"

/**
 * ContextualPrintButton — reusable PDF launcher.
 *
 * Two modes:
 *
 *   1. **Record-bound** (contextual, real operational screens):
 *        <ContextualPrintButton kind="contracts" id={contract.id} label="הדפס חוזה" />
 *      → opens `/print/contracts/<id>` immediately in a new tab.
 *
 *   2. **Latest-resolved** (pitch lobby one-click demos):
 *        <ContextualPrintButton kind="purchase-orders" label="הזמנת רכש אחרונה" />
 *      → calls `fetchLatestPrintTargetAction` on click, then opens the
 *        returned href. Falls back to a hardcoded seed UUID if the DB is
 *        empty so the demo always works.
 *
 * The button honors the existing design tokens — no new dependencies, no
 * runtime side-effects beyond the `window.open` navigation.
 */

import * as React from "react"
import { Loader2, Printer } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { fetchLatestPrintTargetAction, type PrintDocumentKind } from "@/lib/marker-ofek/pdf/latest-document-actions"
import { cn } from "@/lib/utils"

export type ContextualPrintButtonProps = {
  /** Which print template to open (maps 1:1 to `/print/<kind>/[id]`). */
  kind: PrintDocumentKind
  /** Specific record id. When omitted the component resolves the latest via a server action. */
  id?: string | null
  /** Button text. Defaults to a kind-specific Hebrew label. */
  label?: string
  /** Visual variant — kept compatible with the existing `Button` API. */
  variant?: "default" | "outline" | "secondary" | "ghost"
  /** Size — kept compatible with the existing `Button` API. */
  size?: "default" | "sm" | "lg" | "icon"
  /** Optional extra class names (e.g. tone-specific borders used in the pitch lobby). */
  className?: string
  /** Optional icon override — defaults to the `Printer` icon. */
  icon?: React.ReactNode
  /** Test id for Playwright selectors. Defaults to `print-button:<kind>`. */
  dataTestId?: string
}

const DEFAULT_LABEL: Record<PrintDocumentKind, string> = {
  contracts: "הדפס חוזה",
  "purchase-orders": "הדפס הזמנת רכש",
  bills: "הדפס חשבון קבלן משנה",
  "client-bills": "הדפס חשבון חלקי למזמין",
  "bank-reconciliations": "הדפס דוח התאמת בנק",
  "payment-runs": "הדפס דוח תשלומים",
}

export function ContextualPrintButton({
  kind,
  id,
  label,
  variant = "outline",
  size = "sm",
  className,
  icon,
  dataTestId,
}: ContextualPrintButtonProps) {
  const [pending, setPending] = React.useState(false)
  const resolvedLabel = label ?? DEFAULT_LABEL[kind]
  const testId = dataTestId ?? `print-button:${kind}${id ? `:${id}` : ""}`

  // Record-bound mode — render a plain `<a>` so Cmd+click / middle-click works
  // natively and no JS is required.
  if (typeof id === "string" && id.length > 0) {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        className={cn("gap-2", className)}
        data-contextual-print-kind={kind}
        data-contextual-print-id={id}
        data-testid={testId}
        render={
          <a
            href={`/print/${kind}/${id}`}
            target="_blank"
            rel="noreferrer"
          />
        }
      >
        {icon ?? <Printer className="size-4" aria-hidden />}
        {resolvedLabel}
      </Button>
    )
  }

  // Latest-resolved mode — fetch the latest record id via a server action.
  async function handleClick() {
    if (pending) return
    setPending(true)
    try {
      const target = await fetchLatestPrintTargetAction(kind)
      if (target.isMockFallback) {
        toast.info(`פותח דמו: ${target.label}`, {
          description: "לא נמצאה רשומה אמיתית — נטען מסמך Seed כדי שההדגמה תעבוד.",
        })
      }
      window.open(target.href, "_blank", "noreferrer")
    } catch (err) {
      toast.error("הפקת המסמך נכשלה", {
        description: err instanceof Error ? err.message : "שגיאה לא צפויה",
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("gap-2", className)}
      onClick={handleClick}
      disabled={pending}
      aria-busy={pending}
      data-contextual-print-kind={kind}
      data-contextual-print-mode="latest"
      data-testid={testId}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        (icon ?? <Printer className="size-4" aria-hidden />)
      )}
      {resolvedLabel}
    </Button>
  )
}
