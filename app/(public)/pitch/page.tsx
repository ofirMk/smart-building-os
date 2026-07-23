"use client"

import { useState, useMemo } from "react"

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */
interface SimInputs {
  totalUnits: number        // Partner's total current units
  transferUnits: number     // Units transferred to Smart Building OS
  mgmtFee: number           // Monthly management fee per unit (₪)
  evStationsPerComplex: number
  complexSize: number       // Units per complex
  hoaPremium: number        // Extra HOA fee per unit per month (₪)
  aiSavingsPct: number      // % operational cost reduction on smart units
  operatingCostPct: number  // Current operating cost as % of revenue
  growthY2: number          // Smart units in Y2
  growthY3: number          // Smart units in Y3
}

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
const fmt = (n: number, decimals = 0) =>
  n.toLocaleString("he-IL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

const ils = (n: number) => `₪${fmt(Math.round(n))}`

/* ─────────────────────────────────────────────
   FINANCIAL MODEL
───────────────────────────────────────────── */
function calcModel(s: SimInputs) {
  const passiveUnits = s.totalUnits - s.transferUnits
  const numComplexes = Math.round(s.transferUnits / s.complexSize)

  // ── BEFORE (12,000 passive) ──
  const beforeRevMonth = s.totalUnits * s.mgmtFee
  const beforeCostMonth = beforeRevMonth * (s.operatingCostPct / 100)
  const beforeNetMonth = beforeRevMonth - beforeCostMonth

  // ── AFTER — Year 1 ──
  const passiveRevMonth = passiveUnits * s.mgmtFee

  const smartMgmtRev = s.transferUnits * s.mgmtFee
  const evRevMonth = numComplexes * s.evStationsPerComplex * 2_800   // ~₪2,800/station/month net
  const hoaRevMonth = s.transferUnits * s.hoaPremium
  const smartTotalRevMonth = smartMgmtRev + evRevMonth + hoaRevMonth

  const smartCostMonth = smartMgmtRev * (s.operatingCostPct / 100)
  const aiSavings = smartCostMonth * (s.aiSavingsPct / 100)

  const afterRevMonth = passiveRevMonth + smartTotalRevMonth
  const afterCostMonth = passiveUnits * s.mgmtFee * (s.operatingCostPct / 100)
    + smartCostMonth - aiSavings
  const afterNetMonth = afterRevMonth - afterCostMonth

  const upliftMonth = afterNetMonth - beforeNetMonth
  const upliftPct = (upliftMonth / beforeNetMonth) * 100

  // ── YEAR 3 PROJECTION ──
  const smartUnitsY3 = s.growthY3
  const numComplexesY3 = Math.round(smartUnitsY3 / s.complexSize)
  const y3Rev = passiveUnits * s.mgmtFee
    + smartUnitsY3 * s.mgmtFee
    + numComplexesY3 * s.evStationsPerComplex * 2_800
    + smartUnitsY3 * s.hoaPremium
  const y3CostSavings = smartUnitsY3 * s.mgmtFee * (s.operatingCostPct / 100) * (s.aiSavingsPct / 100)
  const y3Net = y3Rev - (y3Rev * (s.operatingCostPct / 100) - y3CostSavings)

  return {
    passiveUnits,
    numComplexes,
    beforeRevMonth,
    beforeCostMonth,
    beforeNetMonth,
    passiveRevMonth,
    smartMgmtRev,
    evRevMonth,
    hoaRevMonth,
    smartTotalRevMonth,
    aiSavings,
    afterRevMonth,
    afterCostMonth,
    afterNetMonth,
    upliftMonth,
    upliftPct,
    y3Rev,
    y3Net,
    y3NetUpliftPct: ((y3Net - beforeNetMonth) / beforeNetMonth) * 100,
    smartUnitsY3,
  }
}

/* ─────────────────────────────────────────────
   DEFAULTS
───────────────────────────────────────────── */
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
   SLIDER COMPONENT
───────────────────────────────────────────── */
function Slider({
  label, value, min, max, step, unit, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-bold text-indigo-700">{unit === "₪" ? `₪${fmt(value)}` : `${fmt(value)}${unit}`}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-indigo-600"
      />
    </div>
  )
}

/* ─────────────────────────────────────────────
   STAT CARD
───────────────────────────────────────────── */
function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-4 ${accent ? "bg-indigo-600 text-white" : "bg-white border border-slate-200"}`}>
      <p className={`text-xs mb-1 ${accent ? "text-indigo-200" : "text-slate-500"}`}>{label}</p>
      <p className={`text-2xl font-black ${accent ? "text-white" : "text-slate-900"}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${accent ? "text-indigo-200" : "text-slate-400"}`}>{sub}</p>}
    </div>
  )
}

/* ─────────────────────────────────────────────
   BAR CHART (pure CSS)
───────────────────────────────────────────── */
function BarChart({ bars }: { bars: { label: string; value: number; color: string; max: number }[] }) {
  return (
    <div className="space-y-3">
      {bars.map(b => (
        <div key={b.label}>
          <div className="flex justify-between text-xs text-slate-600 mb-1">
            <span>{b.label}</span>
            <span className="font-bold">{ils(b.value)}</span>
          </div>
          <div className="h-5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${b.color}`}
              style={{ width: `${Math.min(100, (b.value / b.max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────────
   YEAR CARD
───────────────────────────────────────────── */
function YearCard({
  year, smartUnits, passiveUnits, netMonthly, highlight
}: {
  year: string; smartUnits: number; passiveUnits: number; netMonthly: number; highlight?: boolean
}) {
  return (
    <div className={`rounded-2xl p-5 border-2 ${highlight
      ? "border-indigo-500 bg-indigo-50"
      : "border-slate-200 bg-white"
      }`}>
      <p className={`text-sm font-bold mb-3 ${highlight ? "text-indigo-700" : "text-slate-500"}`}>{year}</p>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">יחידות Smart</span>
          <span className="font-bold text-indigo-700">{fmt(smartUnits)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">יחידות Passive</span>
          <span className="font-bold text-slate-700">{fmt(passiveUnits)}</span>
        </div>
        <div className="flex justify-between border-t pt-2 mt-2">
          <span className="text-slate-600 font-medium">רווח נטו חודשי</span>
          <span className={`font-black text-base ${highlight ? "text-indigo-700" : "text-slate-900"}`}>
            {ils(netMonthly)}
          </span>
        </div>
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

  const m = useMemo(() => calcModel(inputs), [inputs])

  const today = new Date().toLocaleDateString("he-IL", {
    year: "numeric", month: "long", day: "numeric",
  })

  /* ── Y2 estimate (linear interpolation) ── */
  const y2SmartUnits = inputs.growthY2
  const y2NumComplexes = Math.round(y2SmartUnits / inputs.complexSize)
  const y2Rev = m.passiveUnits * inputs.mgmtFee
    + y2SmartUnits * inputs.mgmtFee
    + y2NumComplexes * inputs.evStationsPerComplex * 2_800
    + y2SmartUnits * inputs.hoaPremium
  const y2CostSavings = y2SmartUnits * inputs.mgmtFee * (inputs.operatingCostPct / 100) * (inputs.aiSavingsPct / 100)
  const y2Net = y2Rev - (y2Rev * (inputs.operatingCostPct / 100) - y2CostSavings)

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900" dir="rtl">

      {/* ══════════════════ HERO ══════════════════ */}
      <div className="bg-gradient-to-bl from-indigo-700 via-indigo-800 to-slate-900 text-white px-6 py-12 md:py-16">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-10">
            <div>
              <p className="text-indigo-300 text-sm mb-1">{today}</p>
              <h1 className="text-3xl md:text-5xl font-black leading-tight">
                הצעת שותפות אסטרטגית
              </h1>
              <p className="text-indigo-200 mt-2 text-lg">
                מודל צמיחה חדש לחברת הניהול שלך
              </p>
            </div>
            <div className="bg-white/10 rounded-2xl p-5 min-w-[200px] text-center backdrop-blur-sm">
              <p className="text-indigo-200 text-xs mb-1">פלטפורמה</p>
              <p className="text-2xl font-black">Smart Building OS</p>
              <p className="text-indigo-300 text-xs mt-1">ניהול נכסים דור הבא</p>
            </div>
          </div>

          {/* Hero KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "יחידות דיור כיום", value: fmt(inputs.totalUnits), sub: "בניהולך" },
              { label: "יחידות מועברות", value: fmt(inputs.transferUnits), sub: "לפלטפורמה חכמה" },
              { label: "יחידות נשארות", value: fmt(m.passiveUnits), sub: "עסק קיים" },
              { label: "צמיחה תוך 3 שנים", value: `${fmt(m.smartUnitsY3 + m.passiveUnits)}`, sub: "יחידות בשנה 3" },
            ].map(k => (
              <div key={k.label} className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                <p className="text-indigo-300 text-xs mb-1">{k.label}</p>
                <p className="text-2xl font-black">{k.value}</p>
                <p className="text-indigo-300 text-xs">{k.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10 space-y-12">

        {/* ══════════════════ BEFORE / AFTER ══════════════════ */}
        <section>
          <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
            <span className="bg-indigo-100 text-indigo-700 rounded-lg px-3 py-1 text-sm">01</span>
            לפני ואחרי — תמונת רווחיות
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {/* BEFORE */}
            <div className="bg-slate-100 rounded-2xl p-6 border border-slate-200">
              <p className="font-bold text-slate-500 text-sm mb-4">⬛ מצב נוכחי — {fmt(inputs.totalUnits)} יחידות פאסיביות</p>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-slate-200">
                  <span className="text-slate-600">הכנסה חודשית</span>
                  <span className="font-bold">{ils(m.beforeRevMonth)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-200">
                  <span className="text-slate-600">עלויות תפעול ({inputs.operatingCostPct}%)</span>
                  <span className="font-bold text-red-600">({ils(m.beforeCostMonth)})</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="font-bold text-slate-700">רווח נטו חודשי</span>
                  <span className="font-black text-slate-900 text-lg">{ils(m.beforeNetMonth)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">שנתי</span>
                  <span className="font-bold text-slate-700">{ils(m.beforeNetMonth * 12)}</span>
                </div>
              </div>
            </div>

            {/* AFTER */}
            <div className="bg-indigo-50 rounded-2xl p-6 border-2 border-indigo-300">
              <p className="font-bold text-indigo-700 text-sm mb-4">✅ אחרי — {fmt(m.passiveUnits)} פאסיב + {fmt(inputs.transferUnits)} Smart</p>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-indigo-200">
                  <span className="text-slate-600">דמי ניהול ({fmt(m.passiveUnits + inputs.transferUnits)} יח')</span>
                  <span className="font-bold">{ils(m.passiveRevMonth + m.smartMgmtRev)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-indigo-200">
                  <span className="text-slate-600">הכנסת EV ({m.numComplexes} קומפלקסים)</span>
                  <span className="font-bold text-green-700">+{ils(m.evRevMonth)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-indigo-200">
                  <span className="text-slate-600">פרמיית ועד בית</span>
                  <span className="font-bold text-green-700">+{ils(m.hoaRevMonth)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-indigo-200">
                  <span className="text-slate-600">חיסכון AI ({inputs.aiSavingsPct}% עלויות)</span>
                  <span className="font-bold text-green-700">+{ils(m.aiSavings)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="font-bold text-slate-700">רווח נטו חודשי</span>
                  <span className="font-black text-indigo-700 text-lg">{ils(m.afterNetMonth)}</span>
                </div>
              </div>
              <div className="mt-4 bg-green-600 text-white rounded-xl px-4 py-3 text-center">
                <p className="text-xs mb-1">שיפור רווחיות מיידי</p>
                <p className="text-2xl font-black">+{ils(m.upliftMonth)}/חודש</p>
                <p className="text-sm">+{m.upliftPct.toFixed(1)}% · {ils(m.upliftMonth * 12)}/שנה</p>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════ REVENUE SOURCES ══════════════════ */}
        <section>
          <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
            <span className="bg-indigo-100 text-indigo-700 rounded-lg px-3 py-1 text-sm">02</span>
            מקורות הכנסה חדשים — הפירוק
          </h2>
          <div className="bg-white rounded-2xl p-6 border border-slate-200">
            <BarChart bars={[
              { label: `דמי ניהול — ${fmt(inputs.transferUnits)} יחידות`, value: m.smartMgmtRev, color: "bg-indigo-400", max: m.afterRevMonth },
              { label: `EV Charging — ${m.numComplexes} קומפלקסים × ${inputs.evStationsPerComplex} עמדות`, value: m.evRevMonth, color: "bg-green-500", max: m.afterRevMonth },
              { label: `פרמיית ועד בית חכם (₪${inputs.hoaPremium}/יחידה)`, value: m.hoaRevMonth, color: "bg-blue-500", max: m.afterRevMonth },
              { label: `חיסכון AI בתפעול (${inputs.aiSavingsPct}%)`, value: m.aiSavings, color: "bg-orange-500", max: m.afterRevMonth },
            ]} />
            <div className="mt-6 grid grid-cols-3 gap-3 pt-4 border-t">
              <Stat label="הכנסה נוספת חודשית" value={ils(m.evRevMonth + m.hoaRevMonth)} sub="EV + ועד בית" />
              <Stat label="חיסכון תפעולי שנתי" value={ils(m.aiSavings * 12)} sub="AI Automation" />
              <Stat label="שיפור שנתי כולל" value={ils(m.upliftMonth * 12)} sub="vs. מצב נוכחי" accent />
            </div>
          </div>
        </section>

        {/* ══════════════════ 3-YEAR GROWTH ══════════════════ */}
        <section>
          <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
            <span className="bg-indigo-100 text-indigo-700 rounded-lg px-3 py-1 text-sm">03</span>
            מסלול הצמיחה — 3 שנים
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            <YearCard
              year="שנה 1 — כניסה"
              smartUnits={inputs.transferUnits}
              passiveUnits={m.passiveUnits}
              netMonthly={m.afterNetMonth}
            />
            <YearCard
              year="שנה 2 — השתרשות"
              smartUnits={y2SmartUnits}
              passiveUnits={m.passiveUnits}
              netMonthly={y2Net}
              highlight
            />
            <YearCard
              year="שנה 3 — סקייל"
              smartUnits={m.smartUnitsY3}
              passiveUnits={m.passiveUnits}
              netMonthly={m.y3Net}
            />
          </div>

          {/* Growth highlight */}
          <div className="mt-4 bg-gradient-to-l from-indigo-700 to-indigo-900 text-white rounded-2xl p-6">
            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-indigo-300 text-xs mb-1">רווח נטו שנה 1</p>
                <p className="text-2xl font-black">{ils(m.afterNetMonth)}/חודש</p>
              </div>
              <div className="border-x border-white/20">
                <p className="text-indigo-300 text-xs mb-1">רווח נטו שנה 2</p>
                <p className="text-2xl font-black">{ils(y2Net)}/חודש</p>
                <p className="text-indigo-300 text-xs">+{(((y2Net / m.afterNetMonth) - 1) * 100).toFixed(0)}% vs. שנה 1</p>
              </div>
              <div>
                <p className="text-indigo-300 text-xs mb-1">רווח נטו שנה 3</p>
                <p className="text-2xl font-black">{ils(m.y3Net)}/חודש</p>
                <p className="text-indigo-300 text-xs">+{m.y3NetUpliftPct.toFixed(0)}% vs. היום</p>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════ SIMULATOR ══════════════════ */}
        <section>
          <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
            <span className="bg-indigo-100 text-indigo-700 rounded-lg px-3 py-1 text-sm">04</span>
            סימולטור אינטראקטיבי — שנה את הפרמטרים
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Sliders */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 space-y-5">
              <p className="font-bold text-slate-700 text-sm border-b pb-3">משתנים עסקיים</p>
              <Slider label="סך יחידות כיום" value={inputs.totalUnits} min={5000} max={30000} step={500} unit=" יח'" onChange={set("totalUnits")} />
              <Slider label="יחידות מועברות ל-Smart" value={inputs.transferUnits} min={1000} max={Math.round(inputs.totalUnits * 0.6)} step={500} unit=" יח'" onChange={set("transferUnits")} />
              <Slider label="דמי ניהול ליחידה לחודש" value={inputs.mgmtFee} min={100} max={500} step={10} unit="₪" onChange={set("mgmtFee")} />
              <Slider label="פרמיית ועד בית חכם" value={inputs.hoaPremium} min={20} max={200} step={10} unit="₪" onChange={set("hoaPremium")} />
              <Slider label="עמדות EV לקומפלקס" value={inputs.evStationsPerComplex} min={2} max={20} step={1} unit=" עמדות" onChange={set("evStationsPerComplex")} />
              <Slider label="חיסכון AI בעלויות תפעול" value={inputs.aiSavingsPct} min={10} max={40} step={1} unit="%" onChange={set("aiSavingsPct")} />
            </div>

            {/* Live Results */}
            <div className="space-y-4">
              <div className="bg-indigo-600 text-white rounded-2xl p-6">
                <p className="text-indigo-200 text-sm mb-2">שיפור רווחיות שנתי מיידי</p>
                <p className="text-4xl font-black">{ils(m.upliftMonth * 12)}</p>
                <p className="text-indigo-200 text-sm mt-1">+{m.upliftPct.toFixed(1)}% שיפור בתשואה על {fmt(inputs.transferUnits)} יחידות</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="הכנסת EV שנתית" value={ils(m.evRevMonth * 12)} sub={`${m.numComplexes} קומפלקסים`} />
                <Stat label="חיסכון AI שנתי" value={ils(m.aiSavings * 12)} sub="צוות + תחזוקה" />
                <Stat label="רווח נטו/חודש — אחרי" value={ils(m.afterNetMonth)} sub={`vs. ${ils(m.beforeNetMonth)} היום`} />
                <Stat label="ערך נוסף שנה 3" value={ils(m.y3Net * 12)} sub="מסלול הצמיחה" accent />
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════ VALUE PROPS ══════════════════ */}
        <section>
          <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
            <span className="bg-indigo-100 text-indigo-700 rounded-lg px-3 py-1 text-sm">05</span>
            מה אתה מקבל — לא מה שאתה מוותר
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                icon: "⚡",
                title: "הכנסת EV Charging",
                body: `${m.numComplexes} קומפלקסים × ${inputs.evStationsPerComplex} עמדות = ${ils(m.evRevMonth * 12)}/שנה נטו. מרווח 15–25% על מחיר IEC, אפס CapEx.`,
                color: "border-green-200 bg-green-50",
              },
              {
                icon: "🤖",
                title: "AI Agents + אוטומציה",
                body: `חיסכון ${inputs.aiSavingsPct}% בעלויות תפעול = ${ils(m.aiSavings * 12)}/שנה. פחות כוח אדם, יותר SLA, תחזוקה מונעת שמקטינה תקלות 35%.`,
                color: "border-blue-200 bg-blue-50",
              },
              {
                icon: "🏗️",
                title: "שותף יזם אסטרטגי",
                body: `כניסת משקיע שמביא פרויקטים חדשים. 4,000 יחידות → 12,000 יחידות תוך 3 שנים, עם מודל כלכלי משופר.`,
                color: "border-purple-200 bg-purple-50",
              },
              {
                icon: "🏘️",
                title: "ועד בית דיגיטלי",
                body: `הצבעות דיגיטליות, תקציבים שקופים, ארכיון 7 שנים. פרמיה ₪${inputs.hoaPremium}/יחידה/חודש = ${ils(m.hoaRevMonth)}/חודש.`,
                color: "border-indigo-200 bg-indigo-50",
              },
              {
                icon: "📊",
                title: "לא כל הביצים בסל אחד",
                body: `${fmt(m.passiveUnits)} יחידות נשארות בניהולך כרגיל. פיזור סיכונים + שני מנועי צמיחה במקביל.`,
                color: "border-orange-200 bg-orange-50",
              },
              {
                icon: "📱",
                title: "WhatsApp + אפליקציית דייר",
                body: `NPS ממוצע עולה מ-15 ל-55+. שביעות רצון גבוהה = עמידות גבוהה יותר לדיירים. 85% פחות עזיבה.`,
                color: "border-teal-200 bg-teal-50",
              },
            ].map(v => (
              <div key={v.title} className={`rounded-2xl p-5 border-2 ${v.color}`}>
                <p className="text-2xl mb-2">{v.icon}</p>
                <p className="font-bold text-slate-800 mb-2">{v.title}</p>
                <p className="text-sm text-slate-600 leading-relaxed">{v.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════ SUMMARY TABLE ══════════════════ */}
        <section>
          <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
            <span className="bg-indigo-100 text-indigo-700 rounded-lg px-3 py-1 text-sm">06</span>
            סיכום מספרי — 3 שנים
          </h2>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-right p-4 font-bold text-slate-600">מדד</th>
                  <th className="text-center p-4 font-bold text-slate-600">היום</th>
                  <th className="text-center p-4 font-bold text-indigo-700">שנה 1</th>
                  <th className="text-center p-4 font-bold text-indigo-700">שנה 2</th>
                  <th className="text-center p-4 font-bold text-indigo-700">שנה 3</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    label: "יחידות בניהול",
                    v0: fmt(inputs.totalUnits),
                    v1: fmt(inputs.totalUnits),
                    v2: fmt(m.passiveUnits + y2SmartUnits),
                    v3: fmt(m.passiveUnits + m.smartUnitsY3),
                  },
                  {
                    label: "יחידות Smart Building OS",
                    v0: "0",
                    v1: fmt(inputs.transferUnits),
                    v2: fmt(y2SmartUnits),
                    v3: fmt(m.smartUnitsY3),
                  },
                  {
                    label: "הכנסה חודשית",
                    v0: ils(m.beforeRevMonth),
                    v1: ils(m.afterRevMonth),
                    v2: ils(y2Rev),
                    v3: ils(m.y3Rev),
                  },
                  {
                    label: "רווח נטו חודשי",
                    v0: ils(m.beforeNetMonth),
                    v1: ils(m.afterNetMonth),
                    v2: ils(y2Net),
                    v3: ils(m.y3Net),
                    highlight: true,
                  },
                  {
                    label: "שיפור vs. היום",
                    v0: "—",
                    v1: `+${m.upliftPct.toFixed(1)}%`,
                    v2: `+${(((y2Net / m.beforeNetMonth) - 1) * 100).toFixed(0)}%`,
                    v3: `+${m.y3NetUpliftPct.toFixed(0)}%`,
                    highlight: true,
                  },
                ].map((row, i) => (
                  <tr key={row.label} className={`border-b border-slate-100 ${i % 2 === 0 ? "" : "bg-slate-50/50"}`}>
                    <td className="p-4 font-medium text-slate-700">{row.label}</td>
                    <td className="p-4 text-center text-slate-500">{row.v0}</td>
                    <td className={`p-4 text-center font-bold ${row.highlight ? "text-indigo-700" : "text-slate-800"}`}>{row.v1}</td>
                    <td className={`p-4 text-center font-bold ${row.highlight ? "text-indigo-700" : "text-slate-800"}`}>{row.v2}</td>
                    <td className={`p-4 text-center font-bold ${row.highlight ? "text-indigo-700" : "text-slate-800"}`}>{row.v3}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ══════════════════ FOOTER CTA ══════════════════ */}
        <div className="bg-gradient-to-l from-indigo-700 to-indigo-900 text-white rounded-2xl p-8 text-center">
          <p className="text-indigo-300 text-sm mb-2">Smart Building OS · {today}</p>
          <p className="text-3xl font-black mb-2">הצעד הבא</p>
          <p className="text-indigo-200 text-lg mb-6">
            מודל ניסיון — {fmt(inputs.transferUnits / 4)} יחידות בקומפלקס אחד · 60 יום POC · אפס עלות
          </p>
          <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto text-sm">
            <div className="bg-white/10 rounded-xl p-3">
              <p className="font-black text-lg">{ils(m.upliftMonth * 12)}</p>
              <p className="text-indigo-300 text-xs">שיפור שנתי מיידי</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3">
              <p className="font-black text-lg">3 שנים</p>
              <p className="text-indigo-300 text-xs">להכפיל את הפעילות</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3">
              <p className="font-black text-lg">+{m.y3NetUpliftPct.toFixed(0)}%</p>
              <p className="text-indigo-300 text-xs">שיפור רווחיות Y3</p>
            </div>
          </div>
        </div>

        <p className="text-center text-slate-400 text-xs pb-8">
          Smart Building OS · סימולטור שותפות אסטרטגית · כל הנתונים מבוססים על פרמטרים מוזנים ומדדי שוק
        </p>
      </div>
    </div>
  )
}
