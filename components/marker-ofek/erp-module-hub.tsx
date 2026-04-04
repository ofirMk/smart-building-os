"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Building2, LayoutGrid } from "lucide-react"

import { useOrganizationBranding } from "@/components/organization-branding-context"
import { Button } from "@/components/ui/button"
import { useModuleVisibilityOptional } from "@/components/marker-ofek/marker-ofek-dashboard-context"
import { cn } from "@/lib/utils"
import { isPillarVisible } from "@/lib/marker-ofek/module-registry"
import {
  MARKER_OFEK_PILLARS,
  type MarkerOfekPillar,
} from "@/lib/marker-ofek/pillar-registry"

/** מרכז הפיקוד — סדר זהב (RTL): רכש → מכרזים → פרויקטים → חוזה וחשבונות → כספים. */
const COMMAND_CENTER_PILLAR_IDS = [
  "procurement",
  "tenders",
  "field-execution",
  "contracts-billing",
  "finance",
] as const

type ErpModuleHubProps = {
  showFacilityLink?: boolean
  className?: string
}

const listContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.06 },
  },
}

const listItem = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] as const },
  },
}

const hubIconWrapClass = cn(
  "mb-4 flex size-12 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50/90 text-slate-600"
)

const hubCardShell = cn(
  "h-full min-h-[220px] rounded-xl border border-slate-100 bg-white shadow-sm transition-shadow duration-200 hover:border-slate-200 hover:shadow-md"
)

function MarkerOfekPillarCard({ pillar }: { pillar: MarkerOfekPillar }) {
  const Icon = pillar.icon
  const quick = pillar.quickActions.slice(0, 3)
  return (
    <motion.div
      variants={listItem}
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className={cn(
        hubCardShell,
        "focus-within:ring-2 focus-within:ring-indigo-500/20"
      )}
    >
      <Link
        href={pillar.href}
        className="group relative flex min-h-[220px] flex-col rounded-[inherit] p-6 text-[#1e293b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
      >
        <div className="relative flex flex-1 flex-col">
          <div className={hubIconWrapClass}>
            <Icon className="size-5" strokeWidth={1.5} aria-hidden />
          </div>
          <h2 className="text-lg font-semibold leading-snug tracking-tight text-[#1e293b]">
            {pillar.navTitle}
          </h2>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-500">
            {pillar.tagline}
          </p>
          {quick.length > 0 ? (
            <ul className="relative mt-6 space-y-2">
              {quick.map((a) => (
                <li
                  key={a.href + a.title}
                  className="flex items-center gap-2 text-sm text-slate-600"
                >
                  <span
                    className="size-1 shrink-0 rounded-full bg-indigo-400/50 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                  <span className="font-currency-mono truncate text-[13px]">
                    {a.title}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Link>
    </motion.div>
  )
}

export function ErpModuleHub({
  showFacilityLink = false,
  className,
}: ErpModuleHubProps) {
  const branding = useOrganizationBranding()
  const mod = useModuleVisibilityOptional()
  const modules = mod?.modules
  const pillarsFiltered =
    modules == null
      ? MARKER_OFEK_PILLARS
      : MARKER_OFEK_PILLARS.filter((p) => isPillarVisible(p.id, modules))

  const pillarsForHub = COMMAND_CENTER_PILLAR_IDS.map((id) =>
    pillarsFiltered.find((p) => p.id === id)
  ).filter((p): p is MarkerOfekPillar => p != null)
  const showFacility =
    showFacilityLink && (mod?.isModuleEnabled("assets") ?? true)

  return (
    <div
      dir="rtl"
      lang="he"
      className={cn("mx-auto w-full max-w-7xl space-y-12 md:space-y-16", className)}
    >
      <header className="space-y-3 text-center sm:mx-0 sm:max-w-2xl sm:text-start">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {branding.organizationName}
        </p>
        <h1 className="module-page-title text-balance">מרכז הפיקוד</h1>
        <p className="mx-auto max-w-xl text-pretty text-sm text-muted-foreground sm:mx-0 md:text-base">
          {branding.slogan} — סדר עבודה מומלץ: רכש, מכרזים, פרויקטים, חוזה וחשבונות, כספים.
          מכל כרטיס נכנסים למודול; בחוזה וחשבונות מרכז משנה לחוזים וחלקיים; בכספים — חיוב, חשבוניות מס ומרכזת.
        </p>
      </header>

      <section className="space-y-4" aria-labelledby="marker-ofek-modules-heading">
        <h2
          id="marker-ofek-modules-heading"
          className="section-title text-center sm:text-start"
        >
          מרכז המודולים
        </h2>
        <motion.div
          className="grid auto-rows-fr gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
          role="navigation"
          aria-label="מודולי המערכת"
          variants={listContainer}
          initial="hidden"
          animate="visible"
        >
          {pillarsForHub.map((pillar) => (
            <MarkerOfekPillarCard key={pillar.id} pillar={pillar} />
          ))}
        </motion.div>
      </section>

      {showFacility ? (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          className={cn(
            "rounded-xl border border-slate-100 bg-white p-6 shadow-sm"
          )}
          aria-label="מעבר למערכת אחזקה"
        >
          <div className="flex flex-col items-stretch gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:text-start">
              <span className={hubIconWrapClass}>
                <Building2 className="size-5" strokeWidth={1.5} aria-hidden />
              </span>
              <div className="space-y-2 text-center sm:text-start">
                <p className="text-base font-semibold text-foreground md:text-lg">
                  ניהול מתקנים
                </p>
                <p className="max-w-md text-sm text-muted-foreground">
                  בניינים, קריאות ותחזוקה — הקשר נפרד, באותה שפה ויזואלית.
                </p>
              </div>
            </div>
            <Button
              size="lg"
              className="shrink-0 gap-2"
              render={<Link href="/facility" />}
            >
              פתיחת פורטל אחזקה
              <LayoutGrid className="size-4" strokeWidth={1.5} aria-hidden />
            </Button>
          </div>
        </motion.section>
      ) : null}
    </div>
  )
}
