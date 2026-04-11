"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import * as React from "react"
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Camera,
  ClipboardCheck,
  Loader2,
  Package,
  PenLine,
  ShieldCheck,
  Truck,
} from "lucide-react"
import { toast } from "sonner"

import {
  MoContextCommentButton,
  useMoCommentPresence,
} from "@/components/marker-ofek/mo-context-comment"
import { SupplierNameLink } from "@/components/marker-ofek/supplier-name-link"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button-variants"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { deliveryNoteImageSrcForDisplay } from "@/lib/marker-ofek/delivery-note-image-url"
import { cn, formatError } from "@/lib/utils"
import { updatePurchaseOrderFinanceFields } from "@/lib/marker-ofek/procurement/po-finance-fields-actions"
import {
  signPurchaseOrderByCeo,
  signPurchaseOrderByUser,
} from "./actions"

type ProjectEmbed = { name: string; internal_project_code: string }
type EntityEmbed = { name: string; default_withholding_tax_percent?: number | null }

type PoLineRow = {
  id: string
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  total_price: number
  created_at: string
}

type PoDetail = {
  id: string
  po_number: string
  status: string
  project_id: string
  supplier_id: string
  ceo_approval_required: boolean
  price_deviation_percent: number
  price_deviation_amount: number
  user_signed_at: string | null
  ceo_signed_at: string | null
  withholding_tax_percent?: number | null
  direct_cost_category?: string | null
  projects: ProjectEmbed | ProjectEmbed[] | null
  entities: EntityEmbed | EntityEmbed[] | null
  po_line_items: PoLineRow[] | PoLineRow[] | null
}

type GoodsReceiptNested = {
  id: string
  receipt_date?: string
  delivery_note_image_url?: string | null
  goods_receipt_items:
    | { po_line_item_id: string; quantity_received: number }
    | { po_line_item_id: string; quantity_received: number }[]
    | null
}

type GoodsReceiptSummary = {
  id: string
  receipt_date: string
  delivery_note_image_url: string | null
}

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

function embedMany<T>(x: T | T[] | null | undefined): T[] {
  if (x == null) return []
  return Array.isArray(x) ? x : [x]
}

function roundQty(n: number): number {
  return Math.round(n * 10000) / 10000
}

const qtyDisplay = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
})

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const receiptDateFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "medium",
})

function canRecordGoodsReceipt(status: string): boolean {
  return status === "approved" || status === "sent" || status === "partial_receipt"
}

function poStatusLabel(s: string): string {
  const map: Record<string, string> = {
    draft: "טיוטה",
    approved: "אושרה",
    pending_ceo_approval: "ממתינה לאישור מנכ״ל",
    sent: "נשלחה לספק",
    partial_receipt: "קבלה חלקית",
    closed: "נסגרה",
  }
  return map[s] ?? s
}

