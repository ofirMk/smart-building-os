/**
 * Sprint W2 — Contracts Engine PM Workspace (Phase 1 demo screen).
 *
 * Showcases the MedaTech §3 calculation engine: pricing methods, raw-material
 * offset, retention/insurance/advance recovery waterfall, submitted/approved
 * dual ledger, and the 3 W2 system parameters resolved per the user's
 * company. Server Component — reads via `loadContractsEngineSnapshot()`.
 *
 * Reachable from the CEO Command Center lobby as an ADDITIVE tile alongside
 * the existing demos (does not modify any of them).
 */

import type { Metadata } from "next"
import Link from "next/link"
import {
  BadgeCheck,
  CircleDollarSign,
  FileSignature,
  GitBranch,
  Layers,
  Settings2,
  Sparkles,
  Workflow,
} from "lucide-react"

import { ChangeOrderTimeline } from "@/components/marker-ofek/contracts-engine/change-order-timeline"
import { ClientBillWaterfallCard } from "@/components/marker-ofek/contracts-engine/client-bill-waterfall-card"
import { DualPaneBillEditor } from "@/components/marker-ofek/contracts-engine/dual-pane-bill-editor"
import { WaterfallCanvas } from "@/components/marker-ofek/contracts-engine/waterfall-canvas"
import {
  loadBillLinesForApproval,
  loadChangeOrderTimeline,
  loadContractsEngineSnapshot,
} from "@/lib/marker-ofek/contracts/w2-engine-server"
import type {
  BillEntryMode,
  PricingMethod,
} from "@/lib/marker-ofek/contracts/w2-engine-types"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "מנוע חוזים וחשבונות קבלן (Smart Billing)",
  description:
    "ניהול מחזור החיים הפיננסי קצה-לקצה: חוזי מזמין וקבלני משנה, אוטומציית מפל תשלומים וקיזוזים, עכבונות, ושליטה בזמן אמת.",
}

function formatCurrency(value: number): string {
  return `₪${Math.round(value).toLocaleString("he-IL")}`
}

function pricingMethodLabel(method: PricingMethod): string {
  switch (method) {
    case "BOQ":
      return "כתב כמויות"
    case "LUMP_SUM":
      return "פאושלי"
    case "COST_PLUS":
      return "COST+"
  }
}

const PRICING_METHODS: Array<{ id: PricingMethod; description: string }> = [
  { id: "BOQ", description: "מדידה לפי סעיפים" },
  { id: "LUMP_SUM", description: "תשלום לפי אבני דרך" },
  { id: "COST_PLUS", description: "עלות + מקדם רווח" },
]

const PLATFORM_DIFFERENTIATORS = [
  {
    icon: <GitBranch className="size-4" />,
    title: "הפרדה מלאה בין צד מזמין לצד קבלן",
    body: "שני ספרי חשבונות עצמאיים — הרשאות גישה מופרדות לכל צד, עם מדיניות פיננסית עצמאית.",
    ref: "01",
  },
  {
    icon: <BadgeCheck className="size-4" />,
    title: "תהליך אישור הוראות שינוי מוגדר לפי חברה",
    body: "כל ארגון בוחר: אישור מיידי של הוראות שינוי (מסלול מהיר) או חיוב אישור פורמלי (בקרה הדוקה).",
    ref: "02",
  },
  {
    icon: <Workflow className="size-4" />,
    title: "קיזוז חומרי גלם אוטומטי — בכל שלב בשרשרת הרכש",
    body: "המערכת מזהה חומרי גלם הנרכשים עבור הקבלן ומקזזת אוטומטית מהחשבון הבא — בכל שלב לפי הגדרת החברה.",
    ref: "03",
  },
  {
    icon: <Layers className="size-4" />,
    title: "שני אופני הגשת חשבון: שורה-בשורה או סכום כולל",
    body: "הקבלן בוחר שיטת הגשה — מפורט או מרוכז — והמערכת אוכפת עקביות מתאימה וחוסמת ערבוב בין השיטות.",
    ref: "04",
  },
  {
    icon: <CircleDollarSign className="size-4" />,
    title: "מוכן לרב-מטבעיות (Multi-Currency Ready)",
    body: "שקל חדש כמטבע ראשי בארץ, עם ארכיטקטורה שתומך בסל מטבעות להרחבה גלובלית עתידית.",
    ref: "05",
  },
]

