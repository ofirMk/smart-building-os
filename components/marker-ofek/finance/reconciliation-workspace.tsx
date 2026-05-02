"use client"

/**
 * Phase 8.3 Step 2 — Reconciliation Workspace (3-Way Match dashboard)
 *
 * זה ה-Cockpit של מנהל הכספים. שתי שכבות (לא split-pane):
 *
 *   שלב א' — **רשימת חשבוניות פתוחות**: כל מה שלא APPROVED / READY_FOR_PAYMENT
 *   / CANCELLED. עמודות פעילות לזיהוי מהיר: סטטוס (badge צבעוני),
 *   variance count, השפעה כספית. לחיצה על שורה → drill-in.
 *
 *   שלב ב' — **מסך התאמה לחשבונית**: header + טבלת match per line + actions:
 *     • "הרץ התאמה מחדש" → POST /recompute-match → ה-RPC
 *       erp_perform_3way_match (idempotent).
 *     • "אשר חריגות" → דיאלוג עם הערה אופציונלית → POST /approve
 *       → status = APPROVED (SOX-locked, ה-RPC לא יחזיר אחורה).
 *     • "← חזרה לרשימה" — drill-out.
 *
 * אין preview pane אינליין. דפוס "wizard" כמו ב-Goods Receipt workspace,
 * שעבד טוב בסקירת UX הקודמת.
 */

import * as React from "react"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  PlayCircle,
  Receipt,
  RefreshCw,
  Scale,
  ShieldCheck,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { readActiveCompanyIdFromCookie } from "@/lib/company-context"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn } from "@/lib/utils"
import type {
  ErpInvoiceMatchLineStatus,
  ErpPerform3WayMatchResult,
  ErpVendorInvoiceStatus,
} from "@/types/erp"

// ─────────────────────────────────────────────────────────────────────────────
// DTOs (mirror של ה-API)
// ─────────────────────────────────────────────────────────────────────────────

type PendingMatchInvoiceDto = {
  id: string
  invoiceNumber: string
  status: ErpVendorInvoiceStatus
  invoiceDate: string | null
  totalAmount: number
  priceVarianceAmount: number
  supplierName: string | null
  purchaseOrderId: string | null
  poNumber: string | null
  officialPoNumber: string | null
  totalInvoiceLines: number
  matchedLines: number
  perfectLines: number
  varianceLines: number
  unmatchedLines: number
  varianceImpactValue: number
  needsFirstMatch: boolean
}

type MatchDetailLineDto = {
  invoiceLineId: string
  description: string
  invoiceQty: number
  invoiceUnitPrice: number
  invoiceLineTotal: number
  match: {
    matchId: string
    matchStatus: ErpInvoiceMatchLineStatus
    poLineId: string
    poDescription: string | null
    poOrderedQty: number
    poUnitPrice: number
    grLineId: string | null
    grReceivedQty: number
    qtyDiff: number
    priceDiff: number
    priceImpactValue: number
    notes: string | null
  } | null
}

