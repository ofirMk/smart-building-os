"use client"

import Link from "next/link"
import { Building2, LayoutGrid } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  MARKER_OFEK_PILLARS,
  type MarkerOfekPillar,
} from "@/lib/marker-ofek/pillar-registry"

type ErpModuleHubProps = {
  showFacilityLink?: boolean
  className?: string
}

const hubCardClass = cn(
  "group relative flex min-h-[200px] flex-col rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm",
  "transition-colors hover:border-border hover:bg-accent/30 hover:shadow-md",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
)

const hubIconWrapClass = cn(
  "mb-4 flex size-12 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-muted/50 text-foreground"
)

function MarkerOfekPillarCard({ pillar }: { pillar: MarkerOfekPillar }) {
  const Icon = pillar.icon
  const quick = pillar.quickActions.slice(0, 3)
  return (
    <Link href={pillar.href} className={hubCardClass}>
      <div className="relative flex flex-1 flex-col">
        <div className={hubIconWrapClass}>
          <Icon className="size-5" strokeWidth={1.5} aria-hidden />
        </div>
        <h2 className="text-lg font-semibold leading-snug text-foreground">
          {pillar.navTitle}
        </h2>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
          {pillar.tagline}
        </p>
        {quick.length > 0 ? (
          <ul className="relative mt-6 space-y-2">
            {quick.map((a) => (
              <li
                key={a.href + a.title}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <span
                  className="size-1 shrink-0 rounded-full bg-primary/40 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden
                />
                <span className="truncate">{a.title}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Link>
  )
}

export function ErpModuleHub({
  showFacilityLink = false,
  className,
}: ErpModuleHubProps) {
  return (
    <div
      dir="rtl"
      lang="he"
      className={cn(
        "mx-auto w-full max-w-[88rem] space-y-10 md:space-y-12",
        className
      )}
    >
      <header className="space-y-3 text-center sm:mx-0 sm:max-w-2xl sm:text-start">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          כניסה למרקר אופק
        </p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          מרכז הפיקוד
        </h1>
        <p className="mx-auto max-w-xl text-pretty text-sm text-muted-foreground sm:mx-0 md:text-base">
          מסך הבית של מרקר אופק — תמונה ארגונית אחת, שמונה תחומי עבודה. מכל
          כרטיס נכנסים למודול ולפעולות המהירות.
        </p>
      </header>

      <section className="space-y-4" aria-labelledby="marker-ofek-modules-heading">
        <h2
          id="marker-ofek-modules-heading"
          className="text-center text-lg font-semibold tracking-tight text-foreground sm:text-start"
        >
          מרכז המודולים
        </h2>
        <div
          className="grid auto-rows-fr gap-6 sm:grid-cols-2 lg:grid-cols-4"
          role="navigation"
          aria-label="מודולי מרקר אופק"
        >
          {MARKER_OFEK_PILLARS.map((pillar) => (
            <MarkerOfekPillarCard key={pillar.id} pillar={pillar} />
          ))}
        </div>
      </section>

      {showFacilityLink ? (
        <section
          className="rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm"
          aria-label="מעבר למערכת אחזקה"
        >
          <div className="flex flex-col items-stretch gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:text-start">
              <span className={hubIconWrapClass}>
                <Building2 className="size-5" strokeWidth={1.5} aria-hidden />
              </span>
              <div className="space-y-2 text-center sm:text-start">
                <p className="text-lg font-semibold text-foreground">
                  ניהול מתקנים
                </p>
                <p className="max-w-md text-sm text-muted-foreground">
                  בניינים, קריאות ותחזוקה — הקשר נפרד, באותה שפה ויזואלית.
                </p>
              </div>
            </div>
            <Link
              href="/facility"
              className={cn(
                "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium",
                "shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            >
              <LayoutGrid className="size-4" strokeWidth={1.5} aria-hidden />
              פתיחת פורטל אחזקה
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  )
}
