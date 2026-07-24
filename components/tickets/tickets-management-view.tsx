"use client"

import type { ReactNode } from "react"
import { AlertCircle } from "lucide-react"

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
  high: "border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300",
  medium: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-200",
  low: "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
}

const STATUS_BADGE_CLASS: Record<TicketStatusUi, string> = {
  open: "border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-200",
  in_progress: "border-amber-500/45 bg-amber-500/15 text-amber-700 dark:text-amber-200",
  resolved: "border-emerald-500/35 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  closed: "border-border bg-muted/80 text-muted-foreground",
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
      className="-mx-4 flex-1 min-h-0 overflow-y-auto bg-background px-4 py-6 font-sans text-foreground md:-mx-6 md:px-6 md:py-10"
      dir="rtl"
    >
      <header className="mb-8 flex flex-col gap-6 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2 text-start">
          <h1 className="bg-gradient-to-l from-cyan-400 to-blue-600 bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
            ניהול קריאות שירות
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
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
          role="alert"
          className="mb-4 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-start text-sm text-amber-800 dark:text-amber-100/95"
        >
          <p className="font-semibold">מוצגים נתוני הדגמה — אין חיבור למסד הנתונים</p>
          {fetchErrorMessage && (
            <p className="mt-1 text-xs opacity-80">{fetchErrorMessage}</p>
          )}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {showEmptyState ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
            <div className="rounded-full border border-border bg-muted p-4">
              <span className="block size-10 rounded-full border-2 border-dashed border-border/60" />
            </div>
            <p className="text-lg font-medium text-foreground">
              אין קריאות שירות להצגה כרגע
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              טרם נרשמו קריאות במערכת, או שאין תוצאות התואמות את הסינון. ניתן
              לפתוח קריאה חדשה באמצעות הכפתור למעלה.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-start text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3.5 font-medium text-muted-foreground">מזהה</th>
                  <th className="px-4 py-3.5 font-medium text-muted-foreground">מיקום</th>
                  <th className="px-4 py-3.5 font-medium text-muted-foreground">
                    קטגוריה
                  </th>
                  <th className="px-4 py-3.5 font-medium text-muted-foreground">דחיפות</th>
                  <th className="px-4 py-3.5 font-medium text-muted-foreground">סטטוס</th>
                  <th className="px-4 py-3.5 font-medium text-muted-foreground">
                    תאריך פתיחה
                  </th>
                  <th className="px-4 py-3.5 font-medium text-muted-foreground">SLA</th>
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
    <tr className="border-b border-border/80 transition-colors hover:bg-muted/30">
      <td className="px-4 py-3.5 font-mono text-xs text-foreground tabular-nums">
        {row.id}
      </td>
      <td className="px-4 py-3.5 text-foreground">{row.location}</td>
      <td className="px-4 py-3.5 text-muted-foreground">{row.categoryHe}</td>
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
      <td className="px-4 py-3.5 text-muted-foreground tabular-nums">
        {row.openedAtLabel}
      </td>
      <td className="px-4 py-3.5">
        {row.slaDueAt ? (
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
            row.slaBreached
              ? "bg-red-500/15 text-red-700 dark:text-red-300"
              : "bg-muted text-muted-foreground"
          )}>
            {row.slaBreached && <AlertCircle className="size-2.5" aria-hidden />}
            {new Intl.DateTimeFormat("he-IL", { dateStyle: "short" }).format(new Date(row.slaDueAt))}
          </span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </td>
    </tr>
  )
}
