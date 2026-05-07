"use client"

/**
 * MonetizationShowcase — investor-facing 3-tier monetization story.
 *
 * Pure UI, mock data only (no DB / no fetches). Designed as the closing
 * "growth engine" segment of the live pitch. Each tier is a tall card with
 * its own gradient accent, KPI inline, and a one-line value prop.
 *
 * Tier 3 includes a custom SVG **AI Credits gauge** (semi-circular dial) plus
 * an animated bar visualisation of cumulative engineering tokens consumed —
 * the "exponential profit" beat the CEO asked for.
 */

import * as React from "react"
import Link from "next/link"
import {
  ArrowUpLeft,
  Brain,
  Building2,
  Cpu,
  HardHat,
  PiggyBank,
  Rocket,
  TrendingUp,
  Zap,
} from "lucide-react"

import { cn } from "@/lib/utils"

// ============================================================================
// Tier data
// ============================================================================

type Tier = {
  rank: 1 | 2 | 3
  badge: string
  title: string
  subtitle: string
  price: string
  priceSub: string
  metric: { value: string; label: string }
  description: string
  bullets: string[]
  icon: React.ReactNode
  accent: string
}

const TIERS: Tier[] = [
  {
    rank: 1,
    badge: "Tier 1 · PLG Field Access",
    title: "חדירה לשטח",
    subtitle: "Bottom-Up · Foreman-First",
    price: "$70",
    priceSub: "/ פרויקט / חודש",
    metric: { value: "145", label: "פרויקטים פעילים" },
    description:
      "Land-and-expand: כל מנהל עבודה בישראל יכול לפתוח משתמש ב-PWA תוך 30 שניות. אחרי 30 ימי ניסיון, ₪70 לחודש לכל אתר פעיל.",
    bullets: [
      "Field App עם בדיקות וצ'ק-ליסטים אופליין",
      "צ'אט WhatsApp-style עם הקבלן הראשי",
      "Adoption viral בקרב צוותי שטח — צמיחה אורגנית",
    ],
    icon: <HardHat className="size-7" />,
    accent: "from-emerald-500/30 via-emerald-500/10 to-cyan-500/20",
  },
  {
    rank: 2,
    badge: "Tier 2 · Company OS · SaaS",
    title: "מנוי הנהלה ארגוני",
    subtitle: "Top-Down · CFO + COO",
    price: "₪2,500",
    priceSub: "+ / חודש לחברה",
    metric: { value: "24", label: "חברות Enterprise" },
    description:
      "המוצר השלם: שרשרת רכש, 3-Way Match, חוזים, גאנט מולטי-פרויקט, ודשבורד CEO. תמחור מדורג לפי מס׳ פרויקטים פעילים וגישת AI.",
    bullets: [
      "ניהול שרשרת רכש דטרמיניסטית מקצה לקצה",
      "התאמת חשבוניות 3-Way אוטונומית · חיסכון מצטבר",
      "תיקי הוצאות, מעקב חוזים, וניהול כספים מלא",
    ],
    icon: <Building2 className="size-7" />,
    accent: "from-violet-500/30 via-fuchsia-500/15 to-rose-500/20",
  },
  {
    rank: 3,
    badge: "Tier 3 · AI Credits Engine",
    title: "מנוע הרווח האקספוננציאלי",
    subtitle: "Pay-per-Use · Engineering Tokens",
    price: "₪0.42",
    priceSub: "/ AI Credit (משתנה)",
    metric: { value: "1.2M", label: "Credits החודש" },
    description:
      "כל קריאה ל-AI הנדסי (Vision-to-PO, Drawing Extraction, Smart Match) צורכת Credits. ככל שהמערכת חכמה יותר → יותר use-cases → MRR מתגבר. **זה ה-margin המעופף**.",
    bullets: [
      "Vision-to-PO · 12 Credits לקריאה",
      "Autodesk Drawing Extraction · 80 Credits לתוכנית",
      "3-Way Match Reasoning · 4 Credits לחשבונית",
    ],
    icon: <Brain className="size-7" />,
    accent: "from-amber-500/30 via-orange-500/15 to-rose-500/20",
  },
]

// ============================================================================
// Page
// ============================================================================

