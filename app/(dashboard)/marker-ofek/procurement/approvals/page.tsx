"use client"

import Link from "next/link"
import * as React from "react"
import {
  AlertTriangle,
  ArrowRight,
  CheckCheck,
  ClipboardCheck,
  Clock,
  Loader2,
  Inbox,
  Zap,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatError } from "@/lib/utils"
import type { ApprovalInboxRowDto } from "@/app/api/procurement/approvals/route"

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
})

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${amount.toLocaleString("he-IL")} ${currency}`
  }
}

function urgencyBadge(urgency: string): { label: string; className: string } {
  switch (urgency) {
    case "CRITICAL":
      return {
        label: "קריטי",
        className: "border-rose-300 bg-rose-50 text-rose-800",
      }
    case "HIGH":
      return {
        label: "גבוה",
        className: "border-amber-300 bg-amber-50 text-amber-800",
      }
    case "LOW":
      return {
        label: "נמוך",
        className: "border-slate-200 bg-slate-50 text-slate-600",
      }
    default:
      return {
        label: "רגיל",
        className: "border-slate-200 bg-slate-50 text-slate-700",
      }
  }
}

export default function ProcurementApprovalsInboxPage() {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [rows, setRows] = React.useState<ApprovalInboxRowDto[]>([])

  React.useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/procurement/approvals", {
          cache: "no-store",
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string
          } | null
          throw new Error(
            body?.error ?? `Request failed with status ${res.status}`,
          )
        }
        const json = (await res.json()) as { data: ApprovalInboxRowDto[] }
        if (!cancelled) setRows(json.data ?? [])
      } catch (e) {
        if (!cancelled) {
          setError(formatError(e))
          setRows([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const totalPending = rows.length
  const totalAmount = rows.reduce((s, r) => s + r.totalAmountGross, 0)
  const criticalCount = rows.filter(
    (r) => r.urgency === "HIGH" || r.urgency === "CRITICAL",
  ).length

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 pb-12 sm:gap-8">
      <Link
        href="/marker-ofek/procurement"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לרכש וספקים
      </Link>

      <header className="pharmacy-hero-card relative overflow-hidden p-5 sm:p-8">
        <div
          className="pointer-events-none absolute -start-20 -top-20 size-64 rounded-full bg-indigo-500/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700">
              <Inbox className="size-5 sm:size-6" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-indigo-700/90">
                מרקר אופק · רכש
              </p>
              <h1 className="text-pretty text-xl font-bold tracking-tight text-[#1e293b] sm:text-3xl">
                תיבת אישורים
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
                הזמנות רכש שממתינות לאישורך. כל שורה מציגה את סיבות החריגה
                ומאפשרת מעבר ישיר למסך האישור בכרטיס ההזמנה.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <KpiTile
              icon={ClipboardCheck}
              label="ממתינות לאישור"
              value={String(totalPending)}
              tone="indigo"
            />
            <KpiTile
              icon={Zap}
              label="דחיפות גבוהה"
              value={String(criticalCount)}
              tone="rose"
            />
            <KpiTile
              icon={CheckCheck}
              label='סה"כ סכום'
              value={formatCurrency(totalAmount, rows[0]?.currency ?? "ILS")}
              tone="emerald"
            />
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" aria-hidden />
          <span>טוען תיבת אישורים…</span>
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden />
          <AlertTitle>לא ניתן לטעון את תיבת האישורים</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : rows.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-border/60 bg-card/70 px-6 py-12 text-center">
          <CheckCheck
            className="mx-auto mb-3 size-10 text-emerald-500"
            aria-hidden
          />
          <h2 className="text-lg font-semibold">אין כרגע הזמנות לאישור</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            כל ה-POs במצב טיוטה, אושרו, או נסגרו. תיבה ריקה — עבודה נקייה.
          </p>
        </section>
      ) : (
        <section className="rounded-2xl border border-border/60 bg-card/90 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-3 sm:px-6 sm:py-4">
            <ClipboardCheck
              className="size-5 shrink-0 text-indigo-600"
              aria-hidden
            />
            <h2 className="text-base font-semibold sm:text-lg">
              הזמנות בהמתנה לאישור
            </h2>
            <span className="ml-auto text-xs text-muted-foreground">
              {totalPending} פריטים
            </span>
          </div>

          {/* Mobile cards */}
          <ul className="flex flex-col gap-3 p-3 sm:p-4 md:hidden">
            {rows.map((r) => (
              <ApprovalCard key={r.id} row={r} />
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="min-w-[7rem]">מס׳ טיוטה</TableHead>
                  <TableHead className="min-w-[11rem]">ספק</TableHead>
                  <TableHead className="min-w-[10rem]">פרויקט</TableHead>
                  <TableHead className="min-w-[8rem] text-end">
                    סכום ברוטו
                  </TableHead>
                  <TableHead className="min-w-[6rem]">דחיפות</TableHead>
                  <TableHead className="min-w-[6rem]">רמה</TableHead>
                  <TableHead className="min-w-[14rem]">סיבות חריגה</TableHead>
                  <TableHead className="min-w-[8rem]">נוצרה ב-</TableHead>
                  <TableHead className="min-w-[7rem] text-end">פעולה</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const urgency = urgencyBadge(r.urgency)
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm font-semibold text-emerald-700">
                        {r.poNumber}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {r.supplier?.name ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate">
                        {r.project?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-end font-semibold tabular-nums">
                        {formatCurrency(r.totalAmountGross, r.currency)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${urgency.className}`}
                        >
                          {urgency.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                          רמה {r.currentLevel}
                        </span>
                      </TableCell>
                      <TableCell>
                        {r.escalationReasons.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            ללא חריגות
                          </span>
                        ) : (
                          <ul className="space-y-0.5 text-xs text-amber-800">
                            {r.escalationReasons.map((reason, idx) => (
                              <li key={idx} className="flex items-center gap-1">
                                <AlertTriangle
                                  className="size-3 shrink-0"
                                  aria-hidden
                                />
                                {reason}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" aria-hidden />
                          {dateFormatter.format(new Date(r.createdAt))}
                        </span>
                      </TableCell>
                      <TableCell className="text-end">
                        <Link
                          href={`/marker-ofek/procurement/${r.id}?tab=approvals`}
                          className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800 transition-colors hover:bg-indigo-100"
                        >
                          בדוק לאישור
                          <ArrowRight className="size-3 rotate-180" aria-hidden />
                        </Link>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  )
}

// ───────── helpers ─────────

function KpiTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ClipboardCheck
  label: string
  value: string
  tone: "indigo" | "rose" | "emerald"
}) {
  const toneClass =
    tone === "indigo"
      ? "border-indigo-200 bg-indigo-50 text-indigo-800"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-emerald-200 bg-emerald-50 text-emerald-800"
  return (
    <div
      className={`flex min-w-[8rem] items-center gap-2 rounded-xl border px-3 py-2 ${toneClass}`}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider opacity-80">
          {label}
        </p>
        <p className="truncate text-base font-bold tabular-nums">{value}</p>
      </div>
    </div>
  )
}

function ApprovalCard({ row }: { row: ApprovalInboxRowDto }) {
  const urgency = urgencyBadge(row.urgency)
  return (
    <li className="rounded-xl border border-border/60 bg-muted/15 p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-emerald-700">
          {row.poNumber}
        </span>
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${urgency.className}`}
        >
          {urgency.label}
        </span>
      </div>
      <p className="mt-2 text-sm font-medium">{row.supplier?.name ?? "—"}</p>
      <p className="text-xs text-muted-foreground">
        {row.project?.name ?? "—"}
      </p>
      <p className="mt-2 text-lg font-bold tabular-nums">
        {formatCurrency(row.totalAmountGross, row.currency)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        רמה נוכחית: {row.currentLevel} · נוצרה{" "}
        {dateFormatter.format(new Date(row.createdAt))}
      </p>
      {row.escalationReasons.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-amber-800">
          {row.escalationReasons.map((reason, idx) => (
            <li key={idx} className="flex items-center gap-1">
              <AlertTriangle className="size-3 shrink-0" aria-hidden />
              {reason}
            </li>
          ))}
        </ul>
      )}
      <Link
        href={`/marker-ofek/procurement/${row.id}?tab=approvals`}
        className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-800 transition-colors hover:bg-indigo-100"
      >
        בדוק לאישור
        <ArrowRight className="size-3 rotate-180" aria-hidden />
      </Link>
    </li>
  )
}
