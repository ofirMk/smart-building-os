import Link from "next/link"
import {
  Briefcase,
  Building2,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileSearch,
  Landmark,
  ShoppingCart,
  Wallet,
} from "lucide-react"

import type { AppUserRole } from "@/lib/auth/user-role"
import type { CommandCenterSnapshot } from "@/lib/marker-ofek/command-center-data"
import type { OrganizationBrandingSnapshot } from "@/lib/marker-ofek/organization-branding-public"
import type { WorkspacePersona } from "@/lib/marker-ofek/workspace-types"
import {
  canViewHoldingExecutive,
  isPartnerMetricsViewer,
} from "@/lib/marker-ofek/partner-metrics/access"
import { cn } from "@/lib/utils"

import { CommandCenterHeaderClient } from "./command-center-header-client"
import { CommandCenterMotion } from "./command-center-motion"
import { CommandCenterOpenTasksAccordion } from "./command-center-open-tasks-accordion"

export type CommandCenterExecutivePulse = {
  recognizedRevenueNis: number
  portfolioNetLoadedProfitNis: number
  accountsReceivableNis: number
}

function statusMeta(level: CommandCenterSnapshot["tiles"][0]["level"]) {
  if (level === "green") {
    return {
      label: "תקין",
      dot: "bg-emerald-500",
      badge: "border border-slate-100 bg-emerald-50 text-emerald-800",
    }
  }
  if (level === "yellow") {
    return {
      label: "למעקב",
      dot: "bg-amber-400",
      badge: "border border-slate-100 bg-amber-50 text-amber-900",
    }
  }
  return {
    label: "סיכון",
    dot: "bg-red-500",
    badge: "border border-slate-100 bg-red-50 text-red-900",
  }
}

const ils0 = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

