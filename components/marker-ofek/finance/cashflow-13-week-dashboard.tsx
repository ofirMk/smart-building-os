"use client"

import { useMemo } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { CashflowForecastRow } from "@/lib/marker-ofek/finance/t6-ar-ap-actions"

const FMT = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

function fmt(n: number): string {
  return FMT.format(n)
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}

export function Cashflow13WeekDashboard({
  companyId: _companyId,
  rows,
}: {
  companyId: string
  rows: CashflowForecastRow[]
}) {
  const totals = useMemo(() => {
    const arSum = rows.reduce((s, r) => s + r.arInflowPlanned, 0)
    const apSum = rows.reduce((s, r) => s + r.apOutflowPlanned, 0)
    return {
      arSum,
      apSum,
      netSum: arSum - apSum,
      opening: rows[0]?.openingBalance ?? 0,
      closing: rows[rows.length - 1]?.closingBalance ?? 0,
      minClosing: rows.length
        ? rows.reduce((m, r) => Math.min(m, r.closingBalance), Number.POSITIVE_INFINITY)
        : 0,
    }
  }, [rows])

  const hasNegative = totals.minClosing < 0

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">תזרים מזומנים — 13 שבועות</h1>
          <p className="text-sm text-muted-foreground">
            תחזית מתגלגלת מבוססת חשבונות חלקיות מאושרות (AR) וחשבוניות ספק מאושרות (AP) שטרם שולמו.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="יתרת פתיחה" value={fmt(totals.opening)} tone="muted" />
        <KpiCard label="תקבולי AR מתוכננים" value={fmt(totals.arSum)} tone="positive" />
        <KpiCard label="תשלומי AP מתוכננים" value={fmt(totals.apSum)} tone="negative" />
        <KpiCard
          label="זרימת מזומנים נטו"
          value={fmt(totals.netSum)}
          tone={totals.netSum >= 0 ? "positive" : "negative"}
        />
        <KpiCard
          label="יתרת סגירה (13 ש׳)"
          value={fmt(totals.closing)}
          tone={totals.closing >= 0 ? "positive" : "negative"}
        />
      </div>

      {hasNegative ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">
          ⚠️ קיים שבוע עם יתרת סגירה שלילית ({fmt(totals.minClosing)}). מומלץ לתעדף תקבולי AR או לדחות תשלומי AP.
        </div>
      ) : null}

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">פריסה שבועית</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 text-right">שבוע</TableHead>
                  <TableHead>תקופה</TableHead>
                  <TableHead className="text-end">יתרת פתיחה</TableHead>
                  <TableHead className="text-end">AR נכנס</TableHead>
                  <TableHead className="text-end">AP יוצא</TableHead>
                  <TableHead className="text-end">נטו</TableHead>
                  <TableHead className="text-end">יתרת סגירה</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.weekIndex} className="transition-colors hover:bg-muted/40">
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      W{r.weekIndex + 1}
                    </TableCell>
                    <TableCell className="text-sm">
                      {shortDate(r.weekStart)}–{shortDate(r.weekEnd)}
                    </TableCell>
                    <TableCell className="text-end font-mono text-sm">
                      {fmt(r.openingBalance)}
                    </TableCell>
                    <TableCell className="text-end font-mono text-sm text-emerald-600 dark:text-emerald-400">
                      {fmt(r.arInflowPlanned)}
                    </TableCell>
                    <TableCell className="text-end font-mono text-sm text-rose-600 dark:text-rose-400">
                      {fmt(r.apOutflowPlanned)}
                    </TableCell>
                    <TableCell
                      className={`text-end font-mono text-sm ${
                        r.netFlow >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {fmt(r.netFlow)}
                    </TableCell>
                    <TableCell
                      className={`text-end font-mono text-sm font-semibold ${
                        r.closingBalance >= 0 ? "text-foreground" : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {fmt(r.closingBalance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "muted" | "positive" | "negative"
}) {
  const toneCls =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
        ? "text-rose-600 dark:text-rose-400"
        : "text-foreground"
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`font-mono text-lg font-semibold ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
  )
}