type MatchDetailDto = {
  id: string
  invoiceNumber: string
  status: ErpVendorInvoiceStatus
  invoiceDate: string | null
  totalAmount: number
  priceVarianceAmount: number
  notes: string | null
  supplier: { id: string; name: string } | null
  purchaseOrder: {
    id: string
    poNumber: string
    officialPoNumber: string | null
    status: string
  } | null
  goodsReceipt: { id: string; grNumber: string; status: string } | null
  lines: MatchDetailLineDto[]
  summary: {
    totalLines: number
    matchedLines: number
    perfectLines: number
    qtyVarianceLines: number
    priceVarianceLines: number
    mixedVarianceLines: number
    unmatchedLines: number
    totalQtyDiff: number
    totalPriceImpactValue: number
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const numberFormatter = new Intl.NumberFormat("he-IL", {
  maximumFractionDigits: 3,
})

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" })

function formatInvoiceStatus(status: ErpVendorInvoiceStatus): string {
  switch (status) {
    case "DRAFT":
      return "טיוטה"
    case "NEW":
      return "חדשה"
    case "MATCHED":
      return "תואמת"
    case "HAS_VARIANCES":
      return "חריגות"
    case "APPROVED":
      return "מאושרת"
    case "READY_FOR_PAYMENT":
      return "לתשלום"
    case "FINAL":
      return "סגורה"
    case "CANCELLED":
      return "מבוטלת"
    default:
      return status
  }
}

function invoiceStatusBadgeClass(status: ErpVendorInvoiceStatus): string {
  switch (status) {
    case "MATCHED":
      return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
    case "HAS_VARIANCES":
      return "bg-rose-500/15 text-rose-800 border-rose-500/30"
    case "APPROVED":
      return "bg-sky-500/15 text-sky-700 border-sky-500/30"
    case "READY_FOR_PAYMENT":
      return "bg-indigo-500/15 text-indigo-700 border-indigo-500/30"
    case "CANCELLED":
      return "bg-slate-500/15 text-slate-500 border-slate-500/30"
    default:
      return "bg-amber-500/15 text-amber-800 border-amber-500/30"
  }
}

function formatMatchStatus(status: ErpInvoiceMatchLineStatus): string {
  switch (status) {
    case "PERFECT":
      return "תואם"
    case "QTY_VARIANCE":
      return "סטיית כמות"
    case "PRICE_VARIANCE":
      return "סטיית מחיר"
    case "MIXED_VARIANCE":
      return "מחיר וכמות"
  }
}

function matchStatusBadgeClass(status: ErpInvoiceMatchLineStatus): string {
  switch (status) {
    case "PERFECT":
      return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
    case "QTY_VARIANCE":
      return "bg-amber-500/15 text-amber-800 border-amber-500/30"
    case "PRICE_VARIANCE":
      return "bg-orange-500/15 text-orange-800 border-orange-500/30"
    case "MIXED_VARIANCE":
      return "bg-rose-500/15 text-rose-800 border-rose-500/30"
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ReconciliationWorkspace() {
  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [invoices, setInvoices] = React.useState<
    PendingMatchInvoiceDto[] | null
  >(null)
  const [listError, setListError] = React.useState<string | null>(null)
  const [loadingList, setLoadingList] = React.useState(false)

  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  React.useEffect(() => {
    setCompanyId(readActiveCompanyIdFromCookie())
  }, [])

  const loadList = React.useCallback(async () => {
    setLoadingList(true)
    setListError(null)
    try {
      const data = await masterDataFetch<PendingMatchInvoiceDto[]>(
        "/api/finance/invoices/pending-match",
      )
      setInvoices(data)
    } catch (e: unknown) {
      setListError(e instanceof Error ? e.message : "טעינת רשימה נכשלה")
    } finally {
      setLoadingList(false)
    }
  }, [])

  React.useEffect(() => {
    if (!companyId) return
    void loadList()
  }, [companyId, loadList])

  // KPIs ברמת הרשימה
  const kpis = React.useMemo(() => {
    if (!invoices) {
      return {
        total: 0,
        matched: 0,
        variances: 0,
        needsFirst: 0,
        impact: 0,
      }
    }
    let matched = 0,
      variances = 0,
      needsFirst = 0,
      impact = 0
    for (const inv of invoices) {
      if (inv.status === "MATCHED") matched += 1
      if (inv.status === "HAS_VARIANCES") variances += 1
      if (inv.needsFirstMatch) needsFirst += 1
      impact += inv.varianceImpactValue
    }
    return {
      total: invoices.length,
      matched,
      variances,
      needsFirst,
      impact: Math.round(impact * 100) / 100,
    }
  }, [invoices])

  if (!companyId) {
    return <LoadingBanner>טוען הקשר חברה פעילה…</LoadingBanner>
  }

  if (selectedId) {
    return (
      <ReconciliationDetailScreen
        invoiceId={selectedId}
        onBack={() => {
          setSelectedId(null)
          void loadList()
        }}
      />
    )
  }

  return (
    <div dir="rtl" className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-2">
            <Scale className="size-5 text-indigo-700" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              התאמת חשבוניות (3-Way Match)
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Phase 8.3 — בקרת חשבוניות ספק מול הזמנת רכש ותעודת קבלה.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={loadList}
          disabled={loadingList}
          className="gap-2"
        >
          <RefreshCw
            className={cn("size-4", loadingList && "animate-spin")}
            aria-hidden
          />
          רענן
        </Button>
      </header>

      <section
        aria-label="סיכום מצב חשבוניות"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
      >
        <KpiCard
          title="פתוחות"
          value={`${kpis.total}`}
          hint="כל החשבוניות שעוד לא אושרו"
        />
        <KpiCard
          title="תואמות"
          value={`${kpis.matched}`}
          hint={kpis.matched > 0 ? "מוכנות לאישור" : "אין מועמדות"}
          tone="success"
        />
        <KpiCard
          title="עם חריגות"
          value={`${kpis.variances}`}
          hint={
            kpis.variances > 0 ? "דרוש אישור מודע למנהל" : "אין חריגות פתוחות"
          }
          tone={kpis.variances > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          title="טרם הורצו"
          value={`${kpis.needsFirst}`}
          hint={kpis.needsFirst > 0 ? "דרוש 'הרץ התאמה'" : "כולן הורצו"}
          tone={kpis.needsFirst > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          title="השפעה כספית"
          value={currencyFormatter.format(kpis.impact)}
          hint="סטיות מצטברות (Δ מחיר × כמות חשבונית)"
          tone={Math.abs(kpis.impact) > 0 ? "warning" : "neutral"}
        />
      </section>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader>
          <CardTitle className="text-base">חשבוניות ממתינות להתאמה</CardTitle>
          <CardDescription>
            לחץ על שורה כדי לפתוח את מסך ההתאמה המלא.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          {listError ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-800">
              {listError}
            </div>
          ) : null}

          {loadingList ? (
            <LoadingBanner>טוען חשבוניות…</LoadingBanner>
          ) : invoices && invoices.length === 0 ? (
            <EmptyInbox />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[12%]">מס׳ חשבונית</TableHead>
                    <TableHead className="w-[10%]">סטטוס</TableHead>
                    <TableHead className="w-[18%]">ספק</TableHead>
                    <TableHead className="w-[12%]">PO</TableHead>
                    <TableHead className="w-[10%]">תאריך</TableHead>
                    <TableHead className="w-[10%] text-end">סכום</TableHead>
                    <TableHead className="w-[10%] text-center">שורות</TableHead>
                    <TableHead className="w-[10%] text-center">חריגות</TableHead>
                    <TableHead className="w-[12%] text-end">השפעה ₪</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(invoices ?? []).map((inv) => (
                    <TableRow
                      key={inv.id}
                      onClick={() => setSelectedId(inv.id)}
                      className="cursor-pointer transition-colors hover:bg-accent/50"
                    >
                      <TableCell className="font-mono text-xs" dir="ltr">
                        {inv.invoiceNumber}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={invoiceStatusBadgeClass(inv.status)}
                        >
                          {formatInvoiceStatus(inv.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {inv.supplierName ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-[11px]" dir="ltr">
                        {inv.officialPoNumber ?? inv.poNumber ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {inv.invoiceDate
                          ? dateFormatter.format(new Date(inv.invoiceDate))
                          : "—"}
                      </TableCell>
                      <TableCell className="text-end font-medium tabular-nums">
                        {currencyFormatter.format(inv.totalAmount)}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        <span className="text-muted-foreground">
                          {inv.matchedLines}/{inv.totalInvoiceLines}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {inv.needsFirstMatch ? (
                          <span className="text-xs text-amber-700">לא הורצה</span>
                        ) : inv.varianceLines > 0 ? (
                          <Badge
                            variant="outline"
                            className="border-rose-500/30 bg-rose-500/10 text-rose-800"
                          >
                            {inv.varianceLines}
                          </Badge>
                        ) : (
                          <CheckCircle2
                            className="mx-auto size-4 text-emerald-600"
                            aria-label="ללא חריגות"
                          />
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-end font-mono text-xs tabular-nums",
                          Math.abs(inv.varianceImpactValue) > 0
                            ? inv.varianceImpactValue > 0
                              ? "text-rose-700"
                              : "text-emerald-700"
                            : "text-muted-foreground",
                        )}
                      >
                        {Math.abs(inv.varianceImpactValue) > 0
                          ? currencyFormatter.format(inv.varianceImpactValue)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail screen
// ─────────────────────────────────────────────────────────────────────────────

function ReconciliationDetailScreen({
  invoiceId,
  onBack,
}: {
  invoiceId: string
  onBack: () => void
}) {
  const [detail, setDetail] = React.useState<MatchDetailDto | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [recomputing, setRecomputing] = React.useState(false)
  const [approveOpen, setApproveOpen] = React.useState(false)
  const [approveNote, setApproveNote] = React.useState("")
  const [approving, setApproving] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await masterDataFetch<MatchDetailDto>(
        `/api/finance/invoices/${encodeURIComponent(invoiceId)}/match-detail`,
      )
      setDetail(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "טעינת פרטים נכשלה")
    } finally {
      setLoading(false)
    }
  }, [invoiceId])

  React.useEffect(() => {
    void load()
  }, [load])

  const handleRecompute = React.useCallback(async () => {
    setRecomputing(true)
    try {
      const companyIdFromCookie = readActiveCompanyIdFromCookie()
      const res = await fetch(
        `/api/finance/invoices/${encodeURIComponent(invoiceId)}/recompute-match`,
        {
          method: "POST",
          headers: {
            ...(companyIdFromCookie
              ? { "x-active-company-id": companyIdFromCookie }
              : {}),
          },
          credentials: "same-origin",
        },
      )
      const body = (await res.json().catch(() => null)) as {
        data?: ErpPerform3WayMatchResult
        error?: string
      } | null
      if (!res.ok || !body?.data) {
        throw new Error(body?.error ?? `שגיאה ${res.status}`)
      }
      const r = body.data
      const totalIssues =
        r.qtyVarianceLines + r.priceVarianceLines + r.mixedVarianceLines
      if (totalIssues === 0 && r.matchedLines > 0) {
        toast.success(
          `התאמה בוצעה — כל ${r.matchedLines} השורות תואמות (${r.newInvoiceStatus}).`,
        )
      } else if (totalIssues > 0) {
        toast.warning(
          `התאמה בוצעה — ${totalIssues} שורות עם חריגות (${r.newInvoiceStatus}).`,
        )
      } else {
        toast(
          `התאמה הורצה אך לא נמצאו שורות עם קישור ל-PO (${r.unmatchedLines} unmatched).`,
        )
      }
      await load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "הרצת התאמה נכשלה")
    } finally {
      setRecomputing(false)
    }
  }, [invoiceId, load])

  const handleApprove = React.useCallback(async () => {
    setApproving(true)
    try {
      const companyIdFromCookie = readActiveCompanyIdFromCookie()
      const res = await fetch(
        `/api/finance/invoices/${encodeURIComponent(invoiceId)}/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(companyIdFromCookie
              ? { "x-active-company-id": companyIdFromCookie }
              : {}),
          },
          credentials: "same-origin",
          body: JSON.stringify({ approvalNote: approveNote.trim() || null }),
        },
      )
      const body = (await res.json().catch(() => null)) as {
        data?: { invoiceId: string; previousStatus: string; newStatus: string }
        error?: string
      } | null
      if (!res.ok || !body?.data) {
        throw new Error(body?.error ?? `שגיאה ${res.status}`)
      }
      toast.success("החשבונית אושרה לתשלום.")
      setApproveOpen(false)
      setApproveNote("")
      await load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "אישור נכשל")
    } finally {
      setApproving(false)
    }
  }, [approveNote, invoiceId, load])

  if (loading || !detail) {
    return (
      <div dir="rtl" className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="self-start gap-2"
        >
          <ArrowRight className="size-4" aria-hidden />
          חזרה לרשימה
        </Button>
        {error ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-800">
            {error}
          </div>
        ) : (
          <LoadingBanner>טוען פרטי חשבונית…</LoadingBanner>
        )}
      </div>
    )
  }

  const isApprovable =
    detail.status === "MATCHED" || detail.status === "HAS_VARIANCES"
  const alreadyApproved =
    detail.status === "APPROVED" || detail.status === "READY_FOR_PAYMENT"

  return (
    <div dir="rtl" className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      {/* Top nav */}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="gap-2"
        >
          <ArrowRight className="size-4" aria-hidden />
          חזרה לרשימה
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleRecompute}
            disabled={recomputing}
            className="gap-2"
          >
            {recomputing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <PlayCircle className="size-4" aria-hidden />
            )}
            הרץ התאמה מחדש
          </Button>
          <Button
            type="button"
            onClick={() => setApproveOpen(true)}
            disabled={!isApprovable || alreadyApproved}
            className="gap-2"
            title={
              alreadyApproved
                ? "כבר אושרה"
                : !isApprovable
                  ? "הרץ קודם 'הרץ התאמה'"
                  : undefined
            }
          >
            <ShieldCheck className="size-4" aria-hidden />
            {detail.status === "HAS_VARIANCES"
              ? "אשר חריגות"
              : "אשר לתשלום"}
          </Button>
        </div>
      </div>

      {/* Header summary */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Receipt className="size-5 text-indigo-700" aria-hidden />
            <div>
              <CardTitle className="text-lg">
                חשבונית{" "}
                <span className="font-mono" dir="ltr">
                  {detail.invoiceNumber}
                </span>
              </CardTitle>
              <CardDescription className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {detail.supplier ? (
                  <span>
                    ספק: <b>{detail.supplier.name}</b>
                  </span>
                ) : null}
                {detail.purchaseOrder ? (
                  <span>
                    PO:{" "}
                    <b className="font-mono" dir="ltr">
                      {detail.purchaseOrder.officialPoNumber ??
                        detail.purchaseOrder.poNumber}
                    </b>
                  </span>
                ) : (
                  <span className="text-rose-700">אין PO מקושר</span>
                )}
                {detail.goodsReceipt ? (
                  <span>
                    GR:{" "}
                    <b className="font-mono" dir="ltr">
                      {detail.goodsReceipt.grNumber}
                    </b>
                  </span>
                ) : null}
                {detail.invoiceDate ? (
                  <span>
                    תאריך:{" "}
                    <b>
                      {dateFormatter.format(new Date(detail.invoiceDate))}
                    </b>
                  </span>
                ) : null}
                <span>
                  סכום:{" "}
                  <b className="font-mono" dir="ltr">
                    {currencyFormatter.format(detail.totalAmount)}
                  </b>
                </span>
              </CardDescription>
            </div>
          </div>
          <Badge
            variant="outline"
            className={invoiceStatusBadgeClass(detail.status)}
          >
            {formatInvoiceStatus(detail.status)}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <MiniKpi
              label="סך שורות"
              value={`${detail.summary.totalLines}`}
            />
            <MiniKpi
              label="הותאמו"
              value={`${detail.summary.matchedLines}`}
              tone={
                detail.summary.matchedLines === detail.summary.totalLines
                  ? "success"
                  : "warning"
              }
            />
            <MiniKpi
              label="תואמות"
              value={`${detail.summary.perfectLines}`}
              tone="success"
            />
            <MiniKpi
              label="סטיית כמות"
              value={`${detail.summary.qtyVarianceLines}`}
              tone={
                detail.summary.qtyVarianceLines > 0 ? "warning" : "neutral"
              }
            />
            <MiniKpi
              label="סטיית מחיר"
              value={`${detail.summary.priceVarianceLines}`}
              tone={
                detail.summary.priceVarianceLines > 0 ? "warning" : "neutral"
              }
            />
            <MiniKpi
              label="מעורב"
              value={`${detail.summary.mixedVarianceLines}`}
              tone={
                detail.summary.mixedVarianceLines > 0 ? "danger" : "neutral"
              }
            />
            <MiniKpi
              label="השפעה ₪"
              value={currencyFormatter.format(
                detail.summary.totalPriceImpactValue,
              )}
              tone={
                Math.abs(detail.summary.totalPriceImpactValue) > 0
                  ? "warning"
                  : "neutral"
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Lines table */}
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader>
          <CardTitle className="text-base">פירוט שורות</CardTitle>
          <CardDescription>
            כל שורת חשבונית מול שורת ה-PO וכמות שנקלטה ב-GR.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>תיאור</TableHead>
                <TableHead className="w-[10%] text-center">
                  כמות חשבונית
                </TableHead>
                <TableHead className="w-[10%] text-center">
                  כמות שנקלטה
                </TableHead>
                <TableHead className="w-[10%] text-center">Δ כמות</TableHead>
                <TableHead className="w-[10%] text-center">
                  מחיר חשבונית
                </TableHead>
                <TableHead className="w-[10%] text-center">מחיר PO</TableHead>
                <TableHead className="w-[10%] text-center">Δ מחיר</TableHead>
                <TableHead className="w-[10%] text-end">השפעה ₪</TableHead>
                <TableHead className="w-[10%]">תוצאת התאמה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.lines.map((line) => (
                <TableRow key={line.invoiceLineId}>
                  <TableCell className="text-sm">
                    <div>{line.description}</div>
                    {line.match?.poDescription &&
                    line.match.poDescription !== line.description ? (
                      <div className="text-[11px] text-muted-foreground">
                        PO: {line.match.poDescription}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {numberFormatter.format(line.invoiceQty)}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {line.match
                      ? numberFormatter.format(line.match.grReceivedQty)
                      : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-center tabular-nums",
                      line.match && Math.abs(line.match.qtyDiff) > 0.001
                        ? line.match.qtyDiff > 0
                          ? "text-rose-700"
                          : "text-amber-700"
                        : "text-muted-foreground",
                    )}
                  >
                    {line.match
                      ? line.match.qtyDiff > 0
                        ? `+${numberFormatter.format(line.match.qtyDiff)}`
                        : numberFormatter.format(line.match.qtyDiff)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs tabular-nums">
                    {currencyFormatter.format(line.invoiceUnitPrice)}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs tabular-nums">
                    {line.match
                      ? currencyFormatter.format(line.match.poUnitPrice)
                      : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-center font-mono text-xs tabular-nums",
                      line.match && Math.abs(line.match.priceDiff) > 0.005
                        ? line.match.priceDiff > 0
                          ? "text-rose-700"
                          : "text-emerald-700"
                        : "text-muted-foreground",
                    )}
                  >
                    {line.match
                      ? line.match.priceDiff > 0
                        ? `+${currencyFormatter.format(line.match.priceDiff)}`
                        : currencyFormatter.format(line.match.priceDiff)
                      : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-end font-mono text-xs tabular-nums",
                      line.match && Math.abs(line.match.priceImpactValue) > 0
                        ? line.match.priceImpactValue > 0
                          ? "text-rose-700"
                          : "text-emerald-700"
                        : "text-muted-foreground",
                    )}
                  >
                    {line.match && Math.abs(line.match.priceImpactValue) > 0
                      ? currencyFormatter.format(line.match.priceImpactValue)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {line.match ? (
                      <Badge
                        variant="outline"
                        className={matchStatusBadgeClass(
                          line.match.matchStatus,
                        )}
                      >
                        {formatMatchStatus(line.match.matchStatus)}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-slate-300 bg-slate-50 text-slate-600"
                      >
                        <XCircle className="me-1 size-3" aria-hidden />
                        ללא PO
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {detail.lines.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-8 text-center text-muted-foreground"
                  >
                    אין שורות בחשבונית.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Approve dialog */}
      <Dialog
        open={approveOpen}
        onOpenChange={(open) => {
          if (!approving) setApproveOpen(open)
        }}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-emerald-700" aria-hidden />
              {detail.status === "HAS_VARIANCES"
                ? "אישור חריגות במודע"
                : "אישור חשבונית לתשלום"}
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              {detail.status === "HAS_VARIANCES" ? (
                <>
                  לחשבונית זו יש{" "}
                  <b>
                    {detail.summary.qtyVarianceLines +
                      detail.summary.priceVarianceLines +
                      detail.summary.mixedVarianceLines}{" "}
                    שורות עם חריגות
                  </b>{" "}
                  בהשפעה כספית של{" "}
                  <b className="font-mono" dir="ltr">
                    {currencyFormatter.format(
                      detail.summary.totalPriceImpactValue,
                    )}
                  </b>
                  . אישור יסמן את החשבונית כמאושרת לתשלום ולא ניתן יהיה להריץ
                  עליה התאמה מחדש.
                </>
              ) : (
                "החשבונית תסומן כמאושרת לתשלום. ניתן להוסיף הערה לתיעוד."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="approve-note">הערת אישור (רשות)</Label>
            <Textarea
              id="approve-note"
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
              placeholder="למשל: סטיית מחיר אושרה ע״י סמנכ״ל הכספים בעקבות עליית מחירים בשוק."
              maxLength={1000}
              rows={3}
              disabled={approving}
            />
          </div>
          <DialogFooter className="flex-row-reverse gap-2 sm:flex-row-reverse">
            <Button
              type="button"
              onClick={handleApprove}
              disabled={approving}
              className="gap-2"
            >
              {approving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <ShieldCheck className="size-4" aria-hidden />
              )}
              אשר ונעל
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setApproveOpen(false)}
              disabled={approving}
            >
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Small UI helpers
// ─────────────────────────────────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  hint,
  tone = "neutral",
}: {
  title: string
  value: string
  hint?: string
  tone?: "neutral" | "success" | "warning"
}) {
  const valueTone =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warning"
        ? "text-amber-700"
        : "text-foreground"
  return (
    <Card>
      <CardHeader className="px-3 pb-1 pt-2">
        <CardTitle className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5 px-3 pb-2">
        <p className={cn("text-lg font-semibold tracking-tight", valueTone)}>
          {value}
        </p>
        {hint ? (
          <p className="line-clamp-1 text-[10px] leading-tight text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function MiniKpi({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: string
  tone?: "neutral" | "success" | "warning" | "danger"
}) {
  const valueTone =
    tone === "success"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-amber-800"
        : tone === "danger"
          ? "text-rose-700"
          : "text-foreground"
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("text-base font-semibold tabular-nums", valueTone)}>
        {value}
      </div>
    </div>
  )
}

function LoadingBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {children}
    </div>
  )
}

function EmptyInbox() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
      <div className="rounded-full bg-emerald-500/10 p-3">
        <ClipboardCheck className="size-6 text-emerald-700" aria-hidden />
      </div>
      <div className="text-sm font-medium">
        אין כרגע חשבוניות פתוחות להתאמה
      </div>
      <div className="text-xs text-muted-foreground">
        כשיגיעו חשבוניות חדשות מספקים, הן יופיעו כאן באופן אוטומטי.
      </div>
    </div>
  )
}

// silence unused-import warnings (kept intentionally for future refinement)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _alertTouch = AlertTriangle
