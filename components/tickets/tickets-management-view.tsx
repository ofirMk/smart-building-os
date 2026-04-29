"use client"

import type { ReactNode } from "react"

import { CreateTicketDialog } from "@/components/tickets/create-ticket-dialog"
import { cn } from "@/lib/utils"
import type { BuildingOption } from "@/lib/buildings"
import type {
  TicketManagementTableRow,
  TicketStatusUi,
  TicketUrgency,
} from "@/types/tickets-management"

const URGENCY_LABEL: Record<TicketUrgency, string> = {
  high: "גבוהה",
  medium: "בינונית",
  low: "נמוכה",
}

const STATUS_LABEL: Record<TicketStatusUi, string> = {
  open: "פתוח",
  in_progress: "בטיפול",
  resolved: "טופל",
  closed: "סגור",
}

const URGENCY_BADGE_CLASS: Record<TicketUrgency, string> = {
  high: "border-red-500/40 bg-red-500/15 text-red-300",
  medium: "border-amber-500/40 bg-amber-500/15 text-amber-200",
  low: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
}

const STATUS_BADGE_CLASS: Record<TicketStatusUi, string> = {
  open: "border-sky-500/40 bg-sky-500/15 text-sky-200",
  in_progress: "border-amber-500/45 bg-amber-500/15 text-amber-200",
  resolved: "border-emerald-500/35 bg-emerald-500/15 text-emerald-300",
  closed: "border-gray-600 bg-gray-800/80 text-gray-400",
}

function Badge({
  pillClass,
  children,
}: {
  pillClass: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        pillClass
      )}
    >
      {children}
    </span>
  )
}

type TicketsManagementViewProps = {
  buildings: BuildingOption[]
  buildingsError: string | null
  /** שורות מהמסד; ריק אם אין רשומות */
  rows: TicketManagementTableRow[]
  /** true כשהטעינה נכשלה והוצגו נתוני MOCK_TICKETS */
  usedMockFallback: boolean
  /** הודעת שגיאה גולמית (למצב גיבוי) */
  fetchErrorMessage: string | null
}

export function TicketsManagementView({
  buildings,
  buildingsError,
  rows,
  usedMockFallback,
  fetchErrorMessage,
}: TicketsManagementViewProps) {
  void usedMockFallback
  const displayRows = rows
  const showEmptyState = rows.length === 0

  return (
    <div
      className="-mx-4 flex-1 min-h-0 overflow-y-auto bg-[#0a0a0a] px-4 py-6 font-sans text-gray-100 md:-mx-6 md:px-6 md:py-10"
      dir="rtl"
    >
      <header className="mb-8 flex flex-col gap-6 border-b border-gray-800 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2 text-start">
          <h1 className="bg-gradient-to-l from-cyan-400 to-blue-600 bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
            ניהול קריאות שירות
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-gray-400">
            מעקב אחר כל הקריאות בפרויקט המגורים — סטטוס, דחיפות ומיקום בזמן אמת.
            מומלץ לעדכן חברה אחראית וסטטוס לאחר ביקור בשטח.
          </p>
        </div>
        <div className="shrink-0">
          <CreateTicketDialog
            buildings={buildings}
            buildingsError={buildingsError}
            triggerLabel="פתח קריאה חדשה"
            triggerSize="lg"
            triggerClassName="border-0 bg-gradient-to-l from-cyan-500 to-blue-600 text-white shadow-none hover:from-cyan-400 hover:to-blue-500"
          />
        </div>
      </header>

      {usedMockFallback ? (
        <div
          role="status"
          className="mb-4 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-start text-sm text-amber-100/95"
        >
          <p className="font-medium">מוצגים נתוני הדגמה</p>
          <p className="mt-1 text-xs text-amber-200/85">
            לא ניתן לטעון קריאות מהמסד כרגע
            {fetchErrorMessage ? (
              <>
                :{" "}
                <span className="font-mono text-[0.8rem] text-amber-100/90">
                  {fetchErrorMessage}
                </span>
              </>
            ) : (
              "."
            )}
          </p>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-gray-800 bg-[#111111] shadow-lg">
        {showEmptyState ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
            <div className="rounded-full border border-gray-700 bg-[#161616] p-4">
              <span className="block size-10 rounded-full border-2 border-dashed border-gray-600" />
            </div>
            <p className="text-lg font-medium text-gray-200">
              אין קריאות שירות להצגה כרגע
            </p>
            <p className="max-w-md text-sm text-gray-500">
              טרם נרשמו קריאות במערכת, או שאין תוצאות התואמות את הסינון. ניתן
              לפתוח קריאה חדשה באמצעות הכפתור למעלה.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-start text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-[#141414]">
                  <th className="px-4 py-3.5 font-medium text-gray-400">מזהה</th>
                  <th className="px-4 py-3.5 font-medium text-gray-400">מיקום</th>
                  <th className="px-4 py-3.5 font-medium text-gray-400">
                    קטגוריה
                  </th>
                  <th className="px-4 py-3.5 font-medium text-gray-400">דחיפות</th>
                  <th className="px-4 py-3.5 font-medium text-gray-400">סטטוס</th>
                  <th className="px-4 py-3.5 font-medium text-gray-400">
                    תאריך פתיחה
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => (
                  <TicketRow key={row.sourceId} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function TicketRow({ row }: { row: TicketManagementTableRow }) {
  return (
    <tr className="border-b border-gray-800/80 transition-colors hover:bg-[#161616]">
      <td className="px-4 py-3.5 font-mono text-xs text-gray-200 tabular-nums">
        {row.id}
      </td>
      <td className="px-4 py-3.5 text-gray-200">{row.location}</td>
      <td className="px-4 py-3.5 text-gray-300">{row.categoryHe}</td>
      <td className="px-4 py-3.5">
        <Badge pillClass={URGENCY_BADGE_CLASS[row.urgency]}>
          {URGENCY_LABEL[row.urgency]}
        </Badge>
      </td>
      <td className="px-4 py-3.5">
        <Badge pillClass={STATUS_BADGE_CLASS[row.status]}>
          {STATUS_LABEL[row.status]}
        </Badge>
      </td>
      <td className="px-4 py-3.5 text-gray-400 tabular-nums">
        {row.openedAtLabel}
      </td>
    </tr>
  )
}