export function MonetizationShowcase() {
  return (
    <div
      dir="rtl"
      className="relative min-h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100"
      data-investor-pitch="monetization"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/4 h-[28rem] w-[28rem] rounded-full bg-fuchsia-500/20 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 right-1/4 h-[28rem] w-[28rem] rounded-full bg-amber-500/20 blur-[140px]"
      />

      <div className="relative mx-auto max-w-7xl px-6 py-10 sm:py-14">
        {/* Back link */}
        <Link
          href="/marker-ofek/pitch"
          className="mb-6 inline-flex items-center gap-2 text-sm text-emerald-300 hover:text-emerald-200"
        >
          <ArrowUpLeft className="size-4 rotate-180" />
          חזרה ללובי המשקיעים
        </Link>

        <header className="mb-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-400/30 bg-fuchsia-400/10 px-3 py-1 text-xs font-medium text-fuchsia-300">
            <Rocket className="size-3" />
            Growth & Monetization
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            מנוע הצמיחה — שלוש שכבות
          </h1>
          <p className="text-base text-slate-300">
            מודל מסחור מדורג שמאפשר חדירה אורגנית בשטח, רוחב ארגוני, ומנוף רווח
            אקספוננציאלי. מדורג לפי{" "}
            <span className="font-semibold text-emerald-300">ARPU עולה</span> —
            כל לקוח שעולה רמה משלם פי 3-10.
          </p>
        </header>

        {/* Tier cards */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <TierCard key={tier.rank} tier={tier} />
          ))}
        </div>

        {/* AI Credits gauge + bars */}
        <section className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <AiCreditsGauge />
          <AiCreditsHistory />
        </section>

        {/* Closing summary strip */}
        <section className="mt-10 rounded-3xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/10 via-cyan-500/5 to-slate-900/60 p-6 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Combined Run-rate
              </div>
              <h3 className="text-2xl font-bold tracking-tight">
                MRR משולב $184K · +34% MoM
              </h3>
              <p className="max-w-xl text-sm text-slate-300">
                Tier 1 מזין את Tier 2, Tier 2 מזין את Tier 3. AI Credits הם
                המתאוצץ — ככל שהמערכת חכמה יותר, רווחיות הקריאה הבודדת עולה.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Stat icon={<PiggyBank />} value="$184K" sub="MRR" />
              <Stat icon={<TrendingUp />} value="+34%" sub="MoM" />
              <Stat icon={<Zap />} value="1.2M" sub="Credits / mo" />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

// ============================================================================
// Tier card
// ============================================================================

