"use client"

/**
 * Procurement Order — Detail Page (Phase 7.13.1.A)
 *
 * מסך פרט המוקבל ל-PO Form של Priority: 6 טאבים החושפים את כל ה-governance
 * שיושב בשרת מ-Phases 7.4-7.8.
 *
 *   1. כללי — header, status badges, summary, notes, body_html (read).
 *   2. שורות — טבלה מורחבת עם כל שדות ה-7.4 enrichment (read-only).
 *   3. מחירים חכמים — multi-source price comparison (PoSmartPricingTab).
 *   4. קבצים — upload + list של PO attachments (PoAttachmentsTab).
 *   5. תהליך אישור — chain timeline + submit/decide actions (PoApprovalsTab).
 *   6. היסטוריה — change log + revisions + snapshot dialog (PoHistoryTab).
 *
 * הנתון מובא דרך `/api/procurement/orders/[id]` — נקודת קצה אחת ל-header
 * + lines + supplier + project. Sub-resources (attachments / approvals /
 * history) חיים בנקודות-קצה אחיות, נטענים ע"י הטאבים בעצמם.
 */

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  Calendar,
  CircleDollarSign,
  ClipboardList,
  FileSignature,
  FileStack,
  History,
  Loader2,
  PackageSearch,
  Sparkles,
  TrendingUp,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PoApprovalsTab } from "@/components/marker-ofek/procurement/po-approvals-tab"
import { PoAttachmentsTab } from "@/components/marker-ofek/procurement/po-attachments-tab"
import { PoHistoryTab } from "@/components/marker-ofek/procurement/po-history-tab"
import {
  PoSmartPricingTab,
  type SmartPricingLineInput,
} from "@/components/marker-ofek/procurement/po-smart-pricing-tab"
import { readActiveCompanyIdFromCookie } from "@/lib/company-context"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn } from "@/lib/utils"

// ============================================================================
// DTOs (mirror של ה-API; נשמר כאן כדי להימנע מ-import מ-route handler)
// ============================================================================

type ProcurementOrderDetailLineDto = {
  id: string
  itemId: string | null
  itemSku: string | null
  itemNumber: string | null
  description: string
  quantity: number
  unitPrice: number
  totalPrice: number
  discountPct: number
  lineCurrency: string | null
  exchangeRate: number | null
  budgetSubChapter: string | null
  resourceId: string | null
  supplyDate: string | null
  manufacturerName: string | null
  lineNotes: string | null
  priceSource: string | null
  priceDeviationPct: number | null
  requiresEscalation: boolean
  escalationCategory: string | null
  escalationJustification: string | null
  alternativeSupplierId: string | null
  alternativeUnitPrice: number | null
  alternativeLeadTimeDays: number | null
}

type ProcurementOrderDetailDto = {
  id: string
  poNumber: string
  title: string
  status: string
  notes: string | null
  createdAt: string
  issuedAt: string | null
  currency: string
  totalAmount: number
  totalAmountNet: number
  vatAmount: number
  totalAmountGross: number
  urgencyLevel: string
  urgencyJustification: string | null
  aiNegotiationStatus: string | null
  aiNegotiationLog: unknown
  poTotalDeviationPct: number | null
  requiresPoEscalation: boolean
  bodyHtml: string | null
  bodyHtmlEnglish: string | null
  supplier: {
    id: string
    name: string
    supplierNum: string | null
  } | null
  project: {
    id: string
    projectNumber: string | null
    name: string | null
  } | null
  lines: ProcurementOrderDetailLineDto[]
}

// ============================================================================
// Constants — UI translation
// ============================================================================

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "טיוטה",
  PENDING_APPROVAL: "ממתין לאישור",
  APPROVED: "מאושר",
  ISSUED: "הוצא",
  CANCELLED: "מבוטל",
  CLOSED: "סגור",
  PENDING_PRICE_APPROVAL: "ממתין לאישור מחיר",
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  DRAFT: "bg-slate-500/15 text-slate-700 border-slate-500/30",
  PENDING_APPROVAL: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  APPROVED: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  ISSUED: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  CANCELLED: "bg-rose-500/15 text-rose-700 border-rose-500/30",
  CLOSED: "bg-zinc-500/15 text-zinc-700 border-zinc-500/30",
  PENDING_PRICE_APPROVAL: "bg-orange-500/15 text-orange-700 border-orange-500/30",
}

