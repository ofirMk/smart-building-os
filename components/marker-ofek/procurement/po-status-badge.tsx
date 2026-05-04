"use client"

/**
 * `<PoStatusBadge />` — Phase B' (Priority parity UI).
 *
 * Badge יחיד להצגת סטטוס PO בכל המסכים. נשלח `status` (code) ומחזיר:
 *   • תווית עברית מ-`erp_po_status_types.name_he`
 *   • צבע רקע רך לפי `resolvePoStatusTone(meta)` (design-system safe)
 *   • badge מוקטן משני (secondary pill) עבור `isLegacyAlias=true`
 *   • title tooltip עם `name_en` + lifecycle_stage לעזרה ל-power users
 *
 * Fallback: אם ה-hook עוד לא נטען / הסטטוס לא ידוע, מציג את ה-code raw
 * עם tone neutral — לעולם לא נשבר את ה-UI.
 */

import * as React from "react"

import { SmartListStatusPill } from "@/components/ui/bento-smart-list"
import {
  resolvePoStatusTone,
  usePoStatusTypes,
  type PoStatusTypeDto,
} from "@/lib/hooks/use-po-status-types"

export type PoStatusBadgeProps = {
  status: string
  /**
   * אופציונלי: מטא-דאטה שהועברה מה-parent (לחיסכון ב-calls כפולים ברשימות
   * גדולות — ה-parent יכול לקרוא ל-hook פעם אחת ולהעביר את ה-map לכל שורה).
   */
  meta?: PoStatusTypeDto | null
  className?: string
}

export function PoStatusBadge({ status, meta, className }: PoStatusBadgeProps) {
  const { statusMap, isLoading } = usePoStatusTypes()

  const resolved = meta ?? statusMap[status] ?? null
  const label = resolved?.nameHe ?? status
  const tone = resolvePoStatusTone(resolved)

  // tooltip עם עזרה
  const title = resolved
    ? `${resolved.nameEn} · ${resolved.lifecycleStage}${
        resolved.isLegacyAlias ? " · legacy" : ""
      }`
    : isLoading
      ? "טוען סטטוסים…"
      : status

  return (
    <span title={title} className={className}>
      <SmartListStatusPill tone={tone}>{label}</SmartListStatusPill>
    </span>
  )
}

/**
 * Helper למקרים שלא ניתן להשתמש ב-hook (טבלה אגרסיבית, server component
 * ראשוני). מחזיר את ה-tone+label בלי render; הקורא מחליט מה להציג.
 */
export function getPoStatusPresentation(
  status: string,
  statusMap: Record<string, PoStatusTypeDto>
): { label: string; tone: ReturnType<typeof resolvePoStatusTone> } {
  const meta = statusMap[status] ?? null
  return {
    label: meta?.nameHe ?? status,
    tone: resolvePoStatusTone(meta),
  }
}
