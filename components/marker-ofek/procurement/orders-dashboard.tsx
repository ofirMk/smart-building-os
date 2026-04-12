"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import {
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  Loader2,
  Package,
  Plus,
  Search,
  ShoppingCart,
} from "lucide-react"
import { toast } from "sonner"

import {
  contextMenuIcons,
  SmartTableContextMenuPortal,
  type SmartContextMenuAction,
} from "@/components/marker-ofek/smart-table-context-menu"
import { ProcurementCommandSubnav } from "@/components/marker-ofek/procurement/procurement-command-subnav"
import { ProcurementPageHeader } from "@/components/marker-ofek/procurement/procurement-page-header"
import { ProcurementIcon } from "@/components/marker-ofek/procurement/procurement-icon"
import { SupplierNameLink } from "@/components/marker-ofek/supplier-name-link"
import { buttonVariants } from "@/components/ui/button-variants"
import { procurementCurrencyFormatter } from "@/lib/marker-ofek/procurement/format"
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
import { Input } from "@/components/ui/input"
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

const currencyFormatter = procurementCurrencyFormatter()

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

export function OrdersDashboard() {
  const router = useRouter()
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
  const [poListSearch, setPoListSearch] = React.useState("")
  const [ctxMenu, setCtxMenu] = React.useState<{
    x: number
    y: number
    row: PoListRow
  } | null>(null)

  const filteredPoRows = React.useMemo(() => {
    const q = poListSearch.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const ent = embedOne(r.entities)?.name ?? ""
      const proj = embedOne(r.projects)
      const pn = proj ? `${proj.name} ${proj.internal_project_code}` : ""
      return `${r.po_number} ${ent} ${pn} ${r.status} ${currencyFormatter.format(r.total_amount)}`
        .toLowerCase()
        .includes(q)
    })
  }, [rows, poListSearch])

  React.useEffect(() => {
    if (filteredPoRows.length === 0) return
    if (!filteredPoRows.some((r) => r.id === selectedPoId)) {
      setSelectedPoId(filteredPoRows[0]!.id)
    }
  }, [filteredPoRows, selectedPoId])

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

  const poCtxNav = [
    { label: "קטלוג פריטים", href: "/marker-ofek/procurement/catalog" },
    { label: "קליטת חשבונית", href: "/marker-ofek/procurement/ai-import" },
    { label: "התאמות", href: "/marker-ofek/procurement/reconciliation" },
  ]

  function poContextActions(row: PoListRow): SmartContextMenuAction[] {
    const actions: SmartContextMenuAction[] = [
      {
        id: "open",
        label: "פתיחת הזמנה",
        icon: contextMenuIcons.edit,
        onSelect: () => router.push(`/marker-ofek/procurement/${row.id}`),
      },
      {
        id: "copy",
        label: "העתקת מספר הזמנה",
        icon: contextMenuIcons.duplicate,
        onSelect: () => {
          void navigator.clipboard.writeText(row.po_number).then(
            () => toast.success("המספר הועתק"),
            () => toast.error("העתקה נכשלה")
          )
        },
      },
      {
        id: "ai",
        label: "סנכרון AI (חשבונית)",
        icon: contextMenuIcons.aiSync,
        onSelect: () => router.push("/marker-ofek/procurement/invoices/new"),
      },
    ]
    if (row.status === "pending_ceo_approval") {
      actions.push({
        id: "ceo",
        label: "סטטוס: ממתין למנכ״ל",
        icon: contextMenuIcons.history,
        onSelect: () =>
          toast.message("אישור מנכ״ל", {
            description: "סכום ההזמנה לא נספר בעלות פרויקט עד לאישור.",
          }),
      })
    }
    return actions
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8 bg-white pb-10">
      <Link
        href="/marker-ofek"
        className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 transition-colors hover:text-indigo-700"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה ללוח הבקרה
      </Link>

      <ProcurementCommandSubnav />

      <div className="space-y-4">
        <ProcurementPageHeader
          icon={ShoppingCart}
          kicker="מרקר אופק — רכש"
          title="הזמנות"
          subtitle="מעקב סטטוס מהטיוטה ועד קליטה — הזמנות אחרונות, שורות ותעודות משלוח."
          primaryAction={
            <Link
              href="/marker-ofek/procurement/new"
              className={cn(
                buttonVariants({ size: "lg" }),
                "inline-flex gap-2 bg-indigo-600 text-white hover:bg-indigo-500"
              )}
            >
              <Plus className="size-4 stroke-[1.5]" aria-hidden />
              + הזמנת רכש חדשה
            </Link>
          }
        />
        <nav
          className="flex flex-wrap gap-x-4 gap-y-2 rounded-xl border border-slate-100 bg-white px-4 py-3 text-xs"
          aria-label="קישורים מהירים — רכש"
        >
          <span className="font-medium text-slate-400">כלים:</span>
          <Link
            className="text-indigo-600 hover:underline"
            href="/marker-ofek/procurement/purchase-orders/from-boq"
          >
            הזמנה מכתב כמויות
          </Link>
          <Link className="text-indigo-600 hover:underline" href="/marker-ofek/procurement/delivery-notes/new">
            תעודת משלוח
          </Link>
          <Link className="text-indigo-600 hover:underline" href="/marker-ofek/procurement/reconciliation">
            התאמות
          </Link>
          <Link className="text-indigo-600 hover:underline" href="/marker-ofek/procurement/aging">
            גילון הזדקנות
          </Link>
          <Link className="text-indigo-600 hover:underline" href="/marker-ofek/procurement/invoices/new">
            חשבונית AI
          </Link>
          <Link className="text-indigo-600 hover:underline" href="/marker-ofek/procurement/ai-import">
            קליטת חשבונית
          </Link>
          <Link className="text-indigo-600 hover:underline" href="/marker-ofek/procurement/warehouse-outgoing">
            הוצאת מחסן
          </Link>
          <Link
            className="text-indigo-600 hover:underline"
            href="/marker-ofek/procurement/reconciliation/inventory-progress"
          >
            מלאי מול ביצוע
          </Link>
        </nav>
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

      <section className="rounded-xl border border-slate-100 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex items-center gap-2 text-[#1e293b]">
            <ProcurementIcon icon={Package} className="size-5" />
            <h2 className="text-lg font-semibold tracking-tight">הזמנות אחרונות</h2>
          </div>
          <div className="relative w-full min-w-0 max-w-sm">
            <Search
              className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              value={poListSearch}
              onChange={(e) => setPoListSearch(e.target.value)}
              placeholder="חיפוש הזמנה, ספק, פרויקט…"
              className="h-9 border-slate-100 bg-white pe-9 text-sm"
              aria-label="חיפוש ברשימת הזמנות"
            />
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
              <code className="rounded border border-slate-100 px-1 font-mono text-xs">
              marker_ofek_procurement.sql
            </code>{" "}
              ב-Supabase.
            </p>
          </div>
        ) : filteredPoRows.length === 0 && rows.length > 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500 md:px-6">
            אין תוצאות לחיפוש — נסו מילה אחרת.
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-14 text-center text-sm text-muted-foreground md:px-6">
            <p>אין עדיין הזמנות רכש במערכת.</p>
            <Link
              href="/marker-ofek/procurement/new"
              className="mt-4 inline-flex text-indigo-600 underline-offset-4 hover:underline"
            >
              ליצירת הזמנה ראשונה
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto px-2 pb-4 md:px-4">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-100 bg-white hover:bg-white">
                  <TableHead className="text-start text-indigo-950">מספר הזמנה</TableHead>
                  <TableHead className="text-start text-indigo-950">פרויקט</TableHead>
                  <TableHead className="text-start text-indigo-950">ספק</TableHead>
                  <TableHead className="text-start text-indigo-950">תאריך</TableHead>
                  <TableHead className="text-start text-indigo-950">סטטוס</TableHead>
                  <TableHead className="text-end text-indigo-950">סכום כולל</TableHead>
                  <TableHead className="w-[1%] whitespace-nowrap text-start text-indigo-950">
                    פעולות
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPoRows.map((row) => {
                  const project = embedOne(row.projects)
                  const supplier = embedOne(row.entities)
                  return (
                    <TableRow
                      key={row.id}
                      onClick={() =>
                        router.push(`/marker-ofek/procurement/${row.id}`)
                      }
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setCtxMenu({ x: e.clientX, y: e.clientY, row })
                      }}
                      className={cn(
                        "cursor-pointer hover:bg-indigo-50/40",
                        selectedPoId === row.id ? "bg-indigo-50/60" : ""
                      )}
                    >
                      <TableCell className="font-mono text-sm font-medium">
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <span className="text-indigo-800">{row.po_number}</span>
                          {(row.status === "partial_receipt" ||
                            shortageNotePoIds.has(row.id)) ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900"
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
                      <TableCell
                        className="max-w-[180px] truncate"
                        onClick={(e) => e.stopPropagation()}
                      >
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
                        <span className="inline-flex rounded-md border border-slate-100 bg-white px-2 py-0.5 text-xs font-medium text-[#1e293b]">
                          {poStatusLabel(row.status)}
                        </span>
                      </TableCell>
                      <TableCell className="text-end font-currency-mono tabular-nums text-indigo-950">
                        {currencyFormatter.format(Number(row.total_amount) || 0)}
                      </TableCell>
                      <TableCell
                        className="align-top"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canRecordGoodsReceipt(row.status) ? (
                          <Link
                            href={`/marker-ofek/procurement/receipt/${row.id}`}
                            className={cn(
                              buttonVariants({ size: "sm", variant: "outline" }),
                              "gap-1.5 whitespace-nowrap border-indigo-300 text-indigo-800 hover:bg-indigo-50"
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
        <div className="rounded-xl border border-slate-100 bg-white p-4 md:p-6">
          <p className="mb-3 text-sm font-semibold text-[#1e293b]">שורות הזמנה נבחרת</p>
          {loadingSelectedPo ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              טוען שורות הזמנה…
            </div>
          ) : selectedPoLines.length === 0 ? (
            <p className="text-sm text-muted-foreground">בחרו הזמנה להצגת שורות.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-100 bg-white">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-100 bg-white hover:bg-white">
                    <TableHead className="text-start text-indigo-950">תיאור</TableHead>
                    <TableHead className="text-start text-indigo-950">כמות</TableHead>
                    <TableHead className="text-start text-indigo-950">מחיר יח׳</TableHead>
                    <TableHead className="text-start text-indigo-950">סה״כ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedPoLines.map((line) => (
                    <TableRow key={line.id} className="border-slate-100">
                      <TableCell>{line.description || "—"}</TableCell>
                      <TableCell className="font-currency-mono tabular-nums text-indigo-950">
                        {line.quantity ?? "—"}
                      </TableCell>
                      <TableCell className="font-currency-mono tabular-nums text-indigo-950">
                        {currencyFormatter.format(Number(line.unit_price) || 0)}
                      </TableCell>
                      <TableCell className="font-currency-mono tabular-nums text-indigo-950">
                        {currencyFormatter.format(Number(line.total_price) || 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-4 md:p-6">
          <p className="mb-3 text-sm font-semibold text-[#1e293b]">תעודות משלוח וקבלות</p>
          {loadingSelectedPo ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              טוען לוגים…
            </div>
          ) : selectedPoReceipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין תעודות משלוח להזמנה שנבחרה.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-100 bg-white">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-100 bg-white hover:bg-white">
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

      <SmartTableContextMenuPortal
        open={ctxMenu != null}
        x={ctxMenu?.x ?? 0}
        y={ctxMenu?.y ?? 0}
        onClose={() => setCtxMenu(null)}
        actions={ctxMenu ? poContextActions(ctxMenu.row) : []}
        navItems={poCtxNav}
      />
    </div>
  )
}
