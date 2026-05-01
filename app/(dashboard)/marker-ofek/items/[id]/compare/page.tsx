"use client"

/**
 * /marker-ofek/items/[id]/compare — דף נחיתה להשוואת 3 גרסאות עיצוב.
 *
 * מציג 3 כרטיסים גדולים (אחד לכל גרסה) עם:
 *   • שם הגרסה + Badge צבעוני
 *   • סיכום קצר של הפילוסופיה
 *   • רשימת ✓ יתרונות / ✗ חסרונות
 *   • CTA "פתח גרסה X" שמנווט לעמוד התצוגה המקדימה (v1/v2/v3).
 *
 * אחרי שהמשתמש בוחן את 3 הגרסאות וחוזר עם החלטה ("בחרתי A/B/C") —
 * נמחק בקוד את 2 הגרסאות שלא נבחרו ונקבע את הנבחרת כ-default.
 */

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CheckCircle2,
  FileStack,
  History,
  LayoutGrid,
  Layers,
  Package,
  PanelsTopLeft,
  ScrollText,
  ShoppingBag,
  Warehouse,
  XCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"

interface VersionCardData {
  slug: "v1-priority" | "v2-modern" | "v3-onepage"
  shortLabel: string
  title: string
  philosophy: string
  icon: React.ComponentType<{ className?: string }>
  accent: string
  pros: string[]
  cons: string[]
  bestFor: string
}

const VERSIONS: VersionCardData[] = [
  {
    slug: "v1-priority",
    shortLabel: "גרסה A",
    title: "Priority Master-Detail",
    philosophy:
      'המסך הקיים — ממשק קלאסי בסגנון Priority/SAP. רשימת פריטים בעמודה ימנית, פרטי פריט נבחר במרכז עם 4 טאבים: פרטים כלליים / מחירים / ניהול מחסנים / פרמטרים.',
    icon: PanelsTopLeft,
    accent: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    pros: [
      "מעבר מהיר בין פריטים בלי חזרה לקטלוג (productivity)",
      "מוכר למשתמשי ERP ותיקים — אפס curve",
      "Resizable panels — שליטה על שטח עבודה",
    ],
    cons: [
      "תלוי בקובץ אחד גדול (1267 שורות) — תחזוקה קשה",
      "פחות mobile-friendly (left-rail מנציח רוחב מינימלי)",
      "לא URL-based: אין deep-link לפריט מסוים",
      "השדות החדשים של 7.13.4 לא הוטמעו בו",
    ],
    bestFor:
      "פעולות באצ' של קלדנית data-entry שמעדכנת עשרות פריטים בסשן אחד.",
  },
  {
    slug: "v2-modern",
    shortLabel: "גרסה B",
    title: "Modern Modular",
    philosophy:
      'הגרסה החדשה של Phase 7.13.4 — Header מחומם עם תמונה, 6 טאבים ייעודיים (כללי / לוגיסטיקה / מחירים / נכסים / מיפויי ספקים / היסטוריית רכש), RHF FormProvider עם Save גלובלי. URL-based, mobile-friendly.',
    icon: Layers,
    accent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    pros: [
      "URL-based: deep-link, bookmark, share — תקין",
      "Modular — כל טאב קומפוננטה עצמאית, קל להוסיף שדות",
      "כל השדות החדשים של 7.13.4 הוטמעו (barcode, image, etc.)",
      "Mobile-first: הטאבים scrollable אופקית במכשירים צרים",
      "RHF + Validation + Toast — UX מודרני",
    ],
    cons: [
      "אין רשימת פריטים נראית — צריך לחזור לקטלוג למעבר לפריט הבא",
      "6 טאבים — סקירה גלובלית של הפריט דורשת קליקים",
    ],
    bestFor:
      "עבודה ממוקדת על פריט בודד, שיתוף קישורים, אישור שינויים מהאפליקציה הניידת.",
  },
  {
    slug: "v3-onepage",
    shortLabel: "גרסה C",
    title: "Single-Page Scroll",
    philosophy:
      'גרסה אלטרנטיבית: כל 6 הסקציות חשופות יחד בעמוד אחד עם sticky-side-nav צד. בלי טאבים — סקירה רציפה כמו דוח Notion/Linear.',
    icon: ScrollText,
    accent: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    pros: [
      "סקירה גלובלית בקליק אחד (Cmd+F עובד על כל המסך)",
      "מתאים להדפסה / יצוא PDF / audit",
      "Side-nav מסונכרן עם scroll (IntersectionObserver) — context תמיד ברור",
      "תאוצת UX לקריאה (אין latency של החלפת tab)",
    ],
    cons: [
      "דף ארוך — ב-mobile הגלילה הופכת מעיקה",
      "פחות מתאים לעבודה ממוקדת על שדה ספציפי (יותר רעש ויזואלי)",
      "Sticky-nav דורש שטח אופקי — מתקפל ב-mobile",
    ],
    bestFor:
      "סקירה / audit / שיתוף עם בעלי תפקידים שלא מעורבים בעריכה (Stakeholders, מבקרים).",
  },
]