const URGENCY_LABEL: Record<string, string> = {
  NORMAL: "רגילה",
  HIGH: "גבוהה",
  CRITICAL: "קריטית",
}

const URGENCY_BADGE_CLASS: Record<string, string> = {
  NORMAL: "bg-slate-500/10 text-slate-700 border-slate-500/30",
  HIGH: "bg-orange-500/15 text-orange-800 border-orange-500/30",
  CRITICAL: "bg-rose-500/15 text-rose-800 border-rose-500/30",
}

const ESCALATION_CATEGORY_LABEL: Record<string, string> = {
  BUSINESS_RELATIONSHIP: "מערכת יחסים",
  QUALITY: "איכות",
  AVAILABILITY: "זמינות",
  LEAD_TIME: "זמן אספקה",
  OTHER: "אחר",
}

const PRICE_SOURCE_LABEL: Record<string, string> = {
  MANUAL: "ידני",
  PRICELIST: "מחירון",
  LAST_PURCHASE: "רכישה אחרונה",
  AI_SUGGESTED: "AI",
  CONTRACTUAL: "חוזה",
}

const numberFormatter = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "medium",
})

const dateTimeFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "medium",
  timeStyle: "short",
})

function formatDate(value: string | null): string {
  if (!value) return "—"
  try {
    return dateFormatter.format(new Date(value))
  } catch {
    return value
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return "—"
  try {
    return dateTimeFormatter.format(new Date(value))
  } catch {
    return value
  }
}

// ============================================================================
// Page
// ============================================================================

export default function ProcurementOrderDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [data, setData] = React.useState<ProcurementOrderDetailDto | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  // טעינה ראשונית — ניתן ל-refetch בעת פעולה (אישור, הוספת קובץ).
  const refetch = React.useCallback(async () => {
    if (!id) return
    setLoading(true)
    setErrorMessage(null)
    try {
      const result = await masterDataFetch<ProcurementOrderDetailDto>(
        `/api/procurement/orders/${encodeURIComponent(id)}`
      )
      setData(result)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "טעינת פרטי הזמנת רכש נכשלה"
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    void refetch()
  }, [refetch])

  if (loading && !data) {
    return (
      <div dir="rtl" className="flex h-full items-center justify-center">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          טוען הזמנת רכש…
        </div>
      </div>
    )
  }

  if (errorMessage || !data) {
    return (
      <div dir="rtl" className="flex h-full items-center justify-center p-8">
        <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertTriangle className="size-8 text-destructive" aria-hidden />
          <h2 className="text-lg font-semibold text-destructive">
            לא ניתן לטעון את הזמנת הרכש
          </h2>
          <p className="text-sm text-muted-foreground">
            {errorMessage ?? "ההזמנה לא נמצאה או שאין הרשאה לצפייה."}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/marker-ofek/procurement/orders")}
            className="gap-2"
          >
            <ArrowRight className="size-4" aria-hidden />
            חזרה לרשימה
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div dir="rtl" className="flex h-full min-h-0 flex-col gap-3 p-4 pb-8">
      <PageHeader data={data} onBack={() => router.push("/marker-ofek/procurement/orders")} />

      <Tabs
        defaultValue="general"
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <TabsList className="flex-none justify-start gap-1 self-start">
          <TabsTrigger value="general" className="gap-1.5">
            <ClipboardList className="size-4" aria-hidden />
            כללי
          </TabsTrigger>
          <TabsTrigger value="lines" className="gap-1.5">
            <PackageSearch className="size-4" aria-hidden />
            שורות ({data.lines.length})
          </TabsTrigger>
          <TabsTrigger value="pricing" className="gap-1.5">
            <Sparkles className="size-4" aria-hidden />
            מחירים חכמים
          </TabsTrigger>
          <TabsTrigger value="attachments" className="gap-1.5">
            <FileStack className="size-4" aria-hidden />
            קבצים
          </TabsTrigger>
          <TabsTrigger value="approvals" className="gap-1.5">
            <FileSignature className="size-4" aria-hidden />
            תהליך אישור
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="size-4" aria-hidden />
            היסטוריה
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="general"
          className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1"
        >
          <GeneralTab data={data} />
        </TabsContent>

        <TabsContent
          value="lines"
          className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1"
        >
          <LinesTab lines={data.lines} currency={data.currency} />
        </TabsContent>

        <TabsContent
          value="pricing"
          className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1"
        >
          <PoSmartPricingTab
            poSupplierId={data.supplier?.id ?? null}
            poSupplierName={data.supplier?.name ?? null}
            currency={data.currency}
            poTotalDeviationPct={data.poTotalDeviationPct}
            requiresPoEscalation={data.requiresPoEscalation}
            lines={data.lines.map<SmartPricingLineInput>((line) => ({
              lineId: line.id,
              itemId: line.itemId,
              itemNumber: line.itemNumber,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              priceDeviationPct: line.priceDeviationPct,
              requiresEscalation: line.requiresEscalation,
              priceSource: line.priceSource,
            }))}
          />
        </TabsContent>

        <TabsContent
          value="attachments"
          className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1"
        >
          <AttachmentsTabLoader poId={data.id} />
        </TabsContent>

        <TabsContent
          value="approvals"
          className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1"
        >
          <PoApprovalsTab
            poId={data.id}
            poStatus={data.status}
            onChanged={refetch}
          />
        </TabsContent>

        <TabsContent
          value="history"
          className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1"
        >
          <PoHistoryTab poId={data.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============================================================================
// PageHeader — pin'd top section: PO number + status badges + back button
// ============================================================================

function PageHeader({
  data,
  onBack,
}: {
  data: ProcurementOrderDetailDto
  onBack: () => void
}) {
  const statusLabel = STATUS_LABEL[data.status] ?? data.status
  const statusClass =
    STATUS_BADGE_CLASS[data.status] ??
    "bg-slate-500/15 text-slate-700 border-slate-500/30"
  const urgencyLabel = URGENCY_LABEL[data.urgencyLevel] ?? data.urgencyLevel
  const urgencyClass =
    URGENCY_BADGE_CLASS[data.urgencyLevel] ??
    URGENCY_BADGE_CLASS.NORMAL
  const showAiBypass = data.aiNegotiationStatus === "BYPASSED_URGENCY"

  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
      <div className="flex items-start gap-3">
        <div className="flex size-10 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
          <PackageSearch className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-lg font-semibold tabular-nums">
              {data.poNumber}
            </h1>
            <Badge variant="outline" className={cn("font-medium", statusClass)}>
              {statusLabel}
            </Badge>
            {data.urgencyLevel !== "NORMAL" ? (
              <Badge
                variant="outline"
                className={cn("font-medium", urgencyClass)}
              >
                דחיפות: {urgencyLabel}
              </Badge>
            ) : null}
            {data.requiresPoEscalation ? (
              <Badge
                variant="outline"
                className="border-amber-500/40 bg-amber-500/10 font-medium text-amber-800"
              >
                <AlertTriangle className="me-1 size-3" aria-hidden />
                חורג מסף PO ({data.poTotalDeviationPct?.toFixed(2)}%)
              </Badge>
            ) : null}
            {showAiBypass ? (
              <Badge
                variant="outline"
                className="border-fuchsia-500/40 bg-fuchsia-500/10 font-medium text-fuchsia-800"
              >
                <Sparkles className="me-1 size-3" aria-hidden />
                AI נעקף עקב דחיפות
              </Badge>
            ) : null}
          </div>
          <p className="line-clamp-1 max-w-xl text-sm text-muted-foreground">
            {data.title}
          </p>
        </div>
      </div>
      <Button type="button" variant="outline" onClick={onBack} className="gap-2">
        <ArrowRight className="size-4" aria-hidden />
        חזרה לרשימה
      </Button>
    </header>
  )
}

// ============================================================================
// GeneralTab — header info + summary + body_html (read-only)
// ============================================================================

function GeneralTab({ data }: { data: ProcurementOrderDetailDto }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* Left column — info cards */}
      <div className="space-y-4">
        <InfoCard title="פרטי ספק ופרויקט" icon={<Building2 className="size-4" />}>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <DLRow
              label="ספק"
              value={
                data.supplier ? (
                  <span>
                    {data.supplier.supplierNum ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {data.supplier.supplierNum} ·{" "}
                      </span>
                    ) : null}
                    {data.supplier.name}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )
              }
            />
            <DLRow
              label="פרויקט"
              value={
                data.project ? (
                  <span>
                    {data.project.projectNumber ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {data.project.projectNumber} ·{" "}
                      </span>
                    ) : null}
                    {data.project.name ?? "—"}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )
              }
            />
            <DLRow label="מטבע" value={<span className="font-mono">{data.currency}</span>} />
            <DLRow
              label="תאריך יצירה"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-muted-foreground" aria-hidden />
                  {formatDateTime(data.createdAt)}
                </span>
              }
            />
            {data.issuedAt ? (
              <DLRow
                label="תאריך הוצאה"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="size-3.5 text-muted-foreground" aria-hidden />
                    {formatDate(data.issuedAt)}
                  </span>
                }
              />
            ) : null}
          </dl>
        </InfoCard>

        {data.urgencyJustification ||
        data.requiresPoEscalation ||
        data.aiNegotiationStatus !== "NOT_ATTEMPTED" ? (
          <InfoCard
            title="משילות AI ובקרה"
            icon={<TrendingUp className="size-4" />}
          >
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <DLRow
                label="רמת דחיפות"
                value={
                  <Badge
                    variant="outline"
                    className={cn(
                      "font-medium",
                      URGENCY_BADGE_CLASS[data.urgencyLevel] ??
                        URGENCY_BADGE_CLASS.NORMAL
                    )}
                  >
                    {URGENCY_LABEL[data.urgencyLevel] ?? data.urgencyLevel}
                  </Badge>
                }
              />
              <DLRow
                label="סטטוס AI Negotiation"
                value={
                  <span className="font-mono text-xs">
                    {data.aiNegotiationStatus ?? "—"}
                  </span>
                }
              />
              {data.poTotalDeviationPct !== null ? (
                <DLRow
                  label="חריגת מחיר ב-PO (משוקללת)"
                  value={
                    <span
                      className={cn(
                        "font-mono tabular-nums",
                        data.requiresPoEscalation
                          ? "font-semibold text-amber-700"
                          : "text-muted-foreground"
                      )}
                    >
                      {data.poTotalDeviationPct.toFixed(2)}%
                    </span>
                  }
                />
              ) : null}
              {data.urgencyJustification ? (
                <DLRow
                  label="הצדקת דחיפות"
                  fullWidth
                  value={
                    <p className="rounded-md bg-muted/40 p-2 text-xs leading-relaxed text-foreground">
                      {data.urgencyJustification}
                    </p>
                  }
                />
              ) : null}
            </dl>
          </InfoCard>
        ) : null}

        {data.notes ? (
          <InfoCard title="הערות" icon={<ClipboardList className="size-4" />}>
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
              {data.notes}
            </p>
          </InfoCard>
        ) : null}

        {data.bodyHtml ? (
          <InfoCard
            title="גוף מסמך ההזמנה"
            icon={<FileSignature className="size-4" />}
          >
            <div
              className="prose prose-sm max-w-none rounded-md border border-border bg-background p-3 text-sm leading-relaxed dark:prose-invert"
              // body_html מאוחסן כ-sanitized HTML מהשרת (Phase 7.6).
              // הצגה Read-only בלבד; עורך Tiptap יבוא ב-Phase 7.13.X.
              dangerouslySetInnerHTML={{ __html: data.bodyHtml }}
            />
          </InfoCard>
        ) : null}
      </div>

      {/* Right column — financial summary */}
      <div className="space-y-4">
        <SummaryCard data={data} />
      </div>
    </div>
  )
}