function TierCard({ tier }: { tier: Tier }) {
  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70 p-6 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40 hover:shadow-[0_30px_80px_-30px_rgba(16,185,129,0.45)]",
      )}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-50 transition-opacity duration-300 group-hover:opacity-90",
          tier.accent,
        )}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/90">
              {tier.badge}
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">
              {tier.title}
            </h2>
            <div className="text-sm text-slate-300">{tier.subtitle}</div>
          </div>
          <span className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-emerald-200 ring-1 ring-emerald-400/20">
            {tier.icon}
          </span>
        </div>

        <div className="mt-5 flex items-end gap-2">
          <div className="text-4xl font-extrabold tracking-tight text-white">
            {tier.price}
          </div>
          <div className="pb-1 text-xs text-slate-400">{tier.priceSub}</div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
          <span className="font-bold tabular-nums">{tier.metric.value}</span>
          <span>{tier.metric.label}</span>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-slate-300">
          {tier.description}
        </p>

        <ul className="mt-4 space-y-2">
          {tier.bullets.map((b) => (
            <li
              key={b}
              className="flex items-start gap-2 text-sm text-slate-200"
            >
              <span className="mt-1 inline-block size-1.5 shrink-0 rounded-full bg-emerald-400" />
              {b}
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}

// ============================================================================
// AI Credits gauge — semi-circular SVG dial showing this month's consumption
// ============================================================================

function AiCreditsGauge() {
  // Data: 1.2M credits consumed of a 1.5M monthly capacity.
  const consumed = 1_200_000
  const capacity = 1_500_000
  const pct = Math.min(1, consumed / capacity)
  const angle = -90 + pct * 180 // -90deg (left) → +90deg (right)

  // SVG arc from -90deg to +90deg, radius 100, center 120,120.
  const cx = 120
  const cy = 120
  const r = 90
  const startX = cx - r
  const startY = cy
  const endX = cx + Math.cos((angle * Math.PI) / 180) * r
  const endY = cy + Math.sin((angle * Math.PI) / 180) * r
  const largeArc = pct > 0.5 ? 1 : 0
  const fullEndX = cx + r
  const fullEndY = cy

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70 p-6 backdrop-blur">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/90">
        AI Credits Engine · Live
      </div>
      <h3 className="mt-1 text-xl font-bold tracking-tight text-white">
        צריכת אסימוני AI הנדסיים — חודש נוכחי
      </h3>

      <div className="mt-4 flex flex-col items-center">
        <svg
          viewBox="0 0 240 140"
          className="w-full max-w-md"
          role="img"
          aria-label={`Gauge: ${consumed.toLocaleString()} of ${capacity.toLocaleString()} credits`}
        >
          <defs>
            <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="60%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>
          {/* Track */}
          <path
            d={`M ${startX} ${startY} A ${r} ${r} 0 1 1 ${fullEndX} ${fullEndY}`}
            fill="none"
            stroke="rgba(148,163,184,0.18)"
            strokeWidth="14"
            strokeLinecap="round"
          />
          {/* Filled value */}
          <path
            d={`M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`}
            fill="none"
            stroke="url(#gauge-grad)"
            strokeWidth="14"
            strokeLinecap="round"
          />
          {/* Center label */}
          <text
            x="120"
            y="105"
            textAnchor="middle"
            className="fill-white"
            style={{ fontSize: 28, fontWeight: 700 }}
          >
            {(consumed / 1_000_000).toFixed(2)}M
          </text>
          <text
            x="120"
            y="125"
            textAnchor="middle"
            className="fill-slate-400"
            style={{ fontSize: 11 }}
          >
            of {(capacity / 1_000_000).toFixed(1)}M Credits
          </text>
        </svg>

        <div className="mt-4 flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
          <Cpu className="size-3" />
          {Math.round(pct * 100)}% utilisation · projected MRR ₪
          {(consumed * 0.42).toLocaleString("he-IL")} this month
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// AI Credits history — animated bar chart of last 6 months
// ============================================================================

const HISTORY = [
  { month: "ינואר", credits: 280_000 },
  { month: "פברואר", credits: 420_000 },
  { month: "מרץ", credits: 540_000 },
  { month: "אפריל", credits: 720_000 },
  { month: "מאי", credits: 980_000 },
  { month: "יוני", credits: 1_200_000 },
]

function AiCreditsHistory() {
  const max = Math.max(...HISTORY.map((h) => h.credits))

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70 p-6 backdrop-blur">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/90">
        Run-rate · Last 6 Months
      </div>
      <h3 className="mt-1 text-xl font-bold tracking-tight text-white">
        צמיחה אקספוננציאלית של צריכת AI Credits
      </h3>
      <p className="mt-1 text-xs text-slate-400">
        סך אסימונים שנצרכו בכל חודש · מודגש: 4.3× צמיחה בחצי שנה
      </p>

      <div className="mt-6 flex h-[220px] items-end justify-between gap-2">
        {HISTORY.map((h, i) => {
          const heightPct = Math.round((h.credits / max) * 100)
          const isPeak = i === HISTORY.length - 1
          return (
            <div
              key={h.month}
              className="group flex flex-1 flex-col items-center gap-2"
            >
              <span className="text-[11px] font-semibold tabular-nums text-slate-200">
                {(h.credits / 1000).toFixed(0)}K
              </span>
              <div
                className={cn(
                  "w-full rounded-t-md transition-transform duration-500 group-hover:scale-[1.04]",
                  isPeak
                    ? "bg-gradient-to-t from-fuchsia-500 via-violet-500 to-emerald-400 shadow-[0_0_30px_-5px_rgba(168,85,247,0.6)]"
                    : "bg-gradient-to-t from-emerald-600 via-cyan-500 to-cyan-300",
                )}
                style={{ height: `${heightPct}%`, minHeight: 14 }}
              />
              <span
                className={cn(
                  "text-[10px]",
                  isPeak
                    ? "font-semibold text-fuchsia-200"
                    : "text-slate-500",
                )}
              >
                {h.month}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Stat — small badge in the closing summary bar
// ============================================================================

function Stat({
  icon,
  value,
  sub,
}: {
  icon: React.ReactNode
  value: string
  sub: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 backdrop-blur">
      <span className="text-emerald-300">{icon}</span>
      <div>
        <div className="text-base font-bold tabular-nums text-white">
          {value}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-slate-400">
          {sub}
        </div>
      </div>
    </div>
  )
}