export default function CompareItemCardVersionsPage() {
  const params = useParams()
  const id = typeof params.id === "string" ? params.id : ""

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-12">
      <Link
        href={`/marker-ofek/items/${id}`}
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לכרטיס הפריט
      </Link>

      <header className="rounded-2xl border border-border/70 bg-gradient-to-bl from-primary/5 to-transparent p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <LayoutGrid className="size-6" aria-hidden />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              השוואת 3 גרסאות עיצוב לכרטיס פריט
            </h1>
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              לפני שמתקבעים על UX סופי לפריטים — סוקרים 3 פילוסופיות עיצוב.
              לחץ על &quot;פתח גרסה X&quot; כדי לחקור כל אחת לעומק עם נתוני
              הפריט שלך, אז תוכל לבחור את המועדפת ולהודיע לי בצ&apos;אט. אני
              אמחק אז את 2 האחרות.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="outline" className="gap-1.5">
                <Package className="size-3" aria-hidden />
                Phase 7.13.4
              </Badge>
              <Badge variant="outline">3 גרסאות חיות</Badge>
              <Badge variant="outline">החלטה הפיכה — אפשר לחזור</Badge>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-3">
        {VERSIONS.map((v) => (
          <VersionCard key={v.slug} data={v} itemId={id} />
        ))}
      </div>

      {/* Sections legend — מסביר אילו טאבים נחשפים בכל גרסה */}
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">מה נחשף בכל גרסה?</CardTitle>
          <CardDescription>
            כל 3 הגרסאות מציגות את אותם הנתונים — ההבדל הוא רק ב-layout.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 text-sm md:grid-cols-3">
            <SectionItem icon={Package} label="כללי — תיאור, ברקוד, סטטוס, MOQ" />
            <SectionItem icon={Warehouse} label="לוגיסטיקה — UOM, המרה, מס׳ סידוריים" />
            <SectionItem icon={Banknote} label="מחירים — עלות תקן, מחירון" />
            <SectionItem icon={FileStack} label="נכסים וקבצים — datasheets, תמונות" />
            <SectionItem icon={ShoppingBag} label="מיפויי ספקים — שיוכים מסונכרנים" />
            <SectionItem icon={History} label="היסטוריית רכש — drill מ-PO Lines" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// VersionCard — כרטיס יחיד של גרסה.
// ============================================================================

function VersionCard({
  data,
  itemId,
}: {
  data: VersionCardData
  itemId: string
}) {
  const Icon = data.icon
  return (
    <Card className="flex flex-col border-border/70 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="space-y-3 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div
            className={cn(
              "flex size-12 items-center justify-center rounded-xl",
              data.accent
            )}
          >
            <Icon className="size-6" aria-hidden />
          </div>
          <Badge className={cn("font-semibold", data.accent)}>
            {data.shortLabel}
          </Badge>
        </div>
        <div className="space-y-1">
          <CardTitle className="text-lg">{data.title}</CardTitle>
          <CardDescription className="leading-relaxed">
            {data.philosophy}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 pt-0">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            יתרונות
          </p>
          <ul className="space-y-1">
            {data.pros.map((p, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[13px]">
                <CheckCircle2
                  className="mt-0.5 size-3.5 shrink-0 text-emerald-600"
                  aria-hidden
                />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            חסרונות
          </p>
          <ul className="space-y-1">
            {data.cons.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[13px]">
                <XCircle
                  className="mt-0.5 size-3.5 shrink-0 text-rose-500"
                  aria-hidden
                />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-md bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
          <span className="font-semibold text-foreground">מתאים ל:</span>{" "}
          {data.bestFor}
        </div>

        <Link
          href={`/marker-ofek/items/${itemId}/${data.slug}`}
          className={cn(
            buttonVariants({ variant: "default", size: "default" }),
            "mt-auto w-full justify-center gap-1.5"
          )}
        >
          פתח את {data.shortLabel}
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  )
}

function SectionItem({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/50 bg-card/50 px-3 py-2">
      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
      <span className="text-[12px]">{label}</span>
    </div>
  )
}
