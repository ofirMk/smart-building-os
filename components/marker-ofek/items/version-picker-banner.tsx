"use client"

/**
 * VersionPickerBanner — Phase 7.13.4 השוואת עיצובי כרטיס פריט.
 *
 * Banner סטיקי שיוצב בראש כל אחת משלוש גרסאות התצוגה (v1/v2/v3) ומאפשר:
 *   • להבין באיזו גרסה אנחנו צופים (Badge + תיאור קצר).
 *   • לעבור בין הגרסאות (3 כפתורים-קישורים).
 *   • "לבחור" את הגרסה הנוכחית כמועדפת — ה-CTA כותב ל-localStorage
 *     ומציג Toast עם הוראה לעדכן את הצ'אט. לאחר שהמשתמש מודיע,
 *     אני מוחק בקוד את 2 הגרסאות שלא נבחרו.
 *
 * שימו לב: ה-banner לא משכתב ב-DB ולא מפעיל side-effects קבועים — הוא
 *   כלי השוואה זמני בלבד, וה-localStorage משמש רק לסימון ויזואלי באייקון
 *   "✓ נבחר" כשחוזרים אליו אחר כך.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Check, LayoutGrid, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"

export type ItemCardVersion = "v1" | "v2" | "v3"

interface VersionMeta {
  id: ItemCardVersion
  label: string
  shortLabel: string
  description: string
  /** טון צבעוני לחלוקת זיהוי — מחזיר מחלקת Tailwind ל-Badge המסתובב. */
  accent: string
}

const VERSIONS: VersionMeta[] = [
  {
    id: "v1",
    label: "Priority Master-Detail",
    shortLabel: "גרסה A",
    description:
      'Layout מסורתי בסגנון Priority/SAP — left rail עם רשימת פריטים, center עם פרטי פריט בטאבים. מתאים לעבודת data-entry בקבוצה.',
    accent: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  {
    id: "v2",
    label: "Modern Modular",
    shortLabel: "גרסה B",
    description:
      'מסך פוקוסי על פריט יחיד — Header מחומם עם תמונה, 6 טאבים מודרניים, Save גלובלי. URL-based, deep-linkable, mobile-friendly.',
    accent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  {
    id: "v3",
    label: "Single-Page Scroll",
    shortLabel: "גרסה C",
    description:
      'כל הסקציות חשופות בעמוד אחד עם sticky-nav צד — בלי טאבים, סקירה מהירה ומתאימה להדפסה/PDF/audit.',
    accent: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  },
]

const STORAGE_KEY = "marker-ofek:item-card-version-choice"

export interface VersionPickerBannerProps {
  current: ItemCardVersion
  itemId: string
}

export function VersionPickerBanner({ current, itemId }: VersionPickerBannerProps) {
  const [chosen, setChosen] = React.useState<ItemCardVersion | null>(null)

  // טעינה לפי ביקור חוזר — מציגה ✓ ליד הכפתור שכבר נבחר בעבר.
  React.useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === "v1" || stored === "v2" || stored === "v3") setChosen(stored)
  }, [])

  const meta = VERSIONS.find((v) => v.id === current) ?? VERSIONS[1]
  const isCurrentChosen = chosen === current

  function handleChoose() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, current)
    }
    setChosen(current)
    toast.success(`סימנת את ${meta.shortLabel} כמועדפת`, {
      description: `כתוב לי בצ'אט: "בחרתי ${meta.shortLabel}" כדי שאמחק את 2 הגרסאות האחרות מהקוד.`,
      duration: 8000,
    })
  }

  return (
    <div className="sticky top-0 z-30 -mx-4 mb-2 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur-md md:-mx-6 md:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
        {/* שורה 1 — תיאור הגרסה הנוכחית + CTA */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <Badge className={cn("font-semibold", meta.accent)}>
              <Sparkles className="me-1 size-3" aria-hidden />
              {meta.shortLabel}
            </Badge>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold leading-tight">{meta.label}</p>
              <p className="max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
                {meta.description}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/marker-ofek/items/${itemId}/compare`}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "gap-1.5 text-xs"
              )}
            >
              <LayoutGrid className="size-3.5" aria-hidden />
              דף השוואה
            </Link>
            <Button
              type="button"
              size="sm"
              variant={isCurrentChosen ? "secondary" : "default"}
              onClick={handleChoose}
              className="gap-1.5"
            >
              {isCurrentChosen ? (
                <>
                  <Check className="size-3.5" aria-hidden />
                  גרסה זו נבחרה
                </>
              ) : (
                <>בחר גרסה זו</>
              )}
            </Button>
          </div>
        </div>

        {/* שורה 2 — מתג מעבר בין הגרסאות */}
        <div className="flex items-center gap-2 overflow-x-auto" role="tablist">
          {VERSIONS.map((v) => {
            const isCurrent = v.id === current
            const isChosen = chosen === v.id
            const href = `/marker-ofek/items/${itemId}/${slugFor(v.id)}`
            return (
              <Link
                key={v.id}
                href={href}
                role="tab"
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "group inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  isCurrent
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 bg-card hover:bg-muted"
                )}
              >
                <span>{v.shortLabel}</span>
                <span
                  className={cn(
                    "text-[10px]",
                    isCurrent ? "opacity-80" : "text-muted-foreground"
                  )}
                >
                  · {v.label}
                </span>
                {isChosen ? (
                  <Check
                    className={cn(
                      "size-3",
                      isCurrent ? "" : "text-emerald-600"
                    )}
                    aria-hidden
                  />
                ) : null}
              </Link>
            )
          })}
          <div className="ms-auto inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <ArrowRight className="size-3" aria-hidden />
            השווה גרסאות לבחירה סופית
            <ArrowLeft className="size-3" aria-hidden />
          </div>
        </div>
      </div>
    </div>
  )
}

function slugFor(v: ItemCardVersion): string {
  switch (v) {
    case "v1":
      return "v1-priority"
    case "v2":
      return "v2-modern"
    case "v3":
      return "v3-onepage"
  }
}
