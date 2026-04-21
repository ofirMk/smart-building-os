"use client"

import Link from "next/link"
import * as React from "react"
import {
  ArrowRight,
  Banknote,
  FileSpreadsheet,
  Landmark,
  LayoutDashboard,
  PieChart,
  TrendingUp,
} from "lucide-react"

import type { MasterPortfolioProjectRow } from "@/lib/marker-ofek/billing-master-hub-data"

import { buttonVariants } from "@/components/ui/button-variants"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

export type BillingHubContractRow = {
  id: string
  total_amount: number | null
  status: string
  projectName: string
  internalCode: string
  entityName: string
}

export type BillingHubPartialRow = {
  id: string
  account_number: number
  status: string
  payment_due: number
  contract_id: string
  projectName: string
  internalCode: string
  created_at: string
}

export type BillingHubCashFlow = {
  invoicesApproved: number
  invoicesPaid: number
  invoicesIssuedOnly: number
  partialsSubmitted: number
  partialsApproved: number
  partialsPaid: number
  partialDraftPaymentExposure: number
}

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
})

const STATUS_HE: Record<string, string> = {
  draft: "טיוטה",
  active: "פעיל",
  submitted: "הוגש",
  approved: "מאושר",
  paid: "שולם",
  issued: "הופקה",
  cancelled: "בוטלה",
}

type TabId = "contracts" | "partials" | "cashflow" | "portfolio"