export default async function ContractsEnginePage() {
  const snapshot = await loadContractsEngineSnapshot()
  const waterfall =
    snapshot.liveWaterfall ?? snapshot.illustrativeWaterfall
  const variant: "live" | "illustrative" = snapshot.liveWaterfall
    ? "live"
    : "illustrative"

  /** Phase 2 — additional loaders for change-order timeline + dual-pane editor. */
  const sampleContractId = snapshot.sampleContract?.contractId ?? null
  const liveBillId = snapshot.liveWaterfall?.bill_id ?? null
  const [amendments, billLines] = await Promise.all([
    sampleContractId ? loadChangeOrderTimeline(sampleContractId) : Promise.resolve([]),
    liveBillId ? loadBillLinesForApproval(liveBillId) : Promise.resolve([]),
  ])
  const billEntryMode: BillEntryMode = "DETAILED"

  /**
   * Sprint T3 — best-effort load of the latest client (owner) progress bill,
   * so the Owner-side waterfall card can be rendered alongside the
   * subcontractor canvas. Any DB outage falls back to null without breaking
   * the rest of the page.
   */
  const liveClientBillId: string | null = await (async () => {
    try {
      const supabase = await createSupabaseServerAuthClient()
      const { data } = await supabase
        .from("erp_client_progress_bills")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      return (data as { id: string } | null)?.id ?? null
    } catch {
      return null
    }
  })()

  return (
    <div className="bg-background text-foreground" dir="rtl">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* ========================= Header ========================= */}
        <div className="flex flex-col gap-2 border-b border-border pb-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <Sparkles className="size-4 text-emerald-500" />
            Smart Billing · מנוע חוזים וחשבונות
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            מנוע החוזים והחשבונות החלקיים
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            ניהול מחזור החיים הפיננסי של חוזי הפרויקט — מחתימת החוזה ועד התשלום האחרון.
            אוטומציה מוחלטת של מפל תשלומים וקיזוזים — עכבונות, ביטוח, הצמדה, החזר מקדמה, קיזוז חומרי גלם —
            כולם במנוע אחד <strong>בלי תלות בשיטת תמחור או בכלי עזר חיצוניים.</strong>
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-muted-foreground">
            <Link
              href="/marker-ofek/pitch"
              className="rounded-full border border-border bg-card px-3 py-1 transition hover:border-emerald-300"
            >
              ← חזרה למרכז הפיקוד
            </Link>
            <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              אוטומציית קיזוזים
            </span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              מערכת מפל כספים
            </span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              הגנה מתקציב חורג
            </span>
          </div>
        </div>

        {/* ====================== Sample contract ===================== */}
        <section className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <FileSignature className="size-4" />
              חוזה פעיל
            </div>
            <div className="mt-3 flex flex-wrap items-baseline gap-3">
              <h2 className="text-xl font-semibold">
                {snapshot.sampleContract?.contractNumber ?? "CO-DEMO-001"}
              </h2>
              <span className="text-sm text-muted-foreground">
                {snapshot.sampleContract?.subcontractorName ??
                  "קבלן משנה — לדוגמה"}
              </span>
              <span className="text-sm text-muted-foreground">
                · פרויקט:{" "}
                {snapshot.sampleContract?.projectName ?? "הרצליה — שכונה צפונית"}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard
                label="היקף החוזה"
                value={formatCurrency(
                  snapshot.sampleContract?.totalAmount ?? 1_400_000,
                )}
              />
              <KpiCard
                label="עכבון"
                value={`${(snapshot.sampleContract?.retentionPct ?? 5).toFixed(1)}%`}
              />
              <KpiCard
                label="ביטוח"
                value={`${(snapshot.sampleContract?.insurancePct ?? 1).toFixed(1)}%`}
              />
              <KpiCard
                label='עמלת רכש חו"ג'
                value={`${(snapshot.sampleContract?.rawMaterialCommissionPct ?? 0).toFixed(1)}%`}
              />
            </div>

            <div className="mt-5">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                שיטות תמחור נתמכות
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {PRICING_METHODS.map((m) => {
                  const active =
                    (snapshot.sampleContract?.pricingMethod ?? "BOQ") === m.id
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "rounded-2xl border px-3 py-2 text-sm transition",
                        active
                          ? "border-emerald-400 bg-emerald-50/70 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                          : "border-border bg-card text-muted-foreground",
                      )}
                    >
                      <div className="font-semibold">
                        {pricingMethodLabel(m.id)}
                      </div>
                      <div className="text-[11px]">{m.description}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ================ System parameters ================ */}
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Settings2 className="size-4" />
              פרמטרי מערכת פעילים
            </div>
            <h2 className="mt-3 text-lg font-semibold">
              מדיניות פיננסית לפי חברה — ניתנת לעדכון בזמן אמת
            </h2>
            <p className="mt-2 text-xs text-muted-foreground">
              כללי החישוב והאישור משתנים בין ארגונים. כל הגדרה ניתנת לעדכון על ידי
              מנהל מערכת — והמנוע מיישם מיידית, ללא הפסקת פעילות.
            </p>
            <dl className="mt-5 space-y-4">
              <ParamRow
                label="אישור הוראת שינוי"
                paramKey="CONTRACT_CHANGE_ORDER_REQUIRES_APPROVAL"
                value={
                  snapshot.systemParameters.changeOrderRequiresApproval
                    ? "דורש"
                    : "אינו דורש"
                }
                accent={
                  snapshot.systemParameters.changeOrderRequiresApproval
                    ? "amber"
                    : "emerald"
                }
              />
              <ParamRow
                label='שלב טריגר לקיזוז חו"ג'
                paramKey="RAW_MATERIAL_OFFSET_TRIGGER_STAGE"
                value={snapshot.systemParameters.rawMaterialOffsetTriggerStage}
                accent="sky"
              />
              <ParamRow
                label="בסיס חשבונית למזמין"
                paramKey="CONTRACT_INVOICE_OWNER_BASE_MODE"
                value={snapshot.systemParameters.ownerInvoiceBaseMode}
                accent="violet"
              />
            </dl>
          </div>
        </section>

        {/* ====================== Waterfall canvas ===================== */}
        <section className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-sm">
          <WaterfallCanvas summary={waterfall} variant={variant} />
          <p className="mt-4 text-xs text-muted-foreground">
            חישוב אוטומטי ועקבי בכל שמירה — בטוח למניעת כפל חישוב ומושתת מהקונסיסטנטיות הנהלית.
            סדר המפל כולל הצמדה, עכבונות, ביטוח, החזר מקדמה, וקיזוז חומרי גלם.
          </p>
        </section>

        {/* ============ Phase 2: Change-Order Timeline + Form ============ */}
        {sampleContractId ? (
          <section className="mt-8">
            <ChangeOrderTimeline contractId={sampleContractId} amendments={amendments} />
          </section>
        ) : null}

        {/* ================ Phase 2: Dual-Pane Bill Editor ================ */}
        {liveBillId && billLines.length > 0 ? (
          <section className="mt-8">
            <DualPaneBillEditor
              billId={liveBillId}
              entryMode={billEntryMode}
              lines={billLines}
            />
          </section>
        ) : null}

        {/* ============ Sprint T3: Owner-side Waterfall Card ============= */}
        {liveClientBillId ? (
          <section className="mt-8">
            <ClientBillWaterfallCard billId={liveClientBillId} />
          </section>
        ) : null}

        {/* ============== Architectural decisions ledger ============== */}
        <section className="mt-8 rounded-3xl border border-gradient-to-br from-emerald-50/40 via-card to-card p-6 shadow-sm dark:from-emerald-950/20">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <Sparkles className="size-4 text-emerald-500" />
            הבידולים של המערכת
          </div>
          <h2 className="mt-2 text-lg font-semibold">
            חמישה יתרונות בלתי מתפשרים שממקמים את המערכת כתשתית עסקית עוצמתית —
            לא עוד פתרון שדורש שנות הטמעה.
          </h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {PLATFORM_DIFFERENTIATORS.map((d) => (
              <div
                key={d.ref}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    {d.icon}
                    <span className="text-sm font-semibold">{d.title}</span>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    {d.ref}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {d.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ====================== Footer / next ===================== */}
        <section className="mt-8 rounded-3xl border border-dashed border-border bg-card/40 p-6">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            מה מוכן במערכת
          </div>
          <h2 className="mt-2 text-lg font-semibold">יכולות זמינות במנוע החוזים</h2>
          <ul className="mt-3 list-disc space-y-1.5 pe-5 text-sm text-muted-foreground marker:text-emerald-500">
            <li>
              <strong className="text-emerald-700">ניהול חוזי קבלני משנה</strong> — מחתימת
              ההסכם ועד התשלום הסופי, כולל מפל חשבונות חלקיים, קיזוז חומרי גלם, עכבונות והצמדה.
            </li>
            <li>
              <strong className="text-emerald-700">הוראות שינוי עם מסלול אישור חכם</strong> —
              כל שינוי עובר תהליך אישור המוגדר לפי מדיניות הארגון, עם הגנה אוטומטית על ההסכם המקורי.
            </li>
            <li>
              <strong className="text-emerald-700">חשבון מוגש מול חשבון מאושר</strong> —
              שני טורים נפרדים המציגים את טענת הקבלן מול האישור הפנימי, למעקב תקציבי מדויק.
            </li>
            <li>
              <strong className="text-amber-700">הרחבה מתוכננת: חיובי לקוחות מסונכרנים</strong> —
              התאמה מלאה בין חיובי מזמינים לתשלומי קבלנים, לשקיפות מלאה של מחזור החיים הפיננסי.
            </li>
          </ul>
        </section>
      </div>
    </div>
  )
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background/60 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function ParamRow({
  label,
  paramKey,
  value,
  accent,
}: {
  label: string
  paramKey: string
  value: string
  accent: "emerald" | "amber" | "sky" | "violet"
}) {
  const accentClass =
    accent === "emerald"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
      : accent === "amber"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
        : accent === "sky"
          ? "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
          : "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
  return (
    <div className="rounded-2xl border border-border bg-background/60 p-3">
      <dt className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
            accentClass,
          )}
        >
          {value}
        </span>
      </dt>
      <dd className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        <code className="font-mono">{paramKey}</code>
      </dd>
    </div>
  )
}
