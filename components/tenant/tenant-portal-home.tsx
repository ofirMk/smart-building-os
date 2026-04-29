import Link from "next/link"
import { Bell, ChevronLeft, CreditCard, FileDown, Receipt, Ticket } from "lucide-react"

import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button-variants"
import { formatNisHe } from "@/lib/format-nis"
import { cn } from "@/lib/utils"

const EMPTY_PORTAL = {
  welcomeTitle: "ברוך הבא",
  unitSubtitle: "",
  openBalanceNis: 0,
  activeTicketsCount: 0,
  activeTicketsSummary: "",
  paymentHistory: [] as { id: string; dateLabel: string; documentNumber: string; description: string; amountNis: number }[],
  recentTickets: [] as { id: string; title: string; statusLabel: string }[],
  recentAnnouncements: [] as { id: string; title: string; dateLabel: string }[],
}

export function TenantPortalHome() {
  const m = EMPTY_PORTAL

  return (
    <div className="flex flex-col gap-6 pb-4 text-gray-100">
      <header className="space-y-2 text-start">
        <h1 className="text-xl font-bold leading-tight tracking-tight text-white sm:text-2xl">
          {m.welcomeTitle}
        </h1>
        <p className="text-sm text-gray-400">{m.unitSubtitle}</p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-800 bg-[#111111] p-4 shadow-lg">
          <p className="text-xs font-medium text-gray-500">יתרה לתשלום</p>
          <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-white sm:text-4xl">
            {formatNisHe(m.openBalanceNis)}
          </p>
          <p className="mt-1 text-[0.7rem] text-gray-500">כולל חיובים ממתינים</p>
        </div>
        <div className="rounded-2xl border border-gray-800 bg-[#111111] p-4 shadow-lg">
          <p className="text-xs font-medium text-gray-500">
            קריאות שירות פתוחות
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-cyan-400 sm:text-4xl">
            {m.activeTicketsCount}
          </p>
          <p className="mt-1 text-[0.7rem] text-gray-400">
            {m.activeTicketsSummary}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Link
          href="/tenant/tickets/new"
          className={cn(
            buttonVariants({ variant: "default", size: "lg" }),
            "h-auto min-h-11 w-full flex-col gap-1 border-0 bg-gradient-to-l from-cyan-500 to-blue-600 py-3 text-center text-white shadow-none hover:from-cyan-400 hover:to-blue-500"
          )}
        >
          <Ticket className="size-5 shrink-0" aria-hidden />
          <span className="text-xs font-semibold leading-tight">
            פתיחת קריאה חדשה
          </span>
        </Link>
        <Link
          href="/tenant/billing"
          className={cn(
            buttonVariants({ variant: "default", size: "lg" }),
            "h-auto min-h-11 w-full flex-col gap-1 border border-gray-700 bg-[#161616] py-3 text-center text-gray-100 shadow-none hover:bg-[#1a1a1a]"
          )}
        >
          <CreditCard className="size-5 shrink-0 text-cyan-400" aria-hidden />
          <span className="text-xs font-semibold leading-tight">
            לתשלום מאובטח
          </span>
        </Link>
      </section>

      <section className="space-y-3">
        <div className="text-start">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <Receipt className="size-5 text-cyan-400" aria-hidden />
            היסטוריית תשלומים וחשבוניות
          </h2>
          <p className="mt-1 text-[0.7rem] leading-relaxed text-gray-500">
            מסמכים לפי נתונים שהופקו במערכת חשבוניות חיצונית מאושרת (חתימה
            דיגיטלית). להורדה — עותק PDF מקורי לצרכי תיעוד ומס.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-800 bg-[#111111] shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-start text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-[#141414]">
                  <th className="px-3 py-3 font-medium text-gray-400 sm:px-4">
                    תאריך
                  </th>
                  <th className="px-3 py-3 font-medium text-gray-400 sm:px-4">
                    מספר מסמך
                  </th>
                  <th className="px-3 py-3 font-medium text-gray-400 sm:px-4">
                    תיאור
                  </th>
                  <th className="px-3 py-3 font-medium text-gray-400 sm:px-4">
                    סכום
                  </th>
                  <th className="px-3 py-3 font-medium text-gray-400 sm:px-4">
                    פעולות
                  </th>
                </tr>
              </thead>
              <tbody>
                {m.paymentHistory.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-gray-800/80 transition-colors hover:bg-[#161616]"
                  >
                    <td className="whitespace-nowrap px-3 py-3.5 tabular-nums text-gray-300 sm:px-4">
                      {row.dateLabel}
                    </td>
                    <td className="px-3 py-3.5 font-mono text-xs text-gray-200 sm:px-4">
                      {row.documentNumber}
                    </td>
                    <td className="max-w-[200px] px-3 py-3.5 text-gray-200 sm:max-w-none sm:px-4">
                      <span className="line-clamp-2 sm:line-clamp-none">
                        {row.description}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 font-medium tabular-nums text-gray-100 sm:px-4">
                      {formatNisHe(row.amountNis)}
                    </td>
                    <td className="px-3 py-3 sm:px-4">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`הורדת מסמך מקור PDF — ${row.documentNumber}`}
                        className="gap-1.5 border-gray-600 bg-[#161616] text-xs text-gray-200 hover:bg-[#1c1c1c]"
                      >
                        <FileDown className="size-3.5 shrink-0" aria-hidden />
                        <span className="hidden sm:inline">
                          הורדת מסמך מקור
                        </span>
                        <span className="sm:hidden">הורדה</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          פעילות אחרונה
        </h2>

        <div className="overflow-hidden rounded-2xl border border-gray-800 bg-[#111111]">
          <div className="border-b border-gray-800 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-medium text-gray-200">
              <Ticket className="size-4 text-cyan-500" aria-hidden />
              קריאות אחרונות
            </h3>
          </div>
          <ul className="divide-y divide-gray-800/90">
            {m.recentTickets.map((t) => (
              <li key={t.id}>
                <Link
                  href="/tenant/tickets"
                  className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-[#161616]"
                >
                  <div className="min-w-0 flex-1 text-start">
                    <p className="truncate text-sm font-medium text-gray-100">
                      {t.title}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">{t.statusLabel}</p>
                  </div>
                  <ChevronLeft
                    className="size-4 shrink-0 text-gray-600"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-800 bg-[#111111]">
          <div className="border-b border-gray-800 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-medium text-gray-200">
              <Bell className="size-4 text-amber-400" aria-hidden />
              הודעות מהבניין
            </h3>
          </div>
          <ul className="divide-y divide-gray-800/90">
            {m.recentAnnouncements.map((a) => (
              <li key={a.id} className="px-4 py-3.5">
                <p className="text-sm font-medium text-gray-100">{a.title}</p>
                <p className="mt-1 text-xs text-gray-500">{a.dateLabel}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