export function BillingHubClient({
  contracts,
  partials,
  cashFlow,
  portfolioProjects,
}: {
  contracts: BillingHubContractRow[]
  partials: BillingHubPartialRow[]
  cashFlow: BillingHubCashFlow
  portfolioProjects: MasterPortfolioProjectRow[]
}) {
  const [tab, setTab] = React.useState<TabId>("contracts")

  return (
    <div
      className="min-h-[calc(100vh-4rem)] bg-[#FFFFFF] px-4 py-8 md:px-8"
      dir="rtl"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <Link
          href="/marker-ofek/finance"
          className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 transition-colors hover:text-indigo-600"
        >
          <ArrowRight className="size-4 rotate-180" aria-hidden />
          חזרה לכספים
        </Link>

        <header className="pharmacy-hero-card p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-600">
                <LayoutDashboard className="size-6" aria-hidden />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600/90">
                  מרקר אופק
                </p>
                <h1 className="text-2xl font-bold tracking-tight text-indigo-950 sm:text-3xl">
                  מרכז חוזים וחיוב
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-slate-500">
                  ניהול חוזי לקוח, חשבונות חלקיים, תזרים פרויקטים פעילים וגבייה.
                </p>
              </div>
            </div>
          </div>
        </header>

        <div
          className="flex flex-wrap gap-2 border-b border-slate-100 pb-1"
          role="tablist"
          aria-label="תצוגות מרכז חיוב"
        >
          <TabButton
            active={tab === "contracts"}
            onClick={() => setTab("contracts")}
            icon={Landmark}
            label="ניהול חוזים"
          />
          <TabButton
            active={tab === "partials"}
            onClick={() => setTab("partials")}
            icon={FileSpreadsheet}
            label="חשבונות חלקיים"
          />
          <TabButton
            active={tab === "cashflow"}
            onClick={() => setTab("cashflow")}
            icon={TrendingUp}
            label="דוח גבייה ותזרים"
          />
          <TabButton
            active={tab === "portfolio"}
            onClick={() => setTab("portfolio")}
            icon={PieChart}
            label="תזרים פרויקטים"
          />
        </div>

        {tab === "contracts" ? (
          <section className="space-y-3" aria-label="חוזי לקוח פעילים">
            <h2 className="text-lg font-semibold text-[#1e293b]">
              חוזי לקוח (ראשי)
            </h2>
            {contracts.length === 0 ? (
              <p className="rounded-xl border border-slate-100 bg-background/50 px-4 py-10 text-center text-sm text-slate-500">
                אין חוזים ראשיים במערכת.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-100 hover:bg-background/50">
                      <TableHead className="text-slate-600">פרויקט</TableHead>
                      <TableHead className="text-slate-600">לקוח</TableHead>
                      <TableHead className="text-slate-600">סטטוס</TableHead>
                      <TableHead className="text-end font-currency-mono text-slate-600">
                        סה״כ חוזה
                      </TableHead>
                      <TableHead className="w-[1%]">פעולות</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contracts.map((c) => (
                      <TableRow
                        key={c.id}
                        className="border-slate-100 align-middle"
                      >
                        <TableCell className="font-medium text-[#1e293b]">
                          {c.projectName}
                          <span className="mt-0.5 block font-currency-mono text-xs text-slate-400">
                            {c.internalCode}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-700">
                          {c.entityName}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {STATUS_HE[c.status] ?? c.status}
                        </TableCell>
                        <TableCell className="text-end font-currency-mono text-sm tabular-nums text-[#1e293b]">
                          {c.total_amount != null
                            ? currencyFormatter.format(
                                Number(c.total_amount) || 0
                              )
                            : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Link
                            href={`/marker-ofek/finance/contracts/${c.id}`}
                            className={cn(
                              buttonVariants({
                                variant: "outline",
                                size: "sm",
                              }),
                              "border-indigo-200 text-indigo-800 hover:bg-indigo-50"
                            )}
                          >
                            מרכז חיוב
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        ) : null}

        {tab === "partials" ? (
          <section className="space-y-3" aria-label="חשבונות חלקיים">
            <h2 className="text-lg font-semibold text-[#1e293b]">
              חשבונות חלקיים — רשימה
            </h2>
            {partials.length === 0 ? (
              <p className="rounded-xl border border-slate-100 bg-background/50 px-4 py-10 text-center text-sm text-slate-500">
                אין חשבונות חלקיים. צרו חשבון ממרכז החיוב של חוזה.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-100 hover:bg-background/50">
                      <TableHead className="text-slate-600">מס׳</TableHead>
                      <TableHead className="text-slate-600">פרויקט</TableHead>
                      <TableHead className="text-slate-600">סטטוס</TableHead>
                      <TableHead className="text-end font-currency-mono text-slate-600">
                        לתשלום (תקופה)
                      </TableHead>
                      <TableHead className="w-[1%]">פעולות</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partials.map((p) => (
                      <TableRow
                        key={p.id}
                        className="border-slate-100 align-middle"
                      >
                        <TableCell className="font-currency-mono font-medium tabular-nums text-[#1e293b]">
                          {p.account_number}
                        </TableCell>
                        <TableCell className="text-slate-800">
                          {p.projectName}
                          <span className="mt-0.5 block font-currency-mono text-xs text-slate-400">
                            {p.internalCode}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {STATUS_HE[p.status] ?? p.status}
                        </TableCell>
                        <TableCell className="text-end font-currency-mono text-sm tabular-nums text-[#1e293b]">
                          {currencyFormatter.format(
                            Number(p.payment_due) || 0
                          )}
                        </TableCell>
                        <TableCell className="flex flex-wrap gap-2 whitespace-nowrap">
                          <Link
                            href={`/marker-ofek/finance/contracts/billing/${p.id}`}
                            className={cn(
                              buttonVariants({
                                variant: "default",
                                size: "sm",
                              }),
                              "border border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
                            )}
                          >
                            לוח חיוב
                          </Link>
                          <Link
                            href={`/marker-ofek/finance/contracts/${p.contract_id}`}
                            className={cn(
                              buttonVariants({
                                variant: "outline",
                                size: "sm",
                              }),
                              "border-slate-200"
                            )}
                          >
                            חוזה
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        ) : null}

        {tab === "portfolio" ? (
          <section className="space-y-4" aria-label="תזרים פרויקטים פעילים">
            <h2 className="text-lg font-semibold text-indigo-950">
              תזרים לפי פרויקט (חוזה ראשי פעיל)
            </h2>
            <p className="text-xs text-slate-500">
              תקציב = סכום חוזה ראשי; בפועל = רכש (PO); הכרה = מצטבר מאושר אחרון;
              גבויים = חשבוניות במצב שולם.
            </p>
            {portfolioProjects.length === 0 ? (
              <p className="rounded-xl border border-slate-100 bg-background/50 px-4 py-10 text-center text-sm text-slate-500">
                אין חוזים ראשיים במצב פעיל — או שאין הרשאת צפייה לפרויקטים.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-100 bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-100 hover:bg-background/50">
                      <TableHead className="min-w-[10rem] text-indigo-950">
                        פרויקט
                      </TableHead>
                      <TableHead className="text-end font-currency-mono text-indigo-950">
                        תקציב חוזה
                      </TableHead>
                      <TableHead className="text-end font-currency-mono text-indigo-950">
                        רכש בפועל
                      </TableHead>
                      <TableHead className="text-end font-currency-mono text-indigo-950">
                        הכרה מצטברת
                      </TableHead>
                      <TableHead className="text-end font-currency-mono text-indigo-950">
                        גבויים
                      </TableHead>
                      <TableHead className="min-w-[14rem] text-indigo-950">
                        בריאות תזרים
                      </TableHead>
                      <TableHead className="w-[1%] text-indigo-950">
                        פעולות
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portfolioProjects.map((p) => (
                      <TableRow
                        key={p.projectId}
                        className="border-slate-100 align-top"
                      >
                        <TableCell className="font-medium text-indigo-950">
                          {p.projectName}
                          <span className="mt-0.5 block font-currency-mono text-xs text-slate-400">
                            {p.internalCode}
                          </span>
                        </TableCell>
                        <TableCell className="text-end font-currency-mono text-sm tabular-nums text-indigo-950">
                          {currencyFormatter.format(p.contractValue)}
                        </TableCell>
                        <TableCell className="text-end font-currency-mono text-sm tabular-nums text-indigo-950">
                          {currencyFormatter.format(p.procurementActual)}
                        </TableCell>
                        <TableCell className="text-end font-currency-mono text-sm tabular-nums text-indigo-950">
                          {currencyFormatter.format(p.recognizedCumulative)}
                        </TableCell>
                        <TableCell className="text-end font-currency-mono text-sm tabular-nums text-emerald-800">
                          {currencyFormatter.format(p.collectedPaid)}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          <FinancialHealthStrip
                            budget={p.contractValue}
                            actual={p.procurementActual}
                            recognized={p.recognizedCumulative}
                            collected={p.collectedPaid}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Link
                            href={`/marker-ofek/finance/contracts/${p.mainContractId}`}
                            className={cn(
                              buttonVariants({
                                variant: "outline",
                                size: "sm",
                              }),
                              "border-indigo-200 text-indigo-900 hover:bg-indigo-50"
                            )}
                          >
                            מרכז חיוב
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        ) : null}

        {tab === "cashflow" ? (
          <section className="space-y-6" aria-label="תזרים גבייה">
            <h2 className="text-lg font-semibold text-[#1e293b]">
              דוח גבייה ותזרים (סיכום)
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <CashCard
                icon={Banknote}
                title="חשבוניות — מאושרות (לא שולם)"
                value={currencyFormatter.format(cashFlow.invoicesApproved)}
                hint="מוכר; ממתין לתשלום"
              />
              <CashCard
                icon={Banknote}
                title="חשבוניות — שולמו"
                value={currencyFormatter.format(cashFlow.invoicesPaid)}
              />
              <CashCard
                icon={Banknote}
                title="חשבוניות — הופקה בלבד"
                value={currencyFormatter.format(cashFlow.invoicesIssuedOnly)}
                hint="סטטוס ״הופקה״ לפני אישור"
              />
              <CashCard
                icon={FileSpreadsheet}
                title="חשבונות חלקיים — הוגשו"
                value={currencyFormatter.format(cashFlow.partialsSubmitted)}
              />
              <CashCard
                icon={FileSpreadsheet}
                title="חשבונות חלקיים — מאושרים"
                value={currencyFormatter.format(cashFlow.partialsApproved)}
              />
              <CashCard
                icon={FileSpreadsheet}
                title="חשבונות חלקיים — שולמו"
                value={currencyFormatter.format(cashFlow.partialsPaid)}
              />
              <CashCard
                icon={TrendingUp}
                title="חשבונות חלקיים בטיוטה (חשיפת תביעה)"
                value={currencyFormatter.format(
                  cashFlow.partialDraftPaymentExposure
                )}
                emphasize
                hint="סכום לתשלום מוצהר בטיוטות פתוחות"
              />
            </div>
            <p className="text-xs text-slate-400">
              הסכומים מבוססים על נתוני מסמכים במערכת; לשימוש בקרה — אימות מול
              חשבונאות.
            </p>
          </section>
        ) : null}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  label: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-indigo-600 text-white shadow-sm"
          : "text-slate-600 hover:bg-background"
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {label}
    </button>
  )
}

function pctOf(base: number, part: number): number {
  if (!(base > 0)) return 0
  return Math.min(100, Math.round((part / base) * 100))
}

function FinancialHealthStrip({
  budget,
  actual,
  recognized,
  collected,
}: {
  budget: number
  actual: number
  recognized: number
  collected: number
}) {
  return (
    <div className="flex flex-col gap-2">
      <HealthBar
        label="גבייה מול חוזה"
        pct={pctOf(budget, collected)}
        tone="emerald"
      />
      <HealthBar
        label="הכרה מול חוזה"
        pct={pctOf(budget, recognized)}
        tone="indigo"
      />
      <HealthBar
        label="רכש מול חוזה"
        pct={pctOf(budget, actual)}
        tone="amber"
      />
    </div>
  )
}

function HealthBar({
  label,
  pct,
  tone,
}: {
  label: string
  pct: number
  tone: "emerald" | "indigo" | "amber"
}) {
  const bg =
    tone === "emerald"
      ? "bg-emerald-500"
      : tone === "indigo"
        ? "bg-indigo-600"
        : "bg-amber-500"
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between gap-2 text-[10px] text-slate-500">
        <span>{label}</span>
        <span className="font-currency-mono tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full transition-all", bg)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function CashCard({
  icon: Icon,
  title,
  value,
  hint,
  emphasize,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  title: string
  value: string
  hint?: string
  emphasize?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-100 p-4",
        emphasize && "border-indigo-200 bg-indigo-50/40"
      )}
    >
      <div className="flex items-start gap-2">
        <Icon
          className={cn(
            "mt-0.5 size-4 shrink-0",
            emphasize ? "text-indigo-600" : "text-slate-400"
          )}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <p className="font-currency-mono text-lg font-semibold tabular-nums text-[#1e293b]">
            {value}
          </p>
          {hint ? (
            <p className="mt-1 text-[10px] text-slate-400">{hint}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
