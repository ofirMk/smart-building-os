"use client"

/**
 * ItemImageHeader — Phase 7.13.4
 *
 * Header ריבועי לתמונת מוצר בכרטיס פריט. אם `imageUrl` ריק/שבור מציג איקון
 * `Package` גנרי כ-placeholder. תומך בעריכת URL inline (אופציונלי) כך
 * שמשתמש יכול להדביק קישור חיצוני לתמונה ללא צורך בהעלאת קובץ.
 *
 * ה-Component לא תלוי ב-RHF — הוא מקבל `value` ו-`onChange` פשוטים כדי
 * שיוכל להיות מוטבע גם ב-form עריכה (RHF Controller) וגם במצב read-only.
 */

import * as React from "react"
import { ImageIcon, Package, Pencil, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface ItemImageHeaderProps {
  /** קישור לתמונת הפריט. null/ריק → placeholder. */
  value: string | null
  /** קרא כש-URL השתנה. אם undefined — הרכיב ב-read-only mode. */
  onChange?: (next: string) => void
  /** אם true — הרכיב ב-read-only mode (למשל במסך צפייה). */
  disabled?: boolean
  /** SKU שמוצג כ-alt של התמונה (a11y). */
  sku?: string
  className?: string
}

export function ItemImageHeader({
  value,
  onChange,
  disabled = false,
  sku,
  className,
}: ItemImageHeaderProps) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(value ?? "")
  const [imgFailed, setImgFailed] = React.useState(false)

  // סנכרון draft כשה-value מתעדכן מבחוץ (reset / initial load).
  React.useEffect(() => {
    setDraft(value ?? "")
    setImgFailed(false)
  }, [value])

  const canEdit = !disabled && typeof onChange === "function"
  const hasImage = Boolean(value && value.trim()) && !imgFailed

  function commit() {
    if (!canEdit) return
    onChange?.(draft.trim())
    setEditing(false)
  }
  function cancel() {
    setDraft(value ?? "")
    setEditing(false)
  }

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center gap-2",
        className
      )}
    >
      <div
        className={cn(
          "relative flex size-24 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/40 shadow-sm",
          hasImage && "bg-white"
        )}
        aria-label={
          hasImage
            ? `תמונת מוצר${sku ? ` — ${sku}` : ""}`
            : "אין תמונה — איקון גנרי"
        }
      >
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL חיצוני דינמי; next/image דורש remotePatterns.
          <img
            src={value!}
            alt={sku ? `תמונת פריט ${sku}` : "תמונת פריט"}
            className="size-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <Package className="size-9" aria-hidden />
            <span className="text-[10px] font-medium uppercase tracking-wide">
              ללא תמונה
            </span>
          </div>
        )}

        {canEdit && !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity hover:bg-black/40 hover:opacity-100 focus-visible:bg-black/40 focus-visible:opacity-100 focus-visible:outline-none"
            aria-label="עריכת כתובת תמונה"
          >
            <Pencil className="size-5 text-white drop-shadow" />
          </button>
        ) : null}
      </div>

      {canEdit && editing ? (
        <div className="flex w-64 flex-col gap-1">
          <div className="flex items-center gap-1">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="https://…"
              dir="ltr"
              className="h-8 text-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  commit()
                } else if (e.key === "Escape") {
                  e.preventDefault()
                  cancel()
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={commit}
              className="h-8 px-2"
            >
              <ImageIcon className="size-3.5" aria-hidden />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={cancel}
              className="h-8 px-2"
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Enter לשמירה · Esc לביטול
          </p>
        </div>
      ) : null}
    </div>
  )
}
