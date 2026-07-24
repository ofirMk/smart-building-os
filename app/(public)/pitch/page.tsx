"use client"

import { useState, useMemo } from "react"
import { motion, type Variants } from "framer-motion"
import {
  TrendingUp,
  Zap,
  Bot,
  Users,
  Building2,
  Wallet,
  CheckCircle2,
  ArrowUpRight,
  Layers,
  PiggyBank,
} from "lucide-react"

/* ─────────────────────────────────────────────
   ANIMATION VARIANTS (matches ERP dashboard)
───────────────────────────────────────────── */
const stagger: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
}
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.46, ease: [0.22, 1, 0.36, 1] } },
}
const springHover = { type: "spring" as const, stiffness: 420, damping: 28 }

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */
interface SimInputs {
  totalUnits: number
  transferUnits: number
  mgmtFee: number
  evStationsPerComplex: number
  complexSize: number
  hoaPremium: number
  aiSavingsPct: number
  operatingCostPct: number
  growthY2: number
  growthY3: number
}

const DEFAULTS: SimInputs = {
  totalUnits: 12000,
  transferUnits: 4000,
  mgmtFee: 220,
  evStationsPerComplex: 4,
  complexSize: 200,
  hoaPremium: 60,
  aiSavingsPct: 22,
  operatingCostPct: 68,
  growthY2: 8000,
  growthY3: 12000,
}

/* ─────────────────────────────────────────────
   FORMATTERS
───────────────────────────────────────────── */
const fmt = (n: number) => n.toLocaleString("he-IL")
const ils = (n: number) =>
  Math.round(n).toLocaleString("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0, maximumFractionDigits: 0 })
const pct = (n: number, decimals = 1) => `${n > 0 ? "+" : ""}${n.toFixed(decimals)}%`

/* ─────────────────────────────────────────────
   FINANCIAL MODEL
───────────────────────────────────────────── */
function calc(s: SimInputs) {
  const passiveUnits = s.totalUnits - s.transferUnits
  const numComplexes = Math.round(s.transferUnits / s.complexSize)
  const evRevMonth = numComplexes * s.evStationsPerComplex * 2_800

  const beforeRevMonth = s.totalUnits * s.mgmtFee
  const beforeCost = beforeRevMonth * (s.operatingCostPct / 100)
  const beforeNet = beforeRevMonth - beforeCost

  const smartMgmtRev = s.transferUnits * s.mgmtFee
  const hoaRev = s.transferUnits * s.hoaPremium
  const smartCost = smartMgmtRev * (s.operatingCostPct / 100)
  const aiSavings = smartCost * (s.aiSavingsPct / 100)

  const afterRev = passiveUnits * s.mgmtFee + smartMgmtRev + evRevMonth + hoaRev
  const afterCost = passiveUnits * s.mgmtFee * (s.operatingCostPct / 100) + smartCost - aiSavings
  const afterNet = afterRev - afterCost
  const upliftMonth = afterNet - beforeNet
  const upliftPct = (upliftMonth / beforeNet) * 100

  const calcYear = (smartUnits: number) => {
    const nc = Math.round(smartUnits / s.complexSize)
    const rev = passiveUnits * s.mgmtFee + smartUnits * s.mgmtFee + nc * s.evStationsPerComplex * 2_800 + smartUnits * s.hoaPremium
    const savings = smartUnits * s.mgmtFee * (s.operatingCostPct / 100) * (s.aiSavingsPct / 100)
    const net = rev - (rev * (s.operatingCostPct / 100) - savings)
    return { rev, net, smartUnits, totalUnits: passiveUnits + smartUnits }
  }

  return {
    passiveUnits, numComplexes,
    beforeRevMonth, beforeCost, beforeNet,
    smartMgmtRev, evRevMonth, hoaRev, aiSavings,
    afterRev, afterCost, afterNet,
    upliftMonth, upliftPct,
    y1: calcYear(s.transferUnits),
    y2: calcYear(s.growthY2),
    y3: calcYear(s.growthY3),
    y3UpliftPct: ((calcYear(s.growthY3).net - beforeNet) / beforeNet) * 100,
  }
}

/* ─────────────────────────────────────────────
   SUB-COMPONENTS
───────────────────────────────────────────── */

/** KPI card — matches ERP DashboardKpiCards pattern */
function KpiCard({
  label, value, sub, barColor, icon: Icon,
}: {
  label: string; value: string; sub: string; barColor: string; icon: React.ElementType
}) {
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ scale: 1.02 }}
      transition={springHover}
      className="relative flex min-h-[160px] flex-col overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div className={`absolute end-0 top-0 h-full w-1 ${barColor}`} />
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <p className="mt-auto text-3xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </motion.div>
  )
}

