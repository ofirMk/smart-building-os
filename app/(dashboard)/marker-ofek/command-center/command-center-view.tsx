import Link from "next/link"
import { Building2 } from "lucide-react"

import type { AppUserRole } from "@/lib/auth/user-role"
import type { CommandCenterSnapshot } from "@/lib/marker-ofek/command-center-data"
import type { OrganizationBrandingSnapshot } from "@/lib/marker-ofek/organization-branding-public"
import type { CommandCenterWorkspaceLayout, WorkspacePersona } from "@/lib/marker-ofek/workspace-types"
import {
  canViewHoldingExecutive,
  isPartnerMetricsViewer,
} from "@/lib/marker-ofek/partner-metrics/access"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { CommandCenterModulesGrid } from "@/components/marker-ofek/command-center-modules-grid"

import { CommandCenterHeaderClient } from "./command-center-header-client"
import { CommandCenterMotion } from "./command-center-motion"
import { CommandCenterOpenTasksAccordion } from "./command-center-open-tasks-accordion"

export type CommandCenterExecutivePulse = {
  recognizedRevenueNis: number
  portfolioNetLoadedProfitNis: number
  accountsReceivableNis: number
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
  savedDefaultProjectId,
  commandCenterLayout,
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
  /** פרויקט ברירת מחדל משולחן העבודה השמור */
  savedDefaultProjectId?: string | null
  /** סדר והסתרת כרטיסי מודול — `settings.layout.commandCenter` */
  commandCenterLayout: CommandCenterWorkspaceLayout | null
}) {
  const { tiles } = snapshot
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

  const hasUrgentAlerts =
    tiles.some((t) => t.level !== "green") ||
    snapshot.poPendingApproval > 0 ||
    snapshot.scheduleExceptions > 0 ||
    snapshot.staleDraftPartials > 0

  return (
    <div dir="rtl" className="w-full text-[13px] text-foreground">
      <CommandCenterMotion>
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 pb-8 font-sans lg:gap-5">
        <header className="border-b border-slate-200 pb-1.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {branding.organizationName}
          </p>
          <div className="mt-0.5 flex flex-row items-start gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-card shadow-sm sm:size-8">
              {branding.brandLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={branding.brandLogoUrl}
                  alt=""
                  className="size-full object-contain p-0.5"
                />
              ) : (
                <Building2 className="size-4 text-slate-800" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1 text-start">
              <div className="flex flex-row flex-wrap items-baseline gap-x-2.5 gap-y-0">
                <h1 className="text-sm font-bold tracking-tight text-foreground sm:text-base">
                  מרכז הפיקוד
                </h1>
                <p className="text-xs font-medium text-slate-800 sm:text-sm">{hostWelcomeLine}</p>
              </div>
              <div className="mt-0.5 flex flex-row flex-wrap items-center gap-1.5">
                <CommandCenterHeaderClient />
                <p className="min-w-0 flex-1 text-[10px] leading-snug text-slate-600 sm:text-[11px]">
                  {pulseSummary}
                </p>
              </div>
              <p className="mt-0.5 line-clamp-1 font-currency-mono text-[9px] text-slate-500">
                {branding.slogan}
              </p>
            </div>
          </div>
          {savedDefaultProjectId ? (
            <div className="mt-1 flex justify-start">
              <Link
                href={`/marker-ofek/projects/${savedDefaultProjectId}`}
                className="text-[10px] font-medium text-emerald-700 underline-offset-2 hover:text-emerald-800 hover:underline"
              >
                מעבר לפרויקט ברירת המחדל שלך
              </Link>
            </div>
          ) : null}
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
            className="grid gap-4 rounded-2xl border border-slate-200/90 bg-card p-5 shadow-md sm:grid-cols-3"
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
                className="rounded-lg border border-amber-200 bg-card px-3 py-2 text-[12px] font-medium text-amber-950 shadow-sm transition hover:bg-amber-50"
              >
                ספקים ומס
              </Link>
              <Link
                href="/marker-ofek/finance/partials"
                className="rounded-lg border border-amber-200 bg-card px-3 py-2 text-[12px] font-medium text-amber-950 shadow-sm transition hover:bg-amber-50"
              >
                חשבונות חלקיים
              </Link>
              <Link
                href="/marker-ofek/finance/centralized"
                className="rounded-lg border border-amber-200 bg-card px-3 py-2 text-[12px] font-medium text-amber-950 shadow-sm transition hover:bg-amber-50"
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
                className="rounded-lg border border-sky-200 bg-card px-3 py-2 text-[12px] font-medium text-sky-950 shadow-sm transition hover:bg-sky-50"
              >
                יומני עבודה
              </Link>
              <Link
                href="/marker-ofek/execution/plans"
                className="rounded-lg border border-sky-200 bg-card px-3 py-2 text-[12px] font-medium text-sky-950 shadow-sm transition hover:bg-sky-50"
              >
                תוכניות ושטח
              </Link>
              <Link
                href="/marker-ofek/execution/gantt"
                className="rounded-lg border border-sky-200 bg-card px-3 py-2 text-[12px] font-medium text-sky-950 shadow-sm transition hover:bg-sky-50"
              >
                לוחות זמנים
              </Link>
            </div>
          </section>
        ) : null}

        <Accordion
          type="single"
          collapsible
          defaultValue={undefined}
          className="rounded-xl border border-slate-200 bg-card px-2 shadow-sm sm:px-3"
        >
          <AccordionItem value="cc-operational-pulse" className="border-0">
            <AccordionTrigger
              data-diamond-spotlight="cc-pulse"
              className="py-2 text-[11px] font-semibold uppercase tracking-wide text-foreground hover:no-underline sm:py-2.5"
              aria-label="דופק תפעולי — לחצו לפתיחת מדדי עומס"
            >
              <span className="flex flex-row-reverse items-center gap-2">
                {hasUrgentAlerts ? (
                  <span
                    className="inline-flex size-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_2px_rgba(15,23,42,0.12)]"
                    aria-hidden
                  />
                ) : null}
                דופק
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-3 pt-0">
              <div className="flex flex-wrap gap-x-6 gap-y-2 font-currency-mono text-sm tabular-nums text-foreground">
                <span>
                  PO ממתינים:{" "}
                  <span className="text-foreground">{snapshot.poPendingApproval}</span>
                </span>
                <span>
                  חריגות לו״ז:{" "}
                  <span className="text-foreground">{snapshot.scheduleExceptions}</span>
                </span>
                <span>
                  מכרזים פתוחים:{" "}
                  <span className="text-foreground">{snapshot.openTendersCount}</span>
                </span>
                <span>
                  דיווחי שבוע:{" "}
                  <span className="text-foreground">{snapshot.weeklyExecutionLogs}</span>
                </span>
                <span>
                  חלקיים בטיוטה (ממושכים):{" "}
                  <span className="text-foreground">{snapshot.staleDraftPartials}</span>
                </span>
                <span>
                  יומני שטח אתמול (טיוטה):{" "}
                  <span className="text-foreground">{snapshot.draftFieldLogsYesterday}</span>
                </span>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* מודולי ליבה: DndContext + SortableContext + שמירת פריסה — ראו CommandCenterModulesGrid */}
        <CommandCenterModulesGrid
          masterTiles={snapshot.tiles}
          layout={commandCenterLayout}
        />

        <CommandCenterOpenTasksAccordion
          actions={actions}
          totalCount={openTasksTotal}
        />

        <div className="sticky bottom-3 z-20 mt-2 md:static md:bottom-auto">
          <div
            className="rounded-2xl border border-slate-200/90 bg-card/95 p-4 shadow-[0_8px_32px_-8px_rgba(15,23,42,0.12)] backdrop-blur-sm md:rounded-xl md:shadow-md"
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
                  className="rounded-xl border border-slate-200/90 bg-card p-4 text-center shadow-sm transition-colors hover:border-indigo-200 hover:shadow-md md:text-start"
                >
                  <p className="text-xs font-semibold text-indigo-950">מרכז שותפי ניהול</p>
                  <p className="mt-1 font-currency-mono text-[11px] text-slate-500">
                    פורטפוליו · הכנסות מוכרות
                  </p>
                </Link>
                <Link
                  href="/marker-ofek/finance/billing"
                  className="rounded-xl border border-slate-200/90 bg-card p-4 text-center shadow-sm transition-colors hover:border-indigo-200 hover:shadow-md md:text-start"
                >
                  <p className="text-xs font-semibold text-indigo-950">חיוב ותזרים</p>
                  <p className="mt-1 font-currency-mono text-[11px] text-slate-500">
                    AR · חשבוניות
                  </p>
                </Link>
                {exec ? (
                  <Link
                    href="/management"
                    className="rounded-xl border border-slate-200/90 bg-card p-4 text-center shadow-sm transition-colors hover:border-indigo-200 hover:shadow-md md:text-start"
                  >
                    <p className="text-xs font-semibold text-indigo-950">דשבורד הנהלה</p>
                    <p className="mt-2 font-currency-mono text-[11px] text-slate-500">
                      אישורי מנכ״ל · P&amp;L
                    </p>
                  </Link>
                ) : (
                  <Link
                    href="/marker-ofek/procurement/orders"
                    className="rounded-xl border border-slate-200/90 bg-card p-4 text-center shadow-sm transition-colors hover:border-indigo-200 hover:shadow-md md:text-start"
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
                  className="rounded-xl border border-slate-200/90 bg-card p-4 text-center shadow-sm transition-colors hover:border-indigo-200 hover:shadow-md md:text-start"
                >
                  <p className="text-xs font-semibold text-indigo-950">דיווח ביצוע יומי</p>
                  <p className="mt-1 font-currency-mono text-[11px] text-slate-500">
                    רישום שטח
                  </p>
                </Link>
                <Link
                  href={snapshot.ganttHref}
                  className="rounded-xl border border-slate-200/90 bg-card p-4 text-center shadow-sm transition-colors hover:border-indigo-200 hover:shadow-md md:text-start"
                >
                  <p className="text-xs font-semibold text-indigo-950">גאנט / WBS</p>
                  <p className="mt-1 font-currency-mono text-[11px] text-slate-500">
                    התקדמות משימות
                  </p>
                </Link>
                <Link
                  href="/marker-ofek/procurement/orders"
                  className="rounded-xl border border-slate-200/90 bg-card p-4 text-center shadow-sm transition-colors hover:border-indigo-200 hover:shadow-md md:text-start"
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