function SummaryCard({ data }: { data: ProcurementOrderDetailDto }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <CircleDollarSign className="size-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold text-muted-foreground">
          סיכום פיננסי
        </h2>
      </div>
      <dl className="space-y-2 text-sm">
        <SumRow
          label="סכום נטו"
          value={`${numberFormatter.format(data.totalAmountNet)} ${data.currency}`}
        />
        <SumRow
          label={`מע"מ`}
          value={`${numberFormatter.format(data.vatAmount)} ${data.currency}`}
        />
        <Separator />
        <SumRow
          label="סכום ברוטו"
          value={`${numberFormatter.format(data.totalAmountGross)} ${data.currency}`}
          emphasis
        />
      </dl>
      <Separator className="my-3" />
      <p className="text-xs text-muted-foreground">
        חישוב מע&quot;מ 17% מתבצע אוטומטית בשרת לפי גרסת ה-VAT ב-`erp_purchase_orders`.
      </p>
    </div>
  )
}

function SumRow({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt
        className={cn(
          "text-muted-foreground",
          emphasis && "text-base font-semibold text-foreground"
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "font-medium tabular-nums",
          emphasis && "text-base font-bold text-primary"
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function InfoCard({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-primary" aria-hidden>
          {icon}
        </span>
        <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function DLRow({
  label,
  value,
  fullWidth,
}: {
  label: string
  value: React.ReactNode
  fullWidth?: boolean
}) {
  return (
    <div className={cn("space-y-0.5", fullWidth && "sm:col-span-2")}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  )
}

// ============================================================================
// LinesTab — read-only table with all 7.4 enrichment columns visible
// ============================================================================

function LinesTab({
  lines,
  currency,
}: {
  lines: ProcurementOrderDetailLineDto[]
  currency: string
}) {
  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 p-12 text-center">
        <PackageSearch className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          אין שורות בהזמנה זו (לא תקין — חובה לפחות אחת).
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/40">
            <TableRow>
              <TableHead className="w-10 text-center">#</TableHead>
              <TableHead className="text-start">פריט</TableHead>
              <TableHead className="text-start">תיאור</TableHead>
              <TableHead className="w-20 text-end">כמות</TableHead>
              <TableHead className="w-28 text-end">מחיר יחידה</TableHead>
              <TableHead className="w-20 text-end">הנחה %</TableHead>
              <TableHead className="w-28 text-end">סה&quot;כ</TableHead>
              <TableHead className="w-28 text-start">תאריך אספקה</TableHead>
              <TableHead className="w-24 text-start">מקור מחיר</TableHead>
              <TableHead className="w-32 text-start">יצרן</TableHead>
              <TableHead className="w-24 text-start">סעיף תקציבי</TableHead>
              <TableHead className="w-28 text-start">3% Rule</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => (
              <LineDataRow
                key={line.id}
                line={line}
                index={index}
                currency={currency}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function LineDataRow({
  line,
  index,
  currency,
}: {
  line: ProcurementOrderDetailLineDto
  index: number
  currency: string
}) {
  const lineCurrency = line.lineCurrency ?? currency
  const priceSourceLabel = line.priceSource
    ? PRICE_SOURCE_LABEL[line.priceSource] ?? line.priceSource
    : "—"
  const escalationLabel = line.escalationCategory
    ? ESCALATION_CATEGORY_LABEL[line.escalationCategory] ?? line.escalationCategory
    : null

  return (
    <>
      <TableRow
        className={cn(
          line.requiresEscalation && "bg-amber-50/40 dark:bg-amber-900/10"
        )}
      >
        <TableCell className="text-center text-xs text-muted-foreground tabular-nums">
          {index + 1}
        </TableCell>
        <TableCell className="font-mono text-xs">
          {line.itemNumber ?? line.itemSku ?? "—"}
        </TableCell>
        <TableCell className="max-w-[260px] truncate text-sm">
          {line.description}
        </TableCell>
        <TableCell className="text-end tabular-nums">
          {numberFormatter.format(line.quantity)}
        </TableCell>
        <TableCell className="text-end tabular-nums">
          {numberFormatter.format(line.unitPrice)} {lineCurrency}
        </TableCell>
        <TableCell className="text-end tabular-nums text-muted-foreground">
          {line.discountPct > 0 ? `${line.discountPct.toFixed(1)}%` : "—"}
        </TableCell>
        <TableCell className="text-end font-medium tabular-nums">
          {numberFormatter.format(line.totalPrice)}
        </TableCell>
        <TableCell className="text-xs">
          {line.supplyDate ? formatDate(line.supplyDate) : "—"}
        </TableCell>
        <TableCell className="text-xs">
          <Badge
            variant="outline"
            className="border-slate-300/50 bg-slate-100/50 font-normal"
          >
            {priceSourceLabel}
          </Badge>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {line.manufacturerName ?? "—"}
        </TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">
          {line.budgetSubChapter ?? "—"}
        </TableCell>
        <TableCell>
          {line.requiresEscalation ? (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 font-medium text-amber-800"
            >
              <AlertTriangle className="me-1 size-3" aria-hidden />
              {line.priceDeviationPct?.toFixed(1)}%
            </Badge>
          ) : line.priceDeviationPct != null && line.priceDeviationPct > 0 ? (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              +{line.priceDeviationPct.toFixed(1)}%
            </span>
          ) : (
            <BadgeCheck className="size-4 text-emerald-600" aria-hidden />
          )}
        </TableCell>
      </TableRow>

      {/* Escalation/notes secondary row — מוצג כאשר יש שדות עשירים נוספים */}
      {line.escalationJustification ||
      line.lineNotes ||
      line.alternativeSupplierId ? (
        <TableRow className="border-t-0 hover:bg-transparent">
          <TableCell colSpan={12} className="bg-muted/20 px-3 py-2">
            <div className="grid gap-2 text-xs lg:grid-cols-3">
              {line.escalationJustification ? (
                <div className="space-y-0.5">
                  <p className="font-semibold text-amber-800">
                    הצדקת חריגה
                    {escalationLabel ? ` (${escalationLabel})` : ""}:
                  </p>
                  <p className="text-muted-foreground">
                    {line.escalationJustification}
                  </p>
                </div>
              ) : null}
              {line.lineNotes ? (
                <div className="space-y-0.5">
                  <p className="font-semibold text-foreground">הערות שורה:</p>
                  <p className="text-muted-foreground">{line.lineNotes}</p>
                </div>
              ) : null}
              {line.alternativeSupplierId && line.alternativeUnitPrice != null ? (
                <div className="space-y-0.5">
                  <p className="inline-flex items-center gap-1 font-semibold text-fuchsia-700">
                    <Sparkles className="size-3" aria-hidden />
                    חלופה זולה יותר זמינה:
                  </p>
                  <p className="font-mono tabular-nums text-muted-foreground">
                    {numberFormatter.format(line.alternativeUnitPrice)}{" "}
                    {lineCurrency}
                    {line.alternativeLeadTimeDays
                      ? ` · ${line.alternativeLeadTimeDays} ימים`
                      : ""}
                  </p>
                </div>
              ) : null}
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  )
}

// ============================================================================
// AttachmentsTabLoader — resolves activeCompanyId from cookie before mounting
// the attachments tab (cookie is only available client-side).
// ============================================================================

function AttachmentsTabLoader({ poId }: { poId: string }) {
  const [companyId, setCompanyId] = React.useState<string | null>(null)

  React.useEffect(() => {
    setCompanyId(readActiveCompanyIdFromCookie())
  }, [])

  if (!companyId) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/10 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        טוען הקשר חברה פעילה…
      </div>
    )
  }

  return <PoAttachmentsTab poId={poId} companyId={companyId} />
}

