import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"
import type { MarkerOfekPillar } from "@/lib/marker-ofek/pillar-registry"

type PillarLandingShellProps = {
  pillar: MarkerOfekPillar
}

/** דף נחיתה מינימליסטי לעמודה — גילוי הדרגתי לפיצ׳רים עמוקים */
export function PillarLandingShell({ pillar }: PillarLandingShellProps) {
  const Icon = pillar.icon
  const links = pillar.navItems.filter((it) => it.href !== pillar.href)

  return (
    <div
      dir="rtl"
      lang="he"
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 pb-16 pt-2"
    >
      <Link
        href="/marker-ofek/command-center"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה למרכז המודולים
      </Link>

      <header className="space-y-4">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/70 text-foreground ring-1 ring-border/60">
          <Icon className="size-7" strokeWidth={1.5} aria-hidden />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            מערכת הביצוע והרכש
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {pillar.navTitle}
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground md:text-[15px]">
            {pillar.tagline}
          </p>
        </div>
      </header>

      <section aria-label="פעולות ומסכים">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          המשך כאן
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {links.map((item) => {
            const ItemIcon = item.icon
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl border border-border/60 bg-card/50 p-4 shadow-sm transition-all",
                    "hover:-translate-y-0.5 hover:border-border hover:bg-card hover:shadow-md",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/80 text-foreground/80">
                    <ItemIcon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">
                    {item.title}
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
