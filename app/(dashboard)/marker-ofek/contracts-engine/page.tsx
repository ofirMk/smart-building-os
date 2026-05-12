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

import { WaterfallCanvas } from "@/components/marker-ofek/contracts-engine/waterfall-canvas"
import { loadContractsEngineSnapshot } from "@/lib/marker-ofek/contracts/w2-engine-server"
import type { PricingMethod } from "@/lib/marker-ofek/contracts/w2-engine-types"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "מנוע חוזים MedaTech · Marker Ofek",
  description:
    "Sprint W2 — מימוש מלא של פרק 3 באיפיון מידעטק: חוזי מזמין/קבלן, מפל חישוב חשבונות חלקיים, קיזוז חומר גלם, ופרמטרי מערכת דינמיים.",
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
  { id: "BOQ", description: "מדידה לפי סעיפים · § 3.1" },
  { id: "LUMP_SUM", description: "אבני דרך לתשלום · § 3.1" },
  { id: "COST_PLUS", description: "עלות + מקדם רווח · § 3.1" },
]

const ARCH_DECISIONS = [
  {
    icon: <GitBranch className="size-4" />,
    title: "טבלאות נפרדות למזמין / קבלן",
    body: "RLS נקי ומחזורי-חיים שונים. שיתוף טיפוסים ב-TypeScript בלבד.",
    ref: "Q1",
  },
  {
    icon: <BadgeCheck className="size-4" />,
    title: "אישור הוראת שינוי = system parameter",
    body: "CONTRACT_CHANGE_ORDER_REQUIRES_APPROVAL — דיפולט false (פאריטי ל\"טמן).",
    ref: "Q2",
  },
  {
    icon: <Workflow className="size-4" />,
    title: "Trigger stage לקיזוז חו\"ג — דינמי",
    body: "PO / GRN / Invoice. דיפולט VENDOR_INVOICE, ניתן להעבירל-PO/GRN פר חברה.",
    ref: "Q3",
  },
  {
    icon: <Layers className="size-4" />,
    title: "מצב AGGREGATE חוסם detailed approved",
    body: "כשהוגש מרוכז — האישור גם מרוכז. נאכף ברמת RPC ב-Phase 2.",
    ref: "Q4",
  },
  {
    icon: <CircleDollarSign className="size-4" />,
    title: "Multi-currency דחוי ל-MVP+1",
    body: "ILS בלבד כעת. הצמדה נשמרת ב-JSONB לתמיכה עתידית בסל מטבעות.",
    ref: "Q5",
  },
]

export default async function ContractsEnginePage() {
  const snapshot = await loadContractsEngineSnapshot()
  const waterfall =
    snapshot.liveWaterfall ?? snapshot.illustrativeWaterfall
  const variant: "live" | "illustrative" = snapshot.liveWaterfall
    ? "live"
    : "illustrative"

  return (
    <div className="bg-background text-foreground" dir="rtl">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* ========================= Header ========================= */}
        <div className="flex flex-col gap-2 border-b border-border pb-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <Sparkles className="size-4 text-emerald-500" />
            Sprint W2 · MedaTech Contracts Engine · Phase 1
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            מנוע החוזים והחשבונות החלקיים
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            המסך הזה מציג בזמן אמת את המנוע שמיישם את פרק 3 באיפיון מידעטק (ל&quot;טמן 2016) —
            חוזי מזמין וקבלן, מפל חישוב חשבונות חלקיים, קיזוז חומר גלם, ופרמטרי מערכת
            דינמיים. מטרה: <strong>Tier-1 parity ל-Priority/SAP — בלי SI של 6 חודשים.</strong>
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-muted-foreground">
            <Link
              href="/marker-ofek/pitch"
              className="rounded-full border border-border bg-card px-3 py-1 transition hover:border-emerald-300"
            >
              ← חזרה לחמ&quot;ל
            </Link>
            <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              Phase 1 · Foundations
            </span>
            <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              Phase 2 · Change-orders + Approval RPCs (Sprint Next)
            </span>
          </div>
        </div>

        {/* ====================== Sample contract ===================== */}
        <section className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <FileSignature className="size-4" />
              חוזה לדוגמה (RLS-resolved)
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
                שיטות תמחור נתמכות (§3.1)
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
              דינמיים פר חברה — לא בקוד
            </h2>
            <p className="mt-2 text-xs text-muted-foreground">
              קוראים מ-<code className="font-mono">erp_system_parameters</code>. אדמין יכול
              לעדכן ערך — והמנוע מסתגל מיד בלי deploy.
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
            מחושב ע&quot;י <code className="font-mono">erp_compute_subcontractor_bill_waterfall(p_bill_id)</code>{" "}
            — idempotent, SECURITY DEFINER, מתעדכן בכל שמירה. סדר המפל מבוסס פרק
            §3.2.2 (חישוב התייקרות מצטברת) ו-§3.3 (קיזוז חומר גלם).
          </p>
        </section>

        {/* ============== Architectural decisions ledger ============== */}
        <section className="mt-8 rounded-3xl border border-border bg-gradient-to-br from-emerald-50/40 via-card to-card p-6 shadow-sm dark:from-emerald-950/20">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <Sparkles className="size-4 text-emerald-500" />5 החלטות
            ארכיטקטוניות (God Mode)
          </div>
          <h2 className="mt-2 text-lg font-semibold">
            5 השאלות הפתוחות מהאיפיון — נסגרו אוטונומית לפי Best Practices של ERP
            ברמת Tier-1
          </h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ARCH_DECISIONS.map((d) => (
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
            Sprint Next · Phase 2
          </div>
          <h2 className="mt-2 text-lg font-semibold">הצעדים הבאים</h2>
          <ul className="mt-3 list-disc space-y-1.5 pe-5 text-sm text-muted-foreground marker:text-emerald-500">
            <li>
              RPC <code className="font-mono">erp_create_change_order</code> — הוראות שינוי
              (שורה חדשה / שינוי כמות / שינוי מחיר) עם immutability מובטח.
            </li>
            <li>
              RPC <code className="font-mono">erp_update_bill_by_approved</code> — מצב dual
              ledger (submitted/approved) למזמין.
            </li>
            <li>
              טריגר אוטו-אכלוס של <code className="font-mono">erp_contract_raw_material_offsets</code>{" "}
              כאשר RAW_MATERIAL_OFFSET_TRIGGER_STAGE = VENDOR_INVOICE.
            </li>
            <li>
              UI לעריכת חוזה + מסך חשבון חלקי dual-pane (submitted ↔ approved).
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
