"use client"

/**
 * InvestorPitchLobby — the **CEO Command Center** lobby.
 *
 * Renamed from "Investor Pitch Hub" — the surface is now positioned as a
 * permanent executive dashboard, not a demo-only landing page. It uses the
 * shared system theme tokens (`bg-background` / `bg-card` / `text-foreground` /
 * `border-border`) so it blends with the rest of the Light-Mode product
 * instead of looking like a dark, glossy stage prop.
 *
 * Each tile is still a giant, click-anywhere navigation card. No sidebar,
 * no dependencies on `MARKER_OFEK_SIDEBAR_SECTIONS`, no DB calls — pure
 * client-side mock content so it cannot fail.
 */

import * as React from "react"
import Link from "next/link"
import {
  ArrowUpLeft,
  Banknote,
  BarChart3,
  Bot,
  Coins,
  GanttChartSquare,
  Gauge,
  HardHat,
  Mic2,
  Rocket,
  Sparkles,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Default fallback when no project ID is provided as a prop. Mirrors the
 * server-side fallback in `app/(dashboard)/marker-ofek/pitch/page.tsx` so
 * the component remains usable in standalone contexts (e.g. Storybook).
 */
const DEFAULT_DEMO_PROJECT_ID = "8599ee46-50a7-4a5e-b219-e853ff093cc6"

type LobbyTile = {
  href: string
  eyebrow: string
  title: string
  subtitle: string
  description: string
  icon: React.ReactNode
  accent: string // tailwind gradient classes
  highlight: string // single line of "trust statement"
  span?: "wide" | "tall" | null
}

function buildTiles(projectId: string): LobbyTile[] {
  return [
  {
    href: `/marker-ofek/projects/${projectId}`,
    eyebrow: "🏗️ ניהול פרויקט",
    title: "מסך פרויקט",
    subtitle: "AI Command Center",
    description:
      "מדדי תקציב, אבני דרך, התקדמות מהשטח, ו-AI Copilot עם זיהוי קולי בעברית להוצאת הזמנות רכש בלחיצה.",
    icon: <HardHat className="size-7" />,
    accent: "from-emerald-500/30 via-emerald-500/10 to-cyan-500/20",
    highlight: "₪10M תקציב · +₪84K חיסכון AI · 41% התקדמות",
    span: "wide",
  },
  {
    href: "/marker-ofek/finance",
    eyebrow: "💰 CFO Dashboard",
    title: "מרכז בקרה כספים",
    subtitle: "3-Way Match · Real-time",
    description:
      "התאמת חשבוניות אוטונומית, זיהוי חריגות מחיר, גרף הוצאות וזרימת חיסכון מצטבר.",
    icon: <Wallet className="size-7" />,
    accent: "from-amber-500/25 via-orange-500/10 to-rose-500/20",
    highlight: "92% התאמה אוטומטית · ₪216K חיסכון מצטבר",
  },
  {
    href: "/marker-ofek/projects/gantt",
    eyebrow: "📊 Subcontractor Board",
    title: "תכנון וקבלני משנה",
    subtitle: "Live Gantt + Kanban",
    description:
      "סטטוס משימות חי מהשטח, סינכרון Field App, ופריסת קבלני משנה לפי מקצוע.",
    icon: <GanttChartSquare className="size-7" />,
    accent: "from-sky-500/25 via-blue-500/10 to-indigo-500/20",
    highlight: "9 משימות פעילות · 4 קבלני משנה · מסונכרן עכשיו",
  },
  {
    href: "/marker-ofek/pitch/monetization",
    eyebrow: "💎 חבילות ושירותים",
    title: "חבילות ותמחור",
    subtitle: "3 שכבות · Field · SaaS · AI",
    description:
      "סקירת המודל העסקי של המערכת — Field Access לאתרים, Company OS להנהלה, ו-AI Credits Engine לשימושים מבוססי בינה מלאכותית.",
    icon: <Rocket className="size-7" />,
    accent: "from-fuchsia-500/30 via-violet-500/15 to-indigo-500/20",
    highlight: "$70/פרויקט · ₪2,500/מנוי · Pay-per-Use AI",
    span: "tall",
  },
  ]
}

const HEADLINE_KPIS = [
  {
    label: "פרויקטים פעילים",
    value: "145",
    sub: "Tier 1 PLG",
    icon: <HardHat className="size-4" />,
  },
  {
    label: "חברות Enterprise",
    value: "24",
    sub: "Tier 2 SaaS",
    icon: <Banknote className="size-4" />,
  },
  {
    label: "AI Credits / מ̲ס̲י̲ל̲ה̲",
    value: "1.2M",
    sub: "Tier 3 Pay-per-Use",
    icon: <Zap className="size-4" />,
  },
  {
    label: "MRR Run-rate",
    value: "$184K",
    sub: "+34% MoM",
    icon: <TrendingUp className="size-4" />,
  },
]

export type InvestorPitchLobbyProps = {
  /**
   * Real, DB-resolved project UUID powering the "🏗️ חמ"ל פרויקט" tile href.
   * Falls back to {@link DEFAULT_DEMO_PROJECT_ID} when omitted.
   */
  projectId?: string
}

export function InvestorPitchLobby({
  projectId = DEFAULT_DEMO_PROJECT_ID,
}: InvestorPitchLobbyProps = {}) {
  const tiles = React.useMemo(() => buildTiles(projectId), [projectId])
  return (
    <div
      dir="rtl"
      className="relative min-h-full bg-background text-foreground"
      data-ceo-command-center="lobby"
    >
      {/* Subtle decorative halos — muted alpha so they read as tasteful highlights
          on white, not as dark-mode atmospheric blobs. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-1/3 h-[28rem] w-[28rem] rounded-full bg-emerald-300/20 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 left-1/4 h-[28rem] w-[28rem] rounded-full bg-cyan-300/15 blur-[140px]"
      />

      <div className="relative mx-auto max-w-7xl px-6 py-10 sm:py-14">
        {/* Header */}
        <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              <Sparkles className="size-3" />
              CEO Command Center
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              מרכז שליטה הנהלה
            </h1>
            <p className="max-w-xl text-base text-muted-foreground">
              מבט-על לכל מה שקורה בחברה היום. כל כרטיס למטה משמש כקיצור-דרך
              למסך תפעולי מלא — בלחיצה אחת. ניתן לחזור הנה מכל מסך בכפתור{" "}
              <span className="font-semibold text-emerald-700">בכותרת המערכת</span>.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
            <Mic2 className="size-5 text-emerald-600" />
            <div className="text-xs">
              <div className="font-semibold text-foreground">
                AI Copilot · מיקרופון + צלילי מערכת פעילים
              </div>
              <div className="text-muted-foreground">
                Web Audio API · זיהוי דיבור קולי בעברית בתוך הדפדפן
              </div>
            </div>
          </div>
        </header>

        {/* Headline KPI strip */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {HEADLINE_KPIS.map((k) => (
            <div
              key={k.label}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-emerald-300"
            >
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-medium uppercase tracking-wide">
                  {k.label}
                </span>
                <span className="text-emerald-600">{k.icon}</span>
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                {k.value}
              </div>
              <div className="text-[11px] text-muted-foreground">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Bento navigation grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:auto-rows-[minmax(220px,auto)]">
          {tiles.map((t) => (
            <LobbyCard key={t.href} tile={t} />
          ))}
        </div>

        {/* Footer hint */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-emerald-600" />
            לחיצה ראשונה על המיקרופון של ה-Copilot מאתחלת את ה-AudioContext —
            מאז כל פעולה תשמיע צלילי מערכת דרך הרמקולים.
          </div>
          <div className="flex items-center gap-2">
            <Gauge className="size-4" />
            מדדים מצומתים · תצוגה מזוקקת למסך מלא לאחר לחיצה על כרטיס
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// LobbyCard — single bento tile with hover lift, gradient halo, and CTA chevron
// ============================================================================

function LobbyCard({ tile }: { tile: LobbyTile }) {
  const spanClass =
    tile.span === "wide"
      ? "lg:col-span-2"
      : tile.span === "tall"
        ? "lg:row-span-2"
        : ""

  return (
    <Link
      href={tile.href}
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-emerald-300 hover:shadow-[0_30px_80px_-30px_rgba(16,185,129,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
        spanClass,
      )}
    >
      {/* Soft gradient tint — keeps the bento variety while remaining tasteful
          on a white surface (low-alpha overlays only). */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-50 transition-opacity duration-300 group-hover:opacity-90",
          tile.accent,
        )}
      />
      {/* Diagonal sheen on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-emerald-200/30 to-transparent transition-transform duration-700 group-hover:translate-x-full"
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              {tile.eyebrow}
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {tile.title}
            </h2>
            <div className="text-sm font-medium text-muted-foreground">
              {tile.subtitle}
            </div>
          </div>
          <span className="rounded-2xl border border-emerald-200 bg-emerald-50 p-2.5 text-emerald-700 ring-1 ring-emerald-200/60">
            {tile.icon}
          </span>
        </div>

        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
          {tile.description}
        </p>
      </div>

      <div className="relative mt-6 flex items-center justify-between">
        <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700">
          <BarChart3 className="size-3" />
          {tile.highlight}
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 transition-transform duration-300 group-hover:-translate-x-1">
          כניסה
          <ArrowUpLeft className="size-4" />
        </span>
      </div>
    </Link>
  )
}

// Decorative coin icon used by the headline KPI when needed (kept exported for
// future tile variations; not currently rendered).
export const _PitchCoinIcon = Coins