/** Section heading — matches ERP pattern with color bar */
function SectionHeader({ step, title, color }: { step: string; title: string; color: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white ${color}`}>
        {step}
      </span>
      <h2 className="text-xl font-extrabold tracking-tight text-foreground">{title}</h2>
    </div>
  )
}

/** Value proposition card */
function ValueCard({
  icon: Icon, title, body, tone,
}: {
  icon: React.ElementType; title: string; body: string
  tone: "emerald" | "amber" | "blue" | "rose" | "cyan"
}) {
  const tones = {
    emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-200 dark:border-emerald-800", icon: "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40" },
    amber: { bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800", icon: "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40" },
    blue: { bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-200 dark:border-blue-800", icon: "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40" },
    rose: { bg: "bg-rose-50 dark:bg-rose-950/30", border: "border-rose-200 dark:border-rose-800", icon: "text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/40" },
    cyan: { bg: "bg-cyan-50 dark:bg-cyan-950/30", border: "border-cyan-200 dark:border-cyan-800", icon: "text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900/40" },
  }
  const t = tones[tone]
  return (
    <motion.div variants={fadeUp} className={`rounded-xl border p-4 ${t.bg} ${t.border}`}>
      <div className={`mb-3 inline-flex rounded-lg p-2 ${t.icon}`}>
        <Icon className="size-5" />
      </div>
      <p className="mb-1.5 font-semibold text-foreground">{title}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </motion.div>
  )
}

/** Slider control */
function SliderRow({
  label, value, min, max, step, unit, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="font-bold tabular-nums text-foreground">
          {unit === "₪" ? `₪${fmt(value)}` : `${fmt(value)} ${unit}`}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-emerald-500"
      />
    </div>
  )
}

/** Progress bar — matches ERP contract-finance-summary pattern */
function ProgressBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pctVal = Math.min(100, (value / max) * 100)
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-semibold tabular-nums text-foreground">{ils(value)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pctVal}%` }} />
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────── */
export default function PitchPage() {
  const [inputs, setInputs] = useState<SimInputs>(DEFAULTS)
  const set = (k: keyof SimInputs) => (v: number) => setInputs(p => ({ ...p, [k]: v }))
  const m = useMemo(() => calc(inputs), [inputs])

  const today = new Date().toLocaleDateString("he-IL", { year: "numeric", month: "long", day: "numeric" })

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">

      {/* ══════════════════ HERO — matches ERP dashboard header ══════════════════ */}
      <div className="border-b border-border bg-card px-6 py-10 md:py-14">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Smart Building OS · {today}
            </p>
            <h1 className="mb-2 bg-gradient-to-l from-cyan-400 to-blue-600 bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
              שותפות אסטרטגית
            </h1>
            <p className="mb-8 text-lg text-muted-foreground">
              מודל צמיחה חדש לחברת הניהול — מ-{fmt(inputs.totalUnits)} יחידות פאסיביות למנוע רווח רב-ממדי
            </p>
          </motion.div>

          {/* Hero KPIs */}
          <motion.div
            variants={stagger} initial="hidden" animate="show"
            className="grid grid-cols-2 gap-4 md:grid-cols-4"
          >
            <KpiCard
              label="יחידות כיום" value={fmt(inputs.totalUnits)}
              sub="בניהולך הנוכחי" barColor="bg-slate-400"
              icon={Building2}
            />
            <KpiCard
              label="יחידות מועברות" value={fmt(inputs.transferUnits)}
              sub="לפלטפורמה חכמה" barColor="bg-cyan-500"
              icon={Layers}
            />
            <KpiCard
              label="שיפור רווחיות מיידי" value={ils(m.upliftMonth)}
              sub={`${pct(m.upliftPct)}/חודש vs. היום`} barColor="bg-emerald-500"
              icon={TrendingUp}
            />
            <KpiCard
              label="שנה 3 — רווח נטו" value={ils(m.y3.net)}
              sub={`${pct(m.y3UpliftPct, 0)} vs. מצב נוכחי`} barColor="bg-blue-500"
              icon={ArrowUpRight}
            />
          </motion.div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-14 px-4 py-12">

        {/* ══════════════════ 01 BEFORE / AFTER ══════════════════ */}
        <section>
          <SectionHeader step="01" title="לפני ואחרי — תמונת רווחיות חודשית" color="bg-slate-700" />
          <div className="grid gap-4 md:grid-cols-2">

            {/* BEFORE */}
            <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm"
            >
              <div className="mb-5 flex items-center gap-2">
                <span className="inline-block h-6 w-2 rounded-full bg-slate-400" />
                <p className="font-semibold text-muted-foreground">מצב נוכחי — {fmt(inputs.totalUnits)} יחידות פאסיביות</p>
              </div>
              <div className="space-y-3 text-sm">
                {[
                  { label: "הכנסה חודשית", value: ils(m.beforeRevMonth), cls: "text-foreground" },
                  { label: `עלויות תפעול (${inputs.operatingCostPct}%)`, value: `(${ils(m.beforeCost)})`, cls: "text-rose-600 dark:text-rose-400" },
                ].map(r => (
                  <div key={r.label} className="flex justify-between border-b border-border py-2.5">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className={`font-semibold tabular-nums ${r.cls}`}>{r.value}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-1">
                  <span className="font-semibold text-foreground">רווח נטו חודשי</span>
                  <span className="text-xl font-bold tabular-nums text-foreground">{ils(m.beforeNet)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{ils(m.beforeNet * 12)} / שנה</p>
              </div>
            </motion.div>

            {/* AFTER */}
            <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
              className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-6 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/20"
            >
              <div className="mb-5 flex items-center gap-2">
                <span className="inline-block h-6 w-2 rounded-full bg-emerald-500" />
                <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                  אחרי — {fmt(m.passiveUnits)} פאסיב + {fmt(inputs.transferUnits)} Smart
                </p>
              </div>
              <div className="space-y-3 text-sm">
                {[
                  { label: `דמי ניהול — ${fmt(m.passiveUnits + inputs.transferUnits)} יח'`, value: ils(m.smartMgmtRev + m.passiveUnits * inputs.mgmtFee) },
                  { label: `EV Charging — ${m.numComplexes} קומפלקסים`, value: `+${ils(m.evRevMonth)}`, cls: "text-emerald-700 dark:text-emerald-400" },
                  { label: `פרמיית ועד בית (₪${inputs.hoaPremium}/יח')`, value: `+${ils(m.hoaRev)}`, cls: "text-emerald-700 dark:text-emerald-400" },
                  { label: `חיסכון AI (${inputs.aiSavingsPct}% עלויות)`, value: `+${ils(m.aiSavings)}`, cls: "text-emerald-700 dark:text-emerald-400" },
                ].map(r => (
                  <div key={r.label} className="flex justify-between border-b border-emerald-100 py-2.5 dark:border-emerald-900">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className={`font-semibold tabular-nums ${r.cls ?? "text-foreground"}`}>{r.value}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-1">
                  <span className="font-semibold text-foreground">רווח נטו חודשי</span>
                  <span className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{ils(m.afterNet)}</span>
                </div>
              </div>
              <div className="mt-4 rounded-xl bg-emerald-600 px-4 py-3 text-center text-white">
                <p className="text-xs font-medium text-emerald-100">שיפור מיידי</p>
                <p className="text-2xl font-black tabular-nums">+{ils(m.upliftMonth)}/חודש</p>
                <p className="text-sm text-emerald-100">{pct(m.upliftPct)} · {ils(m.upliftMonth * 12)}/שנה</p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ══════════════════ 02 REVENUE BREAKDOWN ══════════════════ */}
        <section>
          <SectionHeader step="02" title="מקורות הכנסה חדשים" color="bg-emerald-600" />
          <motion.div
            initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} viewport={{ once: true }}
            className="rounded-2xl border border-border bg-card p-6 shadow-sm"
          >
            <div className="space-y-5">
              <ProgressBar label={`דמי ניהול — ${fmt(inputs.transferUnits)} יחידות חכמות`} value={m.smartMgmtRev} max={m.afterRev} color="bg-blue-500" />
              <ProgressBar label={`EV Charging — ${m.numComplexes} קומפלקסים × ${inputs.evStationsPerComplex} עמדות`} value={m.evRevMonth} max={m.afterRev} color="bg-emerald-500" />
              <ProgressBar label={`פרמיית ועד בית חכם (₪${inputs.hoaPremium}/יחידה/חודש)`} value={m.hoaRev} max={m.afterRev} color="bg-cyan-500" />
              <ProgressBar label={`חיסכון AI בתפעול (${inputs.aiSavingsPct}%)`} value={m.aiSavings} max={m.afterRev} color="bg-amber-500" />
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-5">
              {[
                { label: "הכנסה נוספת חודשית", value: ils(m.evRevMonth + m.hoaRev), sub: "EV + ועד בית", color: "bg-emerald-500" },
                { label: "חיסכון תפעולי שנתי", value: ils(m.aiSavings * 12), sub: "AI Automation", color: "bg-amber-500" },
                { label: "שיפור שנתי כולל", value: ils(m.upliftMonth * 12), sub: `${pct(m.upliftPct)} vs. היום`, color: "bg-blue-500" },
              ].map(s => (
                <div key={s.label} className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <div className={`mt-0.5 h-8 w-1 shrink-0 rounded-full ${s.color}`} />
                  <div>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="mt-0.5 text-base font-bold tabular-nums text-foreground">{s.value}</p>
                    <p className="text-[11px] text-muted-foreground">{s.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* ══════════════════ 03 3-YEAR GROWTH ══════════════════ */}
        <section>
          <SectionHeader step="03" title="מסלול הצמיחה — 3 שנים" color="bg-blue-600" />
          <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }}
            className="grid gap-4 md:grid-cols-3"
          >
            {[
              { year: "שנה 1 — כניסה", data: m.y1, barColor: "bg-slate-400", accent: false },
              { year: "שנה 2 — השתרשות", data: m.y2, barColor: "bg-cyan-500", accent: false },
              { year: "שנה 3 — סקייל", data: m.y3, barColor: "bg-emerald-500", accent: true },
            ].map(({ year, data, barColor, accent }) => (
              <motion.div
                key={year} variants={fadeUp}
                whileHover={{ scale: 1.02 }} transition={springHover}
                className={`relative overflow-hidden rounded-2xl border p-5 shadow-sm ${
                  accent
                    ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20"
                    : "border-border bg-card"
                }`}
              >
                <div className={`absolute end-0 top-0 h-full w-1 ${barColor}`} />
                <p className={`mb-4 text-sm font-bold ${accent ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>
                  {year}
                </p>
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">יחידות Smart</span>
                    <span className="font-bold tabular-nums text-foreground">{fmt(data.smartUnits)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">סה&quot;כ ביחד</span>
                    <span className="font-bold tabular-nums text-foreground">{fmt(data.totalUnits)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2.5">
                    <span className="font-semibold text-foreground">רווח נטו/חודש</span>
                    <span className={`text-lg font-black tabular-nums ${accent ? "text-emerald-700 dark:text-emerald-300" : "text-foreground"}`}>
                      {ils(data.net)}
                    </span>
                  </div>
                  <p className={`text-[11px] ${accent ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                    {pct((data.net / m.beforeNet - 1) * 100, 0)} vs. היום
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Summary strip */}
          <motion.div
            initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }} viewport={{ once: true }}
            className="mt-4 overflow-hidden rounded-2xl"
          >
            <div className="bg-gradient-to-l from-cyan-400 to-blue-600 p-px">
              <div className="rounded-2xl bg-card px-6 py-5">
                <div className="grid grid-cols-3 gap-6 text-center">
                  {[
                    { label: "רווח נטו שנה 1", value: ils(m.y1.net), sub: "/חודש" },
                    { label: "רווח נטו שנה 2", value: ils(m.y2.net), sub: `${pct((m.y2.net / m.y1.net - 1) * 100, 0)} vs. שנה 1` },
                    { label: "רווח נטו שנה 3", value: ils(m.y3.net), sub: `${pct(m.y3UpliftPct, 0)} vs. היום` },
                  ].map(s => (
                    <div key={s.label}>
                      <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                      <p className="mt-1 bg-gradient-to-l from-cyan-400 to-blue-600 bg-clip-text text-2xl font-black tabular-nums text-transparent">{s.value}</p>
                      <p className="text-xs text-muted-foreground">{s.sub}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* ══════════════════ 04 INTERACTIVE SIMULATOR ══════════════════ */}
        <section>
          <SectionHeader step="04" title="סימולטור — שנה את הפרמטרים" color="bg-amber-600" />
          <div className="grid gap-6 md:grid-cols-2">

            {/* Sliders */}
            <motion.div
              initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }} viewport={{ once: true }}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm"
            >
              <p className="mb-5 border-b border-border pb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                משתנים עסקיים
              </p>
              <div className="space-y-6">
                <SliderRow label="סך יחידות כיום" value={inputs.totalUnits} min={3000} max={30000} step={500} unit="יחידות" onChange={set("totalUnits")} />
                <SliderRow label="יחידות מועברות ל-Smart" value={inputs.transferUnits} min={500} max={Math.round(inputs.totalUnits * 0.6)} step={500} unit="יחידות" onChange={set("transferUnits")} />
                <SliderRow label="דמי ניהול ליחידה/חודש" value={inputs.mgmtFee} min={100} max={600} step={10} unit="₪" onChange={set("mgmtFee")} />
                <SliderRow label="פרמיית ועד בית חכם" value={inputs.hoaPremium} min={20} max={200} step={10} unit="₪" onChange={set("hoaPremium")} />
                <SliderRow label="עמדות EV לקומפלקס" value={inputs.evStationsPerComplex} min={2} max={20} step={1} unit="עמדות" onChange={set("evStationsPerComplex")} />
                <SliderRow label="חיסכון AI בעלויות תפעול" value={inputs.aiSavingsPct} min={10} max={40} step={1} unit="%" onChange={set("aiSavingsPct")} />
              </div>
            </motion.div>

            {/* Live results */}
            <motion.div
              initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }} viewport={{ once: true }}
              className="space-y-4"
            >
              <div className="overflow-hidden rounded-2xl bg-gradient-to-bl from-blue-600 to-cyan-500 p-px">
                <div className="rounded-2xl bg-card p-6 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">שיפור רווחיות שנתי מיידי</p>
                  <p className="mt-2 bg-gradient-to-l from-cyan-400 to-blue-600 bg-clip-text text-5xl font-black tabular-nums text-transparent">
                    {ils(m.upliftMonth * 12)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {pct(m.upliftPct)} שיפור על {fmt(inputs.transferUnits)} יחידות
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "הכנסת EV שנתית", value: ils(m.evRevMonth * 12), sub: `${m.numComplexes} קומפלקסים`, barColor: "bg-emerald-500" },
                  { label: "חיסכון AI שנתי", value: ils(m.aiSavings * 12), sub: "פחות כח אדם + תחזוקה", barColor: "bg-amber-500" },
                  { label: "רווח נטו/חודש עכשיו", value: ils(m.afterNet), sub: `vs. ${ils(m.beforeNet)} היום`, barColor: "bg-blue-500" },
                  { label: "רווח נטו שנה 3", value: ils(m.y3.net), sub: `${fmt(m.y3.totalUnits)} יחידות`, barColor: "bg-cyan-500" },
                ].map(s => (
                  <div key={s.label} className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-3 shadow-sm">
                    <div className={`mt-1 h-8 w-1 shrink-0 rounded-full ${s.barColor}`} />
                    <div>
                      <p className="text-[11px] text-muted-foreground">{s.label}</p>
                      <p className="font-bold tabular-nums text-foreground">{s.value}</p>
                      <p className="text-[10px] text-muted-foreground">{s.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ══════════════════ 05 VALUE PROPS ══════════════════ */}
        <section>
          <SectionHeader step="05" title="מה אתה מקבל — לא מה שאתה מוותר" color="bg-cyan-600" />
          <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }}
            className="grid gap-4 md:grid-cols-3"
          >
            <ValueCard icon={Zap} tone="emerald" title="EV Charging — הכנסה חדשה" body={`${m.numComplexes} קומפלקסים × ${inputs.evStationsPerComplex} עמדות = ${ils(m.evRevMonth * 12)}/שנה נטו. מרווח 15–25% על מחיר IEC, אפס CapEx.`} />
            <ValueCard icon={Bot} tone="amber" title="AI Agents + אוטומציה" body={`חיסכון ${inputs.aiSavingsPct}% בעלויות תפעול = ${ils(m.aiSavings * 12)}/שנה. תחזוקה מונעת שמקטינה תקלות ב-35%.`} />
            <ValueCard icon={Users} tone="blue" title="שותף יזם אסטרטגי" body={`כניסת משקיע שמביא פרויקטים חדשים. ${fmt(inputs.transferUnits)} יחידות → ${fmt(inputs.growthY3)} יחידות תוך 3 שנים.`} />
            <ValueCard icon={CheckCircle2} tone="cyan" title="ועד בית דיגיטלי" body={`הצבעות דיגיטליות, תקציבים שקופים, ארכיון 7 שנים. פרמיה ₪${inputs.hoaPremium}/יחידה/חודש = ${ils(m.hoaRev)}/חודש.`} />
            <ValueCard icon={Wallet} tone="rose" title="לא כל הביצים בסל אחד" body={`${fmt(m.passiveUnits)} יחידות נשארות בניהולך כרגיל. פיזור סיכונים + שני מנועי צמיחה במקביל.`} />
            <ValueCard icon={PiggyBank} tone="emerald" title="שיפור NPS ושמירה על דיירים" body="NPS עולה מ-15 ל-55+. שביעות רצון גבוהה = עמידות גבוהה יותר. WhatsApp NLP + אפליקציית דייר מלאה." />
          </motion.div>
        </section>

        {/* ══════════════════ 06 SUMMARY TABLE ══════════════════ */}
        <section>
          <SectionHeader step="06" title="טבלת סיכום — 3 שנים" color="bg-slate-700" />
          <motion.div
            initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }} viewport={{ once: true }}
            className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="p-4 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">מדד</th>
                    <th className="p-4 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">היום</th>
                    <th className="p-4 text-center text-[11px] font-semibold uppercase tracking-wider text-foreground">שנה 1</th>
                    <th className="p-4 text-center text-[11px] font-semibold uppercase tracking-wider text-foreground">שנה 2</th>
                    <th className="p-4 text-center text-[11px] font-semibold uppercase tracking-wider text-emerald-700">שנה 3</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "יחידות בניהול", v0: fmt(inputs.totalUnits), v1: fmt(m.y1.totalUnits), v2: fmt(m.y2.totalUnits), v3: fmt(m.y3.totalUnits) },
                    { label: "יחידות Smart", v0: "0", v1: fmt(m.y1.smartUnits), v2: fmt(m.y2.smartUnits), v3: fmt(m.y3.smartUnits) },
                    { label: "הכנסה חודשית", v0: ils(m.beforeRevMonth), v1: ils(m.afterRev), v2: ils(m.y2.rev), v3: ils(m.y3.rev) },
                    { label: "רווח נטו חודשי", v0: ils(m.beforeNet), v1: ils(m.afterNet), v2: ils(m.y2.net), v3: ils(m.y3.net), bold: true },
                    { label: "שיפור vs. היום", v0: "—", v1: pct(m.upliftPct), v2: pct((m.y2.net / m.beforeNet - 1) * 100, 0), v3: pct(m.y3UpliftPct, 0), bold: true, green: true },
                  ].map((row, i) => (
                    <tr key={row.label} className={`border-b border-border ${i % 2 === 0 ? "" : "bg-muted/30"}`}>
                      <td className="p-4 font-medium text-foreground">{row.label}</td>
                      <td className="p-4 text-center tabular-nums text-muted-foreground">{row.v0}</td>
                      <td className={`p-4 text-center tabular-nums ${row.bold ? "font-bold text-foreground" : "text-foreground"}`}>{row.v1}</td>
                      <td className={`p-4 text-center tabular-nums ${row.bold ? "font-bold text-foreground" : "text-foreground"}`}>{row.v2}</td>
                      <td className={`p-4 text-center tabular-nums ${row.bold ? "font-black" : "font-semibold"} ${row.green ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"}`}>{row.v3}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </section>

        {/* ══════════════════ CTA FOOTER ══════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }} viewport={{ once: true }}
          className="overflow-hidden rounded-2xl"
        >
          <div className="bg-gradient-to-l from-cyan-400 to-blue-600 p-px">
            <div className="rounded-2xl bg-card px-8 py-8 text-center">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Smart Building OS · {today}</p>
              <h3 className="mb-2 text-3xl font-extrabold tracking-tight text-foreground">הצעד הבא</h3>
              <p className="mb-6 text-muted-foreground">
                מודל ניסיון — {fmt(Math.round(inputs.transferUnits / 4))} יחידות בקומפלקס אחד · 60 יום POC · אפס עלות
              </p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                {[
                  { label: "שיפור שנתי מיידי", value: ils(m.upliftMonth * 12) },
                  { label: "להכפיל את הפעילות", value: "3 שנים" },
                  { label: "שיפור רווחיות Y3", value: pct(m.y3UpliftPct, 0) },
                ].map(s => (
                  <div key={s.label} className="rounded-xl border border-border bg-background p-4">
                    <p className="bg-gradient-to-l from-cyan-400 to-blue-600 bg-clip-text text-2xl font-black tabular-nums text-transparent">{s.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        <p className="pb-8 text-center text-xs text-muted-foreground">
          Smart Building OS · סימולטור שותפות אסטרטגית · כל הנתונים מבוססים על פרמטרים מוזנים ומדדי שוק
        </p>
      </div>
    </div>
  )
}