export default function ProcurementPoDetailPage() {
  const params = useParams()
  const poId = typeof params.id === "string" ? params.id : ""

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [po, setPo] = React.useState<PoDetail | null>(null)
  const [receivedByLine, setReceivedByLine] = React.useState<
    Record<string, number>
  >({})
  const [goodsReceiptSummaries, setGoodsReceiptSummaries] = React.useState<
    GoodsReceiptSummary[]
  >([])
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [signatureSubmitting, setSignatureSubmitting] = React.useState<
    "user" | "ceo" | null
  >(null)
  const [financeWh, setFinanceWh] = React.useState("")
  const [financeCat, setFinanceCat] = React.useState("materials")
  const [financeSaving, setFinanceSaving] = React.useState(false)

  React.useEffect(() => {
    if (!poId) {
      setLoading(false)
      setError("מזהה הזמנה חסר")
      return
    }

    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const supabase = createSupabaseBrowserClient()

        const { data: poRow, error: poErr } = await supabase
          .from("purchase_orders")
          .select(
            `
            id,
            po_number,
            status,
            project_id,
            supplier_id,
            ceo_approval_required,
            price_deviation_percent,
            price_deviation_amount,
            user_signed_at,
            ceo_signed_at,
            withholding_tax_percent,
            direct_cost_category,
            projects ( name, internal_project_code ),
            entities ( name, default_withholding_tax_percent ),
            po_line_items (
              id,
              description,
              quantity,
              unit,
              unit_price,
              total_price,
              created_at
            ),
            goods_receipts (
              id,
              receipt_date,
              delivery_note_image_url,
              goods_receipt_items ( po_line_item_id, quantity_received )
            )
          `
          )
          .eq("id", poId)
          .eq("is_deleted", false)
          .maybeSingle()

        if (poErr) throw poErr
        if (!poRow) {
          if (!cancelled) {
            setPo(null)
            setGoodsReceiptSummaries([])
            setError("הזמנת הרכש לא נמצאה")
          }
          return
        }

        const rawPo = poRow as PoDetail & {
          goods_receipts?: GoodsReceiptNested[] | GoodsReceiptNested | null
        }
        const { goods_receipts: grNested, ...poOnly } = rawPo
        const p = poOnly as PoDetail

        const priorByLine: Record<string, number> = {}
        const lines = embedMany(p.po_line_items).sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
        for (const li of lines) priorByLine[li.id] = 0

        for (const rec of embedMany(grNested)) {
          for (const row of embedMany(rec.goods_receipt_items)) {
            const lid = row.po_line_item_id
            const q = Number(row.quantity_received) || 0
            priorByLine[lid] = (priorByLine[lid] ?? 0) + q
          }
        }

        const summaries: GoodsReceiptSummary[] = embedMany(grNested)
          .map((r) => ({
            id: r.id,
            receipt_date: r.receipt_date ?? "",
            delivery_note_image_url: r.delivery_note_image_url ?? null,
          }))
          .sort((a, b) => b.receipt_date.localeCompare(a.receipt_date))

        const {
          data: authData,
          error: authErr,
        } = await supabase.auth.getUser()
        if (authErr) throw authErr
        const currentUser = authData.user
        let adminFlag = false
        if (currentUser) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", currentUser.id)
            .maybeSingle()
          const role = (profile as { role?: string } | null)?.role ?? "tenant"
          adminFlag = role === "admin"
        }

        if (!cancelled) {
          setPo(p)
          setFinanceWh(String((p as PoDetail).withholding_tax_percent ?? 0))
          setFinanceCat(String((p as PoDetail).direct_cost_category ?? "materials"))
          setReceivedByLine(priorByLine)
          setGoodsReceiptSummaries(summaries)
          setIsAdmin(adminFlag)
        }
      } catch (e) {
        if (!cancelled) {
          setPo(null)
          setGoodsReceiptSummaries([])
          setIsAdmin(false)
          setError(formatError(e) || "שגיאה בטעינת פרטי ההזמנה")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [poId])

  const poLineIdsForComments = React.useMemo(() => {
    if (!po) return []
    return embedMany(po.po_line_items).map((l) => l.id)
  }, [po])

  const { hasComment: poLineHasComment } = useMoCommentPresence(
    po?.project_id ?? null,
    "po_line",
    poLineIdsForComments
  )

  const poCommentProjectName = React.useMemo(() => {
    const p = po ? embedOne(po.projects) : null
    return p?.name ?? "פרויקט"
  }, [po])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" aria-hidden />
        <p className="text-sm">טוען הזמנה…</p>
      </div>
    )
  }

  if (error || !po) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
        <p className="text-destructive">{error ?? "לא ניתן לטעון"}</p>
        <Link
          href="/marker-ofek/procurement"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          חזרה לרכש
        </Link>
      </div>
    )
  }

  const project = embedOne(po.projects)
  const supplier = embedOne(po.entities)
  const lines = embedMany(po.po_line_items).sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const pendingLines = lines
    .map((li) => {
      const ordered = Number(li.quantity) || 0
      const got = receivedByLine[li.id] ?? 0
      const pending = Math.max(0, roundQty(ordered - got))
      return { li, ordered, got, pending }
    })
    .filter((x) => x.pending > 0)

  const pendingCeoApproval =
    po.ceo_approval_required && (!po.user_signed_at || !po.ceo_signed_at)
  const poActionId = po.id

  async function handleUserSignature() {
    setSignatureSubmitting("user")
    try {
      const res = await signPurchaseOrderByUser(poActionId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("חתימת משתמש נשמרה")
      window.location.reload()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSignatureSubmitting(null)
    }
  }

  async function handleSaveFinanceFields() {
    setFinanceSaving(true)
    try {
      const res = await updatePurchaseOrderFinanceFields({
        poId: poActionId,
        withholding_tax_percent: Number(financeWh) || 0,
        direct_cost_category: financeCat,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("שדות כספיים נשמרו")
      window.location.reload()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setFinanceSaving(false)
    }
  }

  async function handleCeoSignature() {
    setSignatureSubmitting("ceo")
    try {
      const res = await signPurchaseOrderByCeo(poActionId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("חתימת מנכ״ל נשמרה")
      window.location.reload()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSignatureSubmitting(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-2 pb-12 sm:px-0">
      <Link
        href="/marker-ofek/procurement"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לרכש וספקים
      </Link>

      <header className="pharmacy-hero-card p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-400/90">
              פרטי הזמנת רכש
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-[#1e293b] sm:text-3xl">
              {po.po_number}
            </h1>
            <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-[#1e293b]">
              {poStatusLabel(po.status)}
            </span>
          </div>
          <div className="grid w-full gap-4 text-sm text-[#1e293b] sm:max-w-sm">
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
              <div>
                <p className="text-xs text-slate-400">פרויקט</p>
                <p className="font-medium">{project?.name ?? "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Truck className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
              <div>
                <p className="text-xs text-slate-400">ספק</p>
                <SupplierNameLink
                  supplierId={po.supplier_id}
                  supplierName={supplier?.name ?? "—"}
                  className="font-medium"
                />
              </div>
            </div>
          </div>
        </div>
        {canRecordGoodsReceipt(po.status) ? (
          <div className="mt-6">
            <Link
              href={`/marker-ofek/procurement/receipt/${po.id}`}
              className={cn(
                buttonVariants({ size: "default" }),
                "w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-500 sm:w-auto"
              )}
            >
              <ClipboardCheck className="size-4" aria-hidden />
              קליטת סחורה
            </Link>
          </div>
        ) : null}
      </header>

      <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-[#1e293b]">סיווג עלות וניכוי במקור</h2>
        <p className="mt-1 text-xs text-slate-500">
          לקישור לדוחות כספיים ו-P&L. ברירת מחדל ניכוי מהספק:{" "}
          <span className="font-currency-mono tabular-nums">
            {Number(supplier?.default_withholding_tax_percent ?? 0).toFixed(2)}%
          </span>
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>קטגוריית עלות (PO)</Label>
            <Select
              value={financeCat}
              onValueChange={(v) => setFinanceCat(v ?? "materials")}
            >
              <SelectTrigger className="border-slate-200 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="materials">חומרים וציוד</SelectItem>
                <SelectItem value="subcontract">חברות ביצוע</SelectItem>
                <SelectItem value="equipment">ציוד מכני / השכרה</SelectItem>
                <SelectItem value="general">כללי</SelectItem>
                <SelectItem value="marketing_overhead">שיווק / עקיפות משויכת</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="po-wh">ניכוי במקור %</Label>
            <Input
              id="po-wh"
              className="font-currency-mono"
              inputMode="decimal"
              value={financeWh}
              onChange={(e) => setFinanceWh(e.target.value)}
            />
          </div>
        </div>
        <Button
          type="button"
          className="mt-4 gap-2 bg-[#1e293b] text-white hover:bg-slate-800"
          disabled={financeSaving}
          onClick={() => void handleSaveFinanceFields()}
        >
          {financeSaving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          שמירת שדות כספיים
        </Button>
      </section>

      {pendingCeoApproval ? (
        <section className="rounded-2xl border border-red-500/35 bg-red-500/[0.08] p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="size-5 shrink-0" aria-hidden />
            <h2 className="text-lg font-semibold">Pending CEO Approval</h2>
          </div>
          <p className="mt-2 text-sm text-red-700/90">
            ההזמנה חורגת ממחיר אולטימטיבי ודורשת שתי חתימות לפני הדפסה/שליחה לספק.
          </p>
          <p className="mt-1 text-xs text-red-700/90">
            סטייה: {currencyFormatter.format(Number(po.price_deviation_amount) || 0)} (
            {(Number(po.price_deviation_percent) || 0).toFixed(2)}%)
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Button
              type="button"
              variant={po.user_signed_at ? "outline" : "default"}
              className="gap-2"
              disabled={Boolean(po.user_signed_at) || signatureSubmitting != null}
              onClick={() => void handleUserSignature()}
            >
              {signatureSubmitting === "user" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <PenLine className="size-4" aria-hidden />
              )}
              {po.user_signed_at ? "חתימת משתמש קיימת" : "חתימת משתמש"}
            </Button>
            {isAdmin ? (
              <Button
                type="button"
                variant={po.ceo_signed_at ? "outline" : "destructive"}
                className="gap-2"
                disabled={Boolean(po.ceo_signed_at) || signatureSubmitting != null}
                onClick={() => void handleCeoSignature()}
              >
                {signatureSubmitting === "ceo" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <ShieldCheck className="size-4" aria-hidden />
                )}
                {po.ceo_signed_at ? "חתימת מנכ״ל קיימת" : "CEO Approve"}
              </Button>
            ) : (
              <div className="rounded-md border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                אישור מנכ״ל זמין למנהל מערכת בלבד
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span
              className={cn(
                buttonVariants({ variant: "outline" }),
                "pointer-events-none opacity-60"
              )}
            >
              הדפס הזמנה (חסום)
            </span>
            <span
              className={cn(
                buttonVariants({ variant: "outline" }),
                "pointer-events-none opacity-60"
              )}
            >
              שלח לספק (חסום)
            </span>
          </div>
        </section>
      ) : null}

      {po.status === "partial_receipt" && pendingLines.length > 0 ? (
        <section
          className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 shadow-sm sm:p-5"
          role="region"
          aria-label="פריטים בחוסר"
        >
          <div className="mb-3 flex items-center gap-2 text-amber-900">
            <AlertTriangle className="size-5 shrink-0" aria-hidden />
            <h2 className="text-lg font-semibold">פריטים בחוסר (ממתינים לאספקה)</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            סיכום שורות שעדיין לא הושלמה קבלתן מול כמות בהזמנה.
          </p>
          <div className="hidden overflow-x-auto rounded-lg border border-border/50 md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-11 px-0 text-center">
                    <span className="sr-only">הערות</span>
                  </TableHead>
                  <TableHead>תיאור</TableHead>
                  <TableHead className="text-end">הוזמן</TableHead>
                  <TableHead className="text-end">התקבל</TableHead>
                  <TableHead className="text-end">בחוסר</TableHead>
                  <TableHead className="text-end">שווי בחוסר (משוער)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingLines.map(({ li, ordered, got, pending }) => (
                  <TableRow key={li.id}>
                    <TableCell className="w-11 p-1 align-top">
                      <MoContextCommentButton
                        projectId={po.project_id}
                        projectName={poCommentProjectName}
                        contextType="po_line"
                        contextId={li.id}
                        contextLabel={`שורת רכש: ${li.description.slice(0, 48)}${li.description.length > 48 ? "…" : ""}`}
                        hasComment={poLineHasComment(li.id)}
                      />
                    </TableCell>
                    <TableCell className="max-w-[240px] font-medium">
                      {li.description}
                      {li.unit ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          יחידה: {li.unit}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {qtyDisplay.format(ordered)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {qtyDisplay.format(got)}
                    </TableCell>
                    <TableCell className="text-end font-semibold tabular-nums text-amber-800">
                      {qtyDisplay.format(pending)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {currencyFormatter.format(
                        pending * (Number(li.unit_price) || 0)
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col gap-3 md:hidden">
            {pendingLines.map(({ li, ordered, got, pending }) => (
              <li
                key={li.id}
                className="rounded-xl border border-amber-500/30 bg-card/80 p-4"
              >
                <p className="font-medium leading-snug">{li.description}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">הוזמן</dt>
                  <dd className="text-end tabular-nums">{qtyDisplay.format(ordered)}</dd>
                  <dt className="text-muted-foreground">התקבל</dt>
                  <dd className="text-end tabular-nums">{qtyDisplay.format(got)}</dd>
                  <dt className="font-medium text-amber-800">
                    בחוסר
                  </dt>
                  <dd className="text-end font-semibold tabular-nums text-amber-800">
                    {qtyDisplay.format(pending)}
                  </dd>
                  <dt className="text-muted-foreground">שווי בחוסר</dt>
                  <dd className="text-end tabular-nums">
                    {currencyFormatter.format(
                      pending * (Number(li.unit_price) || 0)
                    )}
                  </dd>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {goodsReceiptSummaries.length > 0 ? (
        <section
          className="rounded-2xl border border-border/60 bg-card/80 shadow-sm"
          aria-label="היסטוריית קבלות"
        >
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-4 sm:px-6">
            <Camera className="size-5 text-muted-foreground" aria-hidden />
            <h2 className="text-lg font-semibold">קבלות שנרשמו</h2>
          </div>
          <ul className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">
            {goodsReceiptSummaries.map((r) => {
              const thumb = deliveryNoteImageSrcForDisplay(
                r.delivery_note_image_url,
                { maxWidth: 720, quality: 80 }
              )
              const full = r.delivery_note_image_url
              const dateLabel =
                r.receipt_date &&
                !Number.isNaN(Date.parse(r.receipt_date))
                  ? receiptDateFormatter.format(new Date(r.receipt_date))
                  : r.receipt_date || "—"
              return (
                <li
                  key={r.id}
                  className="flex flex-col gap-2 rounded-xl border border-border/50 bg-background/60 p-3"
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    תאריך קבלה
                  </p>
                  <p className="text-sm font-semibold">{dateLabel}</p>
                  {thumb && full ? (
                    <a
                      href={full}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block overflow-hidden rounded-lg border border-border/40 bg-muted/20"
                    >
                      {/* URL דינמי מ-Supabase Storage — לא next/image ללא remotePatterns */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumb}
                        alt={`תעודת משלוח — ${dateLabel}`}
                        className="max-h-44 w-full object-contain object-center"
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="sr-only">פתיחת תמונה בגודל מלא</span>
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      אין צילום תעודה לקבלה זו
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border/60 bg-card/80 shadow-sm">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-4 sm:px-6">
          <Package className="size-5 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">כל שורות ההזמנה</h2>
        </div>
        <div className="overflow-x-auto p-2 sm:p-4">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-11 px-0 text-center">
                  <span className="sr-only">הערות</span>
                </TableHead>
                <TableHead>תיאור</TableHead>
                <TableHead className="text-end">כמות</TableHead>
                <TableHead className="text-end">התקבל</TableHead>
                <TableHead className="text-end">יתרה</TableHead>
                <TableHead className="text-end">מחיר יחידה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((li) => {
                const ordered = Number(li.quantity) || 0
                const got = receivedByLine[li.id] ?? 0
                const rem = Math.max(0, roundQty(ordered - got))
                return (
                  <TableRow key={li.id}>
                    <TableCell className="w-11 p-1 align-top">
                      <MoContextCommentButton
                        projectId={po.project_id}
                        projectName={poCommentProjectName}
                        contextType="po_line"
                        contextId={li.id}
                        contextLabel={`שורת רכש: ${li.description.slice(0, 48)}${li.description.length > 48 ? "…" : ""}`}
                        hasComment={poLineHasComment(li.id)}
                      />
                    </TableCell>
                    <TableCell className="max-w-[200px]">{li.description}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      {qtyDisplay.format(ordered)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {qtyDisplay.format(got)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-end tabular-nums",
                        rem > 0 &&
                          "font-medium text-amber-700"
                      )}
                    >
                      {qtyDisplay.format(rem)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {currencyFormatter.format(Number(li.unit_price) || 0)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}
