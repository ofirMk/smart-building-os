"use client"

import Link from "next/link"
import * as React from "react"
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  ClipboardList,
  Loader2,
  Package,
  Plus,
  Receipt,
  Scale,
  ScanText,
  ShoppingCart,
  Truck,
} from "lucide-react"

import { buttonVariants } from "@/components/ui/button-variants"
import { SupplierNameLink } from "@/components/marker-ofek/supplier-name-link"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { cn, formatError } from "@/lib/utils"

type PoListRow = {
  id: string
  supplier_id: string
  po_number: string
  order_date: string
  status: string
  total_amount: number
  projects:
    | { name: string; internal_project_code: string }
    | { name: string; internal_project_code: string }[]
    | null
  entities: { name: string } | { name: string }[] | null
}

type SelectedPoLine = {
  id: string
  description: string
  quantity: number
  unit_price: number
  total_price: number
}

type SelectedPoReceipt = {
  id: string
  receipt_date: string | null
  delivery_note_number: string | null
  received_by: string | null
  shortage_notes: string | null
}

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
})

/** הזמנות שניתן לקלוט אליהן סחורה (אושרה / נשלחה / קבלה חלקית) */
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

export default function MarkerOfekProcurementPage() {
  const [rows, setRows] = React.useState<PoListRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedPoId, setSelectedPoId] = React.useState("")
  const [selectedPoLines, setSelectedPoLines] = React.useState<SelectedPoLine[]>([])
  const [selectedPoReceipts, setSelectedPoReceipts] = React.useState<SelectedPoReceipt[]>([])
  const [loadingSelectedPo, setLoadingSelectedPo] = React.useState(false)
  const [shortageNotePoIds, setShortageNotePoIds] = React.useState<Set<string>>(
    () => new Set()
  )

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error: qError } = await supabase
          .from("purchase_orders")
          .select(
            `
            id,
            supplier_id,
            po_number,
            order_date,
            status,
            total_amount,
            projects ( name, internal_project_code ),
            entities ( name )
          `
          )
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(50)

        if (qError) throw qError
        const list = (data as PoListRow[]) ?? []
        if (!cancelled) setRows(list)
        if (!cancelled && list.length > 0) {
          setSelectedPoId((prev) => prev || list[0]!.id)
        }

        const ids = list.map((r) => r.id)
        if (ids.length === 0) {
          if (!cancelled) setShortageNotePoIds(new Set())
          return
        }

        const { data: grWithNotes, error: grErr } = await supabase
          .from("goods_receipts")
          .select("po_id, shortage_notes")
          .in("po_id", ids)
          .not("shortage_notes", "is", null)

        if (grErr) {
          if (
            !grErr.message?.includes("shortage_notes") &&
            !grErr.message?.includes("column")
          ) {
            console.warn("[procurement] shortage_notes query", grErr.message)
          }
          if (!cancelled) setShortageNotePoIds(new Set())
          return
        }

        const noteSet = new Set<string>()
        for (const row of grWithNotes ?? []) {
          const r = row as { po_id: string; shortage_notes: string | null }
          if (r.shortage_notes?.trim()) noteSet.add(r.po_id)
        }
        if (!cancelled) setShortageNotePoIds(noteSet)
      } catch (e) {
        if (!cancelled) {
          setRows([])
          setShortageNotePoIds(new Set())
          setError(formatError(e))
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

  React.useEffect(() => {
    if (!selectedPoId) {
      setSelectedPoLines([])
      setSelectedPoReceipts([])
      return
    }
    let cancelled = false
    void (async () => {
      setLoadingSelectedPo(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const [linesRes, receiptsRes] = await Promise.all([
          supabase
            .from("po_line_items")
            .select("id, description, quantity, unit_price, total_price")
            .eq("po_id", selectedPoId)
            .order("created_at", { ascending: true }),
          supabase
            .from("goods_receipts")
            .select("id, receipt_date, delivery_note_number, received_by, shortage_notes")
            .eq("po_id", selectedPoId)
            .order("receipt_date", { ascending: false }),
        ])
        if (linesRes.error) throw linesRes.error
        if (receiptsRes.error) throw receiptsRes.error
        if (!cancelled) {
          setSelectedPoLines((linesRes.data ?? []) as SelectedPoLine[])
          setSelectedPoReceipts((receiptsRes.data ?? []) as SelectedPoReceipt[])
        }
      } catch {
        if (!cancelled) {
          setSelectedPoLines([])
          setSelectedPoReceipts([])
        }
      } finally {
        if (!cancelled) setLoadingSelectedPo(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedPoId])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8 pb-10">
      <Link
        href="/marker-ofek"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה ללוח הבקרה
      </Link>

      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-slate-950/90 via-slate-900/80 to-emerald-950/35 p-6 shadow-lg shadow-black/20 md:p-8">
        <div
          className="pointer-events-none absolute -start-24 -top-24 size-72 rounded-full bg-emerald-500/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              <ShoppingCart className="size-6" aria-hidden />
            </div>
            <div className="min-w-0 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-emerald-400/90">
                מרקר אופק
              </p>
              <h1 className="text-pretty text-2xl font-bold tracking-tight text-white md:text-3xl">
                ניהול רכש וספקים
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
                מעקב אחר הזמנות רכש, ספקים וקבלות סחורה מול פרויקטים.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Link
              href="/marker-ofek/supply-chain/suppliers"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "w-full shrink-0 gap-2 border-amber-500/40 text-amber-950 hover:bg-amber-500/10 dark:text-amber-100 sm:w-auto"
              )}
            >
              <Scale className="size-4" aria-hidden />
              מסך ספקים
            </Link>
            <Link
              href="/marker-ofek/procurement/reconciliation"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "w-full shrink-0 gap-2 border-cyan-500/40 text-cyan-950 hover:bg-cyan-500/10 dark:text-cyan-100 sm:w-auto"
              )}
            >
              <BadgeCheck className="size-4" aria-hidden />
              Audit Table חודשי
            </Link>
            <Link
              href="/marker-ofek/procurement/aging"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "w-full shrink-0 gap-2 border-amber-500/40 text-amber-950 hover:bg-amber-500/10 dark:text-amber-100 sm:w-auto"
              )}
            >
              <Scale className="size-4" aria-hidden />
              גילון ספקים/הזדקנות
            </Link>
            <Link
              href="/marker-ofek/procurement/invoices/new"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "w-full shrink-0 gap-2 border-violet-500/40 text-violet-950 hover:bg-violet-500/10 dark:text-violet-100 sm:w-auto"
              )}
            >
              <Receipt className="size-4" aria-hidden />
              חשבונית AI + 3-way
            </Link>
            <Link
              href="/marker-ofek/procurement/ai-import"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "w-full shrink-0 gap-2 border-violet-500/40 text-violet-950 hover:bg-violet-500/10 dark:text-violet-100 sm:w-auto"
              )}
            >
              <ScanText className="size-4" aria-hidden />
              קליטת חשבונית AI
            </Link>
            <Link
              href="/marker-ofek/procurement/ai-import/pending-allocation"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "w-full shrink-0 gap-2 border-orange-500/40 text-orange-950 hover:bg-orange-500/10 dark:text-orange-100 sm:w-auto"
              )}
            >
              <AlertTriangle className="size-4" aria-hidden />
              Pending Allocation
            </Link>
            <Link
              href="/marker-ofek/procurement/delivery-notes/new"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "w-full shrink-0 gap-2 border-amber-500/45 text-white hover:bg-amber-500/12 sm:w-auto"
              )}
            >
              <Truck className="size-4" aria-hidden />
              תעודת משלוח חדשה
            </Link>
            <Link
              href="/marker-ofek/procurement/purchase-orders/new"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "w-full shrink-0 gap-2 border-emerald-500/50 text-white hover:bg-emerald-500/15 sm:w-auto"
              )}
            >
              <ClipboardList className="size-4" aria-hidden />
              הזמנה מכתב כמויות (BoQ)
            </Link>
            <Link
              href="/marker-ofek/procurement/new"
              className={cn(
                buttonVariants({ size: "lg" }),
                "w-full shrink-0 gap-2 bg-emerald-600 text-white hover:bg-emerald-500 sm:w-auto"
              )}
            >
              <Plus className="size-4" aria-hidden />
              יצירת הזמנת רכש חדשה
            </Link>
          </div>
        </div>
      </div>

      {!loading &&
      !error &&
      rows.some((r) => r.status === "partial_receipt") ? (
        <Alert variant="warning" className="border-amber-500/45">
          <AlertTriangle className="size-4" aria-hidden />
          <AlertTitle>משלוח חלקי — דורש מעקב</AlertTitle>
          <AlertDescription>
            יש הזמנות במצב קבלה חלקית. בדקו את &quot;פריטים בחוסר&quot; בפרטי ההזמנה
            והשלימו קליטה או עדכנו חשבונות ספק בגילון.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="rounded-2xl border border-border/60 bg-card/80 shadow-sm backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-4 md:px-6">
          <div className="flex items-center gap-2 text-foreground">
            <Package className="size-5 text-muted-foreground" aria-hidden />
            <h2 className="text-lg font-semibold tracking-tight">
              הזמנות רכש אחרונות
            </h2>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            <span>טוען הזמנות…</span>
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-sm text-destructive md:px-6">
            שגיאה בטעינת ההזמנות: {error}
            <p className="mt-2 text-xs text-muted-foreground">
              ודאו שהרצתם את{" "}
              <code className="rounded bg-muted px-1">marker_ofek_procurement.sql</code>{" "}
              ב-Supabase.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-14 text-center text-sm text-muted-foreground md:px-6">
            <p>אין עדיין הזמנות רכש במערכת.</p>
            <Link
              href="/marker-ofek/procurement/new"
              className="mt-4 inline-flex text-emerald-600 underline-offset-4 hover:underline dark:text-emerald-400"
            >
              ליצירת הזמנה ראשונה
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto px-2 pb-4 md:px-4">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-start">מספר הזמנה</TableHead>
                  <TableHead className="text-start">פרויקט</TableHead>
                  <TableHead className="text-start">ספק</TableHead>
                  <TableHead className="text-start">תאריך</TableHead>
                  <TableHead className="text-start">סטטוס</TableHead>
                  <TableHead className="text-end">סכום כולל</TableHead>
                  <TableHead className="w-[1%] whitespace-nowrap text-start">
                    פעולות
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const project = embedOne(row.projects)
                  const supplier = embedOne(row.entities)
                  return (
                    <TableRow
                      key={row.id}
                      onClick={() => setSelectedPoId(row.id)}
                      className={cn(
                        "cursor-pointer",
                        selectedPoId === row.id ? "bg-primary/5" : ""
                      )}
                    >
                      <TableCell className="font-mono text-sm font-medium">
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <Link
                            href={`/marker-ofek/procurement/${row.id}`}
                            className="text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400"
                          >
                            {row.po_number}
                          </Link>
                          {(row.status === "partial_receipt" ||
                            shortageNotePoIds.has(row.id)) ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100"
                              title="משלוח חלקי או נרשמו הערות חוסר בקבלה"
                            >
                              <AlertTriangle className="size-3" aria-hidden />
                              חלקי
                            </span>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <span className="truncate">{project?.name ?? "—"}</span>
                        {project?.internal_project_code ? (
                          <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                            {project.internal_project_code}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate">
                        <SupplierNameLink
                          supplierId={row.supplier_id}
                          supplierName={supplier?.name ?? "—"}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {row.order_date
                          ? dateFormatter.format(new Date(row.order_date))
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-xs font-medium">
                          {poStatusLabel(row.status)}
                        </span>
                      </TableCell>
                      <TableCell className="text-end font-medium tabular-nums">
                        {currencyFormatter.format(Number(row.total_amount) || 0)}
                      </TableCell>
                      <TableCell className="align-top">
                        {canRecordGoodsReceipt(row.status) ? (
                          <Link
                            href={`/marker-ofek/procurement/receipt/${row.id}`}
                            className={cn(
                              buttonVariants({ size: "sm", variant: "outline" }),
                              "gap-1.5 whitespace-nowrap border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                            )}
                          >
                            <ClipboardCheck className="size-3.5" aria-hidden />
                            קליטת סחורה
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">
            CHILD · פירוט שורות הזמנה נבחרת
          </p>
          {loadingSelectedPo ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              טוען שורות הזמנה…
            </div>
          ) : selectedPoLines.length === 0 ? (
            <p className="text-sm text-muted-foreground">בחרו הזמנה להצגת שורות.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60 bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">תיאור</TableHead>
                    <TableHead className="text-start">כמות</TableHead>
                    <TableHead className="text-start">מחיר יח׳</TableHead>
                    <TableHead className="text-start">סה״כ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedPoLines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.description || "—"}</TableCell>
                      <TableCell className="tabular-nums">{line.quantity ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">
                        {currencyFormatter.format(Number(line.unit_price) || 0)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {currencyFormatter.format(Number(line.total_price) || 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">
            GRANDCHILD · היסטוריית תעודות משלוח / לוגים
          </p>
          {loadingSelectedPo ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              טוען לוגים…
            </div>
          ) : selectedPoReceipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין תעודות משלוח להזמנה שנבחרה.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60 bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">תאריך קבלה</TableHead>
                    <TableHead className="text-start">מספר תעודה</TableHead>
                    <TableHead className="text-start">נקלט ע״י</TableHead>
                    <TableHead className="text-start">הערות חוסר</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedPoReceipts.map((rec) => (
                    <TableRow key={rec.id}>
                      <TableCell>{rec.receipt_date || "—"}</TableCell>
                      <TableCell>{rec.delivery_note_number || "—"}</TableCell>
                      <TableCell>{rec.received_by || "—"}</TableCell>
                      <TableCell>{rec.shortage_notes?.trim() || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
