"use client"

import Link from "next/link"
import * as React from "react"
import {
  ArrowUpRight,
  ClipboardList,
  Loader2,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react"

import {
  fetchPartnerMetricsDashboard,
  type PartnerMetricsPayload,
  type PartnerProjectRow,
} from "@/lib/marker-ofek/partner-metrics-actions"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

type PartnerMetricsClientProps = {
  /** `/marker-ofek/partner-finance` — extra column, drill-down links, Diamond copy */
  variant?: "metrics" | "partnerFinance"
  /** When set (e.g. from a parent Server Component), skip the first fetch for `filterPartnerId === "all"`. */
  initialPayload?: PartnerMetricsPayload | null
}

export function PartnerMetricsClient({
  variant = "metrics",
  initialPayload = null,
}: PartnerMetricsClientProps) {
  const [loading, setLoading] = React.useState(() => initialPayload == null)
  const [error, setError] = React.useState<string | null>(null)
  const [filterPartnerId, setFilterPartnerId] = React.useState<string | "all">("all")
  const [payload, setPayload] = React.useState<PartnerMetricsPayload | null>(initialPayload ?? null)
  const [detailRow, setDetailRow] = React.useState<PartnerProjectRow | null>(null)
  const seededInitialFetchSkipped = React.useRef(false)
  const initialPayloadRef = React.useRef(initialPayload)

  const isFinance = variant === "partnerFinance"

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    const fp =
      filterPartnerId === "all" ? null : filterPartnerId
    const res = await fetchPartnerMetricsDashboard({
      filterPartnerId: fp,
    })
    if (!res.ok) {
      setError(res.error)
      setPayload(null)
    } else {
      setPayload(res.data)
    }
    setLoading(false)
  }, [filterPartnerId])

  React.useEffect(() => {
    const seed = initialPayloadRef.current
    if (seed && !seededInitialFetchSkipped.current && filterPartnerId === "all") {
      seededInitialFetchSkipped.current = true
      return
    }
    void load()
  }, [load, filterPartnerId])

  const showPartnerFilter = payload?.persona === "ophir" && (payload.partnerOptions?.length ?? 0) > 0

  return (
    <div
      dir="rtl"
      lang="he"
      className="flex w-full flex-col gap-8 text-foreground"
    >
      <header className="space-y-2 text-start">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          דשבורד מוגבל — שותפים בלבד
        </p>
        <h1 className="page-title text-balance md:text-4xl">
          {isFinance ? "מרכז רווחיות שותפים" : "רווחיות ניהול פרויקטים"}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {isFinance ? (
            <>
              רווח נקי = הכנסות (חשבוניות לקוח) פחות חברות ביצוע, שכר משיבוצי גנט, קופה קטנה, עלות אתר
              והזמנות רכש. דמי ניהול בשיעור 25% מחושבים על רווח הנקי.
            </>
          ) : (
            <>
              רווח פרויקט = חשבוניות לקוח (מע״מ) פחות עלויות (קבלנים, שכר מגנט, קופה, אתר, הזמנות רכש).
              בונוס ניהול מוצג ב־25% מסה&quot;כ הרווח.
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            type="button"
            size="sm"
            className="gap-2 border border-indigo-500/35 bg-indigo-600 font-semibold text-white shadow-none hover:bg-indigo-500"
            render={
              <Link href="/marker-ofek/execution/progress-reports/new">
                <Receipt className="size-4 shrink-0" aria-hidden />
                חשבון חלקי (דוח התקדמות)
              </Link>
            }
          />
          {showPartnerFilter ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">סינון שותף</span>
              <Select
                value={filterPartnerId}
                onValueChange={(v) => setFilterPartnerId(v as string | "all")}
              >
                <SelectTrigger className="h-9 w-[220px] border-slate-600 bg-slate-900 text-slate-100">
                  <SelectValue placeholder="כל השותפים" />
                </SelectTrigger>
                <SelectContent className="border-slate-700 bg-slate-900">
                  <SelectItem value="all">כל השותפים</SelectItem>
                  {(payload?.partnerOptions ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
        {payload && (payload.persona === "guy" || payload.persona === "samer") ? (
          <p className="text-xs text-muted-foreground">
            מוצגים פרויקטים המשויכים לחשבונך בלבד (שותף מנהל).
          </p>
        ) : null}
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-500/35 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          טוען נתונים…
        </div>
      ) : payload ? (
        <>
          <section className="grid gap-4 md:grid-cols-2">
            <div className="glass-card p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    סה״כ רווח מנוהל
                  </p>
                  <p className="font-currency-mono mt-2 text-3xl font-semibold text-foreground">
                    {currencyFormatter.format(payload.totalManagedProfit)}
                  </p>
                </div>
                <span className="flex size-11 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-500">
                  <TrendingUp className="size-5 text-emerald-400" aria-hidden />
                </span>
              </div>
            </div>
            <div className="glass-card p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {isFinance ? "דמי ניהול צפויים (25%)" : "בונוס ניהול (25%)"}
                  </p>
                  <p className="font-currency-mono mt-2 text-3xl font-semibold text-indigo-200">
                    {currencyFormatter.format(payload.managementBonus)}
                  </p>
                </div>
                <span className="flex size-11 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-500">
                  <Wallet className="size-5 text-indigo-400" aria-hidden />
                </span>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="section-title text-foreground">פרויקטים</h2>
            <div className="glass-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-right text-muted-foreground">פרויקט</TableHead>
                    <TableHead className="text-right text-muted-foreground">שותף</TableHead>
                    <TableHead className="text-left font-rubik tabular-nums text-muted-foreground">
                      רווח נקי
                    </TableHead>
                    {isFinance ? (
                      <TableHead className="text-left font-rubik tabular-nums text-muted-foreground">
                        דמי ניהול (25%)
                      </TableHead>
                    ) : null}
                    <TableHead className="text-left font-rubik tabular-nums text-muted-foreground">
                      מרווח
                    </TableHead>
                    <TableHead className="w-[160px] text-left text-muted-foreground">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payload.projects.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={isFinance ? 6 : 5}
                        className="text-center text-muted-foreground"
                      >
                        אין פרויקטים מתאימים (בדקו שדה &quot;שותף מנהל&quot; בפרויקט).
                      </TableCell>
                    </TableRow>
                  ) : (
                    payload.projects.map((row) => (
                      <TableRow
                        key={row.projectId}
                        className="border-white/10 transition-colors hover:bg-white/5"
                      >
                        <TableCell className="font-medium text-foreground">
                          <span className="block text-xs text-muted-foreground">{row.code}</span>
                          {row.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{row.managingPartnerLabel}</TableCell>
                        <TableCell
                          className={`font-currency-mono text-left text-sm ${row.profit >= 0 ? "text-emerald-200" : "text-rose-300"}`}
                        >
                          {currencyFormatter.format(row.profit)}
                        </TableCell>
                        {isFinance ? (
                          <TableCell className="font-currency-mono text-left text-sm text-indigo-200">
                            {currencyFormatter.format(row.managementFeeDue)}
                          </TableCell>
                        ) : null}
                        <TableCell className="font-rubik text-left tabular-nums text-muted-foreground">
                          {row.marginPercent != null ? `${row.marginPercent}%` : "—"}
                        </TableCell>
                        <TableCell className="text-left">
                          <div className="flex flex-wrap gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 border-slate-600 bg-slate-900 text-xs text-slate-100"
                              onClick={() => setDetailRow(row)}
                            >
                              פירוט
                            </Button>
                            {isFinance ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 border-indigo-500/40 bg-indigo-950/30 text-xs text-indigo-100"
                                render={
                                  <Link href={`/marker-ofek/partner-finance/${row.projectId}`}>פירוט מלא</Link>
                                }
                              />
                            ) : null}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 border-slate-600 bg-slate-900 text-xs"
                              render={
                                <Link
                                  href={`/marker-ofek/execution/progress-reports/new?projectId=${row.projectId}`}
                                >
                                  חשבון חלקי
                                </Link>
                              }
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs text-indigo-300"
                              render={
                                <Link href={`/marker-ofek/projects/${row.projectId}`}>
                                  <ArrowUpRight className="size-3.5" aria-hidden />
                                  פרויקט
                                </Link>
                              }
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="size-5 text-amber-400" aria-hidden />
              <h2 className="section-title text-foreground">אישור רכש — ממתין למנכ&quot;ל</h2>
            </div>
            {payload.pendingProcurement.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין הזמנות רכש בסטטוס אישור מנכ&quot;ל.</p>
            ) : (
              <div className="glass-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-right text-muted-foreground">הזמנה</TableHead>
                      <TableHead className="text-right text-muted-foreground">פרויקט</TableHead>
                      <TableHead className="text-right text-muted-foreground">ספק</TableHead>
                      <TableHead className="text-left font-rubik tabular-nums text-muted-foreground">
                        סכום
                      </TableHead>
                      <TableHead className="w-[100px] text-left text-muted-foreground">פעולה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payload.pendingProcurement.map((po) => (
                      <TableRow key={po.id} className="border-white/10">
                        <TableCell className="font-rubik text-sm text-foreground">{po.poNumber}</TableCell>
                        <TableCell className="text-muted-foreground">
                          <span className="block text-xs text-muted-foreground/80">{po.projectCode}</span>
                          {po.projectName}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{po.supplierName || "—"}</TableCell>
                        <TableCell className="font-currency-mono text-left text-foreground">
                          {currencyFormatter.format(po.totalAmount)}
                        </TableCell>
                        <TableCell className="text-left">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 border-indigo-500/40 bg-indigo-950/40 text-xs text-indigo-100"
                            render={<Link href={`/marker-ofek/procurement/${po.id}`}>אישור</Link>}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </>
      ) : null}

      <Sheet open={detailRow != null} onOpenChange={(o) => !o && setDetailRow(null)}>
        <SheetContent className="border-slate-100 bg-white text-foreground" dir="rtl">
          <SheetHeader>
            <SheetTitle className="text-start text-foreground">
              {detailRow ? `${detailRow.code} — ${detailRow.name}` : ""}
            </SheetTitle>
          </SheetHeader>
          {detailRow ? (
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
                <dt className="text-muted-foreground">חשבוניות לקוח (מע״מ)</dt>
                <dd className="font-currency-mono font-medium">
                  {currencyFormatter.format(detailRow.totalClientInvoices)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">חברות ביצוע</dt>
                <dd className="font-currency-mono">{currencyFormatter.format(detailRow.subconCosts)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">שכר (גנט / שיבוצים)</dt>
                <dd className="font-currency-mono">{currencyFormatter.format(detailRow.employeeSalaries)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">קופה קטנה</dt>
                <dd className="font-currency-mono">{currencyFormatter.format(detailRow.pettyCash)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">עלות אתר</dt>
                <dd className="font-currency-mono">{currencyFormatter.format(detailRow.siteOverhead)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
                <dt className="text-muted-foreground">הזמנות רכש (לא טיוטה)</dt>
                <dd className="font-currency-mono">{currencyFormatter.format(detailRow.procurementOrders)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
                <dt className="text-muted-foreground">דמי ניהול (25%)</dt>
                <dd className="font-currency-mono text-indigo-300">
                  {currencyFormatter.format(detailRow.managementFeeDue)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 pt-2 text-base font-semibold">
                <dt className="text-foreground">רווח נקי</dt>
                <dd
                  className={
                    detailRow.profit >= 0
                      ? "font-currency-mono text-emerald-300"
                      : "font-currency-mono text-rose-300"
                  }
                >
                  {currencyFormatter.format(detailRow.profit)}
                </dd>
              </div>
              <p className="pt-2 text-xs leading-relaxed text-muted-foreground">
                שכר מחושב משיבוצי משאבים בגנט. חברות ביצוע, קופה ועלות אתר נשמרים בשדות הפרויקט
                (ניתן לעדכן בדף &quot;פירוט מלא&quot; בנתיב /marker-ofek/partner-finance).
              </p>
            </dl>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
