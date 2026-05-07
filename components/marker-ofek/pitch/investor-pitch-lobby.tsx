"use client"

/**
 * InvestorPitchLobby — dark-mode bento landing surface for the live demo.
 *
 * Designed to be the **single screen the CEO returns to** between segments.
 * Each tile is a giant, vivid, click-anywhere navigation card. No sidebar,
 * no dependencies on `MARKER_OFEK_SIDEBAR_SECTIONS`, no DB calls — pure
 * client-side mock content so it cannot fail mid-pitch.
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

const DEMO_PROJECT_ID = "8599ee46-50a7-4a5e-b219-e853ff093cc6"

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

const TILES: LobbyTile[] = [
  {
    href: `/marker-ofek/projects/${DEMO_PROJECT_ID}`,
    eyebrow: "🏗️ Project Command",
    title: "חמ\"ל פרויקט",
    subtitle: "AI Command Center",
    description:
      "Bento KPIs, אבני דרך חיות, ו-AI Copilot עם זיהוי קולי וצלילי SFX אמיתיים. זה הלב של המוצר.",
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
    eyebrow: "💎 Growth Engine",
    title: "מנוע הצמיחה והמודל העסקי",
    subtitle: "3-Tier Monetization",
    description:
      "PLG בשטח · Company OS Enterprise · AI Credits Engine. כך אנחנו ממנפים שוק של ₪Bn.",
    icon: <Rocket className="size-7" />,
    accent: "from-fuchsia-500/30 via-violet-500/15 to-indigo-500/20",
    highlight: "$70/פרויקט · ₪2,500/מנוי · Pay-per-Use AI",
    span: "tall",
  },
]

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

export function InvestorPitchLobby() {
  return (
    <div
      dir="rtl"
      className="relative min-h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100"
      data-investor-pitch="lobby"
    >
      {/* Decorative ambient lights */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-1/3 h-[28rem] w-[28rem] rounded-full bg-emerald-500/20 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 left-1/4 h-[28rem] w-[28rem] rounded-full bg-fuchsia-500/20 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 left-1/2 h-[20rem] w-[20rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]"
      />

      <div className="relative mx-auto max-w-7xl px-6 py-10 sm:py-14">
        {/* Header */}
        <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
              <Sparkles className="size-3" />
              Investor Pitch · Pitch Ready Mode
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              חמ&quot;ל משקיעים
            </h1>
            <p className="max-w-xl text-base text-slate-300">
              נקודת זינוק יחידה למצגת. כל כרטיס למטה מנתב למסך הדגמה אינטראקטיבי
              מלא — בלחיצה אחת. ניתן לחזור לכאן מכל מקום בכפתור{" "}
              <span className="font-semibold text-emerald-300">🚀 בכותרת</span>.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-slate-700/60 bg-slate-900/60 px-4 py-3 backdrop-blur">
            <Mic2 className="size-5 text-emerald-300" />
            <div className="text-xs">
              <div className="font-semibold text-slate-100">
                Live Audio + SFX מופעלים
              </div>
              <div className="text-slate-400">
                Web Audio API · ללא קבצים חיצוניים
              </div>
            </div>
          </div>
        </header>

        {/* Headline KPI strip */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {HEADLINE_KPIS.map((k) => (
            <div
              key={k.label}
              className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur transition-colors hover:border-emerald-500/40"
            >
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px] font-medium uppercase tracking-wide">
                  {k.label}
                </span>
                <span className="text-emerald-300">{k.icon}</span>
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-slate-50">
                {k.value}
              </div>
              <div className="text-[11px] text-slate-500">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Bento navigation grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:auto-rows-[minmax(220px,auto)]">
          {TILES.map((t) => (
            <LobbyCard key={t.href} tile={t} />
          ))}
        </div>

        {/* Footer hint */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400 backdrop-blur">
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-emerald-300" />
            לחיצה ראשונה על המיקרופון של ה-Copilot מאתחלת את ה-AudioContext —
            מאז כל פעולה תשמיע SFX אמיתי דרך הרמקולים.
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <Gauge className="size-4" />
            כל המספרים בתצוגה מבוססי mock קבועים · לא תלויים ב-DB
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
        "group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70 p-6 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40 hover:shadow-[0_30px_80px_-30px_rgba(16,185,129,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
        spanClass,
      )}
    >
      {/* Gradient halo */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-60 transition-opacity duration-300 group-hover:opacity-100",
          tile.accent,
        )}
      />
      {/* Diagonal sheen on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full"
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/90">
              {tile.eyebrow}
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {tile.title}
            </h2>
            <div className="text-sm font-medium text-slate-300">
              {tile.subtitle}
            </div>
          </div>
          <span className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-emerald-200 ring-1 ring-emerald-400/20 backdrop-blur">
            {tile.icon}
          </span>
        </div>

        <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300">
          {tile.description}
        </p>
      </div>

      <div className="relative mt-6 flex items-center justify-between">
        <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-medium text-emerald-200">
          <BarChart3 className="size-3" />
          {tile.highlight}
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-200 transition-transform duration-300 group-hover:-translate-x-1">
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