export function CommandCenterView({
  snapshot,
  userEmail,
  userRole,
  branding,
  hostFirstName,
  hostWelcomeLine,
  pulseSummary,
  welcomeBack,
  executivePulse,
  workspacePersona,
}: {
  snapshot: CommandCenterSnapshot
  userEmail: string | null
  userRole: AppUserRole
  branding: OrganizationBrandingSnapshot
  hostFirstName: string
  hostWelcomeLine: string
  pulseSummary: string
  welcomeBack: { href: string; pageTitle: string } | null
  executivePulse: CommandCenterExecutivePulse | null
  workspacePersona: WorkspacePersona
}) {
  const { tiles } = snapshot
  const tileIcons = [ShoppingCart, FileSearch, Briefcase, Landmark, Wallet] as const
  const partner = isPartnerMetricsViewer(userEmail)
  const exec = canViewHoldingExecutive(userEmail, userRole)

  const actions: {
    label: string
    count: number
    href: string
    hot: boolean
  }[] = [
    {
      label: "הזמנות ממתינות לאישור הנהלה",
      count: snapshot.poPendingApproval,
      href: "/marker-ofek/procurement/orders",
      hot: snapshot.poPendingApproval > 0,
    },
    {
      label: "חריגות לוח זמנים (חברות ביצוע)",
      count: snapshot.scheduleExceptions,
      href: "/marker-ofek/execution/gantt",
      hot: snapshot.scheduleExceptions > 0,
    },
    {
      label: "חשבונות חלקיים — טיוטה ממושכת",
      count: snapshot.staleDraftPartials,
      href: "/marker-ofek/finance/partials",
      hot: snapshot.staleDraftPartials > 0,
    },
    {
      label: "דיווח ביצוע יומי (שבוע אחרון)",
      count: snapshot.weeklyExecutionLogs,
      href: "/marker-ofek/execution/daily-logs",
      hot: snapshot.weeklyExecutionLogs === 0,
    },
  ]

  const openTasksTotal = actions.reduce((sum, a) => sum + a.count, 0)

  return (
    <div dir="rtl" className="w-full text-[13px] text-[#1e293b]">
      <CommandCenterMotion>
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 pb-10 font-sans lg:gap-12">
        <header className="flex flex-col gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
              {branding.brandLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={branding.brandLogoUrl}
                  alt=""
                  className="size-full object-contain p-1.5"
                />
              ) : (
                <Building2
                  className="size-6 text-[#1e1b4b]"
                  aria-hidden
                />
              )}
            </div>
            <div className="min-w-0 space-y-2 text-start">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {branding.organizationName}
              </p>
              <h2 className="text-xl font-semibold tracking-tight text-indigo-950 sm:text-2xl">
                {hostWelcomeLine}
              </h2>
              <p className="text-sm leading-relaxed text-slate-600">{pulseSummary}</p>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="module-page-title font-bold text-indigo-950">
                  מרכז הפיקוד
                </h1>
                <CommandCenterHeaderClient />
              </div>
              <p className="font-currency-mono text-[12px] text-slate-500">
                {branding.slogan}
              </p>
            </div>
          </div>
        </header>

        {welcomeBack ? (
          <section
            className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5 shadow-sm"
            aria-label="המשך מאיפה שעצרת"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800/80">
              ברוך שובך
            </p>
            <p className="mt-2 text-sm text-indigo-950">
              {hostFirstName}, להמשיך מהמקום שבו עצרת ב־
              <span className="font-medium"> {welcomeBack.pageTitle}</span>?
            </p>
            <Link
              href={welcomeBack.href}
              className="mt-3 inline-flex text-sm font-semibold text-indigo-700 underline-offset-2 hover:underline"
            >
              המשך ל{welcomeBack.pageTitle}
            </Link>
          </section>
        ) : null}

        {executivePulse ? (
          <section
            className="grid gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-md sm:grid-cols-3"
            aria-label="דופק פיננסי"
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                הכנסות מוכרות
              </p>
              <p className="mt-1 font-currency-mono text-lg font-semibold tabular-nums text-indigo-950">
                {ils0.format(executivePulse.recognizedRevenueNis)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                רווח טעון (נטו)
              </p>
              <p className="mt-1 font-currency-mono text-lg font-semibold tabular-nums text-indigo-950">
                {ils0.format(executivePulse.portfolioNetLoadedProfitNis)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                חוב לקוחות (AR)
              </p>
              <p className="mt-1 font-currency-mono text-lg font-semibold tabular-nums text-indigo-950">
                {ils0.format(executivePulse.accountsReceivableNis)}
              </p>
            </div>
          </section>
        ) : null}

        {workspacePersona === "finance" ? (
          <section
            className="flex flex-col gap-3 rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/90 to-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            aria-label="רצועת כספים ותאימות"
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                תאימות מס וזרימת מזומנים
              </p>
              <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-amber-950/90">
                מוקצים לך ווידג׳טים פיננסיים: עקוב אחר ספקים לפני אישור PO, ובדוק חשבונות חלקיים
                ודוחות מס בזמן אמת.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/marker-ofek/entities/suppliers"
                className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-[12px] font-medium text-amber-950 shadow-sm transition hover:bg-amber-50"
              >
                ספקים ומס
              </Link>
              <Link
                href="/marker-ofek/finance/partials"
                className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-[12px] font-medium text-amber-950 shadow-sm transition hover:bg-amber-50"
              >
                חשבונות חלקיים
              </Link>
              <Link
                href="/marker-ofek/finance/centralized"
                className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-[12px] font-medium text-amber-950 shadow-sm transition hover:bg-amber-50"
              >
                כספים מרכזיים
              </Link>
            </div>
          </section>
        ) : null}

        {workspacePersona === "field" ? (
          <section
            className="flex flex-col gap-3 rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/90 to-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            aria-label="רצועת שטח"
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">
                שטח — יומנים, תמונות וקשר לקבלנים
              </p>
              <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-sky-950/90">
                שולחן העבודה שלך מדגיש ביצוע בשטח. דווחו יומן, צרפו תמונות, ופתחו WhatsApp לספקים
                דרך ה-Sidekick.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/marker-ofek/execution/daily-logs"
                className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-[12px] font-medium text-sky-950 shadow-sm transition hover:bg-sky-50"
              >
                יומני עבודה
              </Link>
              <Link
                href="/marker-ofek/execution/plans"
                className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-[12px] font-medium text-sky-950 shadow-sm transition hover:bg-sky-50"
              >
                תוכניות ושטח
              </Link>
              <Link
                href="/marker-ofek/execution/gantt"
                className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-[12px] font-medium text-sky-950 shadow-sm transition hover:bg-sky-50"
              >
                לוחות זמנים
              </Link>
            </div>
          </section>
        ) : null}

        <section
          data-diamond-spotlight="cc-pulse"
          className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-md sm:p-5"
          aria-label="דופק תפעולי"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            דופק
          </h2>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 font-currency-mono text-sm tabular-nums text-indigo-950">
            <span>
              PO ממתינים:{" "}
              <span className="text-indigo-900">{snapshot.poPendingApproval}</span>
            </span>
            <span>
              חריגות לו״ז:{" "}
              <span className="text-indigo-900">{snapshot.scheduleExceptions}</span>
            </span>
            <span>
              מכרזים פתוחים:{" "}
              <span className="text-indigo-900">{snapshot.openTendersCount}</span>
            </span>
            <span>
              דיווחי שבוע:{" "}
              <span className="text-indigo-900">{snapshot.weeklyExecutionLogs}</span>
            </span>
            <span>
              חלקיים בטיוטה (ממושכים):{" "}
              <span className="text-indigo-900">{snapshot.staleDraftPartials}</span>
            </span>
            <span>
              יומני שטח אתמול (טיוטה):{" "}
              <span className="text-indigo-900">{snapshot.draftFieldLogsYesterday}</span>
            </span>
          </div>
        </section>

        <div className="space-y-6">
          <h2 className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 md:text-start">
            ליבת המערכת
          </h2>
        <section
          data-diamond-spotlight="cc-modules"
          className="grid auto-rows-fr grid-cols-1 gap-8 md:grid-cols-3 lg:grid-cols-5 lg:gap-10"
          role="navigation"
          aria-label="מודולי המערכת"
        >
          {tiles.map((tile, idx) => {
            const meta = statusMeta(tile.level)
            const Icon = tileIcons[idx] ?? FileSearch
            return (
              <article
                key={tile.title}
                className={cn(
                  "flex min-h-[240px] flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-6 shadow-md transition-shadow duration-200 hover:border-slate-300 hover:shadow-lg",
                  tile.articleClassName
                )}
              >
                <a href={tile.href} className="block">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-700 shadow-sm">
                        <Icon className="size-6 stroke-[1.5]" aria-hidden />
                      </span>
                      <h2 className="text-base font-semibold tracking-tight text-indigo-950 md:text-lg">
                        {tile.title}
                      </h2>
                    </div>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium",
                        meta.badge
                      )}
                    >
                      <span className={cn("inline-block size-2 rounded-full", meta.dot)} aria-hidden />
                      {meta.label}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-3 text-[12px] leading-relaxed text-slate-600",
                      tile.summaryMono && "font-currency-mono tabular-nums"
                    )}
                  >
                    {tile.summary}
                  </p>
                </a>
                <ul className="mt-3 space-y-1.5 text-[11px] text-slate-600">
                  {tile.highlights.map((line, hidx) => (
                    <li key={`${tile.title}-${hidx}`} className="flex items-start gap-1.5">
                      {hidx === 0 ? (
                        <Clock3 className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />
                      ) : hidx === 1 ? (
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-slate-500" aria-hidden />
                      ) : (
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden />
                      )}
                      <span
                        className={cn(
                          (hidx === 1 || line.includes("₪")) && "font-currency-mono tabular-nums"
                        )}
                      >
                        {line}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  <a
                    href={tile.quickActionHref}
                    className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-600 px-3 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-indigo-500"
                  >
                    {tile.quickActionLabel}
                    <FileCheck2 className="size-3.5 shrink-0 opacity-95" aria-hidden />
                  </a>
                </div>
              </article>
            )
          })}
        </section>
        </div>

        <CommandCenterOpenTasksAccordion
          actions={actions}
          totalCount={openTasksTotal}
        />

        <div className="sticky bottom-3 z-20 mt-2 md:static md:bottom-auto">
          <div
            className="rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_8px_32px_-8px_rgba(15,23,42,0.12)] backdrop-blur-sm md:rounded-xl md:shadow-md"
            data-diamond-spotlight="cc-quick"
          >
            <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400 md:text-start">
              פעולות מהירות
            </p>
            {partner ? (
              <section
                className="grid gap-3 sm:grid-cols-3"
                aria-label="כרטיסי הנהלה בכירה"
              >
                <Link
                  href="/marker-ofek/partner-finance"
                  className="rounded-xl border border-slate-200/90 bg-white p-4 text-center shadow-sm transition-colors hover:border-indigo-200 hover:shadow-md md:text-start"
                >
                  <p className="text-xs font-semibold text-indigo-950">מרכז שותפי ניהול</p>
                  <p className="mt-1 font-currency-mono text-[11px] text-slate-500">
                    פורטפוליו · הכנסות מוכרות
                  </p>
                </Link>
                <Link
                  href="/marker-ofek/finance/billing"
                  className="rounded-xl border border-slate-200/90 bg-white p-4 text-center shadow-sm transition-colors hover:border-indigo-200 hover:shadow-md md:text-start"
                >
                  <p className="text-xs font-semibold text-indigo-950">חיוב ותזרים</p>
                  <p className="mt-1 font-currency-mono text-[11px] text-slate-500">
                    AR · חשבוניות
                  </p>
                </Link>
                {exec ? (
                  <Link
                    href="/management"
                    className="rounded-xl border border-slate-200/90 bg-white p-4 text-center shadow-sm transition-colors hover:border-indigo-200 hover:shadow-md md:text-start"
                  >
                    <p className="text-xs font-semibold text-indigo-950">דשבורד הנהלה</p>
                    <p className="mt-2 font-currency-mono text-[11px] text-slate-500">
                      אישורי מנכ״ל · P&amp;L
                    </p>
                  </Link>
                ) : (
                  <Link
                    href="/marker-ofek/procurement/orders"
                    className="rounded-xl border border-slate-200/90 bg-white p-4 text-center shadow-sm transition-colors hover:border-indigo-200 hover:shadow-md md:text-start"
                  >
                    <p className="text-xs font-semibold text-indigo-950">תור אישורי רכש</p>
                    <p className="mt-2 font-currency-mono text-[11px] text-slate-500">
                      PO ממתינים
                    </p>
                  </Link>
                )}
              </section>
            ) : (
              <section
                className="grid gap-3 sm:grid-cols-3"
                aria-label="כרטיסי ניהול שטח"
              >
                <Link
                  href="/marker-ofek/execution/daily-logs"
                  className="rounded-xl border border-slate-200/90 bg-white p-4 text-center shadow-sm transition-colors hover:border-indigo-200 hover:shadow-md md:text-start"
                >
                  <p className="text-xs font-semibold text-indigo-950">דיווח ביצוע יומי</p>
                  <p className="mt-1 font-currency-mono text-[11px] text-slate-500">
                    רישום שטח
                  </p>
                </Link>
                <Link
                  href={snapshot.ganttHref}
                  className="rounded-xl border border-slate-200/90 bg-white p-4 text-center shadow-sm transition-colors hover:border-indigo-200 hover:shadow-md md:text-start"
                >
                  <p className="text-xs font-semibold text-indigo-950">גאנט / WBS</p>
                  <p className="mt-1 font-currency-mono text-[11px] text-slate-500">
                    התקדמות משימות
                  </p>
                </Link>
                <Link
                  href="/marker-ofek/procurement/orders"
                  className="rounded-xl border border-slate-200/90 bg-white p-4 text-center shadow-sm transition-colors hover:border-indigo-200 hover:shadow-md md:text-start"
                >
                  <p className="text-xs font-semibold text-indigo-950">הזמנות ממתינות</p>
                  <p className="mt-1 font-currency-mono text-[11px] tabular-nums text-slate-500">
                    {snapshot.poPendingApproval} פתוחות
                  </p>
                </Link>
              </section>
            )}
          </div>
        </div>
        </div>
      </CommandCenterMotion>
    </div>
  )
}
